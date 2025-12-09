import { Bid, Auction, AuctionError, ErrorCode } from '../types';
import { dataStore } from './dataStore';
import { lockManager } from './lockManager';
import { auctionService } from './auctionService';
import { websocketService } from './websocketService';
import { proxyBiddingService } from './proxyBiddingService';
import { generateId } from '../utils/generateId';
import { logger } from '../utils/logger';
import { getBidIncrement, getMinimumNextBid } from '../utils/bidLadder';

/**
 * Bidding Service
 *
 * Handles bid placement with:
 * - Atomic operations via lock manager
 * - Race condition prevention
 * - Comprehensive validation
 * - Business rule enforcement
 *
 * CRITICAL: All bid operations MUST acquire auction lock first
 */

interface PlaceBidParams {
  auctionId: string;
  userId: string;
  amount: number; // in cents
  maxBid?: number; // in cents (optional, for proxy bidding)
  autoBidStep?: number; // in cents (optional, custom increment for auto-bidding)
  _recursionDepth?: number; // internal: track recursion depth to prevent infinite loops
}

interface BidResult {
  bid: Bid;
  auction: Auction;
  isWinning: boolean;
}

class BiddingService {
  /**
   * Place a bid with full validation and race condition prevention
   *
   * This is the CRITICAL PATH for high-concurrency scenarios.
   * Multiple users bidding at the same second must be handled atomically.
   *
   * Supports proxy bidding: if maxBid is provided, the system will automatically
   * bid the minimum necessary to stay winning, up to the user's maximum.
   */
  async placeBid(params: PlaceBidParams): Promise<BidResult> {
    const { auctionId, userId, amount: inputAmount, maxBid, autoBidStep, _recursionDepth = 0 } = params;

    // Prevent infinite recursion (allow up to 50 auto-bid rounds)
    const MAX_RECURSION = 50;
    if (_recursionDepth >= MAX_RECURSION) {
      logger.warn(`Max recursion depth (${MAX_RECURSION}) reached for auction ${auctionId}. Stopping auto-bids.`);
      throw new AuctionError('Too many auto-bid rounds. Please check your settings.', ErrorCode.VALIDATION_ERROR);
    }

    const isProxyBid = maxBid !== undefined && maxBid !== null;
    const depthPrefix = '  '.repeat(_recursionDepth);
    logger.info(
      `${depthPrefix}Bid attempt [depth=${_recursionDepth}]: User ${userId} -> Auction ${auctionId} -> ` +
      `$${inputAmount / 100}${isProxyBid ? ` (max: $${maxBid / 100}, step: $${(autoBidStep || 0) / 100})` : ''}`
    );

    // Step 1: Execute the bid placement within the lock
    const result = await lockManager.withLock(auctionId, async () => {
      // 1. Get current auction state (within lock)
      const auction = auctionService.getAuction(auctionId);

      // 2. Validate auction state
      this.validateAuctionState(auction);

      // 3. Validate user (can't bid on own auction, must exist)
      this.validateUser(auction, userId);

      // 4. Determine actual bid amount using proxy bidding logic if applicable
      let actualBidAmount = inputAmount;
      let userMaxBid: number | null = null;

      if (isProxyBid) {
        userMaxBid = maxBid;

        // Calculate optimal bid using proxy logic with custom step
        const proxyResult = proxyBiddingService.calculateProxyBidAmount(
          auction,
          userId,
          maxBid,
          autoBidStep || undefined
        );

        actualBidAmount = proxyResult.actualBidAmount;

        logger.info(
          `Proxy bid calculated: $${actualBidAmount / 100} ` +
          `(user max: $${maxBid / 100}, step: $${(autoBidStep || auction.minimumBidIncrement) / 100}, would win: ${proxyResult.wouldWin})`
        );
      }

      // 5. Validate bid amount
      this.validateBidAmount(auction, actualBidAmount);

      // 6. Get existing bids to determine if this will be winning
      const existingBids = dataStore.getBidsForAuction(auctionId);
      const isWinning = this.isWinningBid(existingBids, actualBidAmount);
      const previousWinnerId = existingBids.find(b => b.isWinning)?.userId;

      // 7. Create bid
      const bid: Bid = {
        id: generateId('bid'),
        auctionId,
        userId,
        amount: actualBidAmount,
        maxBid: userMaxBid,
        autoBidStep: autoBidStep || null,
        timestamp: new Date(),
        isWinning,
        isProxyBid: isProxyBid && actualBidAmount !== inputAmount, // True if proxy adjusted the amount
        isRetracted: false,
        retractedAt: null,
        retractionReason: null,
      };

      // 8. Save bid to data store
      dataStore.createBid(bid);

      // 9. Update auction stats (current price, bid count)
      auctionService.updateAuctionStats(auctionId, actualBidAmount);

      // 10. Mark previous winning bids as no longer winning
      if (isWinning) {
        this.updatePreviousWinningBids(existingBids);
      }

      // 11. Get updated auction
      const updatedAuction = auctionService.getAuction(auctionId);

      logger.info(
        `Bid placed: ${bid.id} (${isWinning ? 'WINNING' : 'outbid'}) ` +
        `- Auction ${auctionId} now at $${actualBidAmount / 100}`
      );

      // 12. Broadcast bid placed event via WebSocket
      websocketService.broadcastBidPlaced({
        bid,
        auction: updatedAuction,
        isWinning,
        previousWinnerId,
      });

      // 13. Prepare counter-bids data (but don't process yet - lock must be released first)
      let counterBids: Array<{userId: string; amount: number; maxBid: number | null; autoBidStep: number | null}> = [];
      if (isWinning) {
        counterBids = await proxyBiddingService.triggerProxyCounterBids(
          updatedAuction,
          bid
        );
      }

      // 14. Check for buy-now completion
      const shouldTriggerBuyNow = updatedAuction.buyNowPrice !== null && actualBidAmount >= updatedAuction.buyNowPrice;

      return {
        bid,
        auction: updatedAuction,
        isWinning,
        counterBids,
        shouldTriggerBuyNow,
      };
    });

    // Step 2: Process counter-bids AFTER lock is released
    let finalAuction = result.auction;

    if (result.counterBids.length > 0) {
      logger.info(`${depthPrefix}Processing ${result.counterBids.length} counter-bid(s) after lock release`);

      for (const counterBid of result.counterBids) {
        try {
          // Recursively place the counter-bid with incremented depth
          const counterResult = await this.placeBid({
            auctionId,
            userId: counterBid.userId,
            amount: counterBid.amount,
            maxBid: counterBid.maxBid!,
            autoBidStep: counterBid.autoBidStep || undefined,
            _recursionDepth: _recursionDepth + 1,
          });

          logger.info(
            `${depthPrefix}✅ Proxy counter-bid placed: User ${counterBid.userId} auto-bid $${counterBid.amount / 100}`
          );

          // Update our reference to the auction
          finalAuction = counterResult.auction;
        } catch (error) {
          logger.warn(`${depthPrefix}❌ Proxy counter-bid failed for user ${counterBid.userId}:`, error);
        }
      }
    }

    // Step 3: Trigger buy-now completion if needed
    if (result.shouldTriggerBuyNow) {
      const endedAuction = await auctionService.endAuction(auctionId);
      finalAuction = endedAuction;

      websocketService.broadcastAuctionEnded({
        auction: endedAuction,
        winnerId: endedAuction.winnerId,
        finalPrice: endedAuction.currentPrice,
      });
    }

    return {
      bid: result.bid,
      auction: finalAuction,
      isWinning: result.isWinning,
    };
  }

  /**
   * Get all bids for an auction
   */
  getBidsForAuction(auctionId: string): Bid[] {
    // Verify auction exists
    auctionService.getAuction(auctionId);
    return dataStore.getBidsForAuction(auctionId);
  }

  /**
   * Get all bids by a user
   */
  getBidsByUser(userId: string): Bid[] {
    return dataStore.getBidsByUser(userId);
  }

  /**
   * Get current winning bid for an auction
   */
  getWinningBid(auctionId: string): Bid | null {
    const bids = this.getBidsForAuction(auctionId);
    return bids.find(bid => bid.isWinning) || null;
  }

  /**
   * Get bid history for an auction (sorted by timestamp DESC)
   */
  getBidHistory(auctionId: string): Bid[] {
    const bids = this.getBidsForAuction(auctionId);
    // Return copy sorted by timestamp (newest first)
    return [...bids].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Check if user has already bid on auction
   */
  hasUserBid(auctionId: string, userId: string): boolean {
    const bids = this.getBidsForAuction(auctionId);
    return bids.some(bid => bid.userId === userId);
  }

  /**
   * Get user's highest bid for an auction
   */
  getUserHighestBid(auctionId: string, userId: string): Bid | null {
    const bids = this.getBidsForAuction(auctionId);
    const userBids = bids.filter(bid => bid.userId === userId);

    if (userBids.length === 0) {
      return null;
    }

    // Bids are already sorted by amount DESC
    return userBids[0];
  }

  /**
   * Calculate minimum valid bid amount for an auction
   * Uses the dynamic bid ladder instead of fixed increment
   */
  getMinimumBidAmount(auctionId: string): number {
    const auction = auctionService.getAuction(auctionId);
    return getMinimumNextBid(auction.currentPrice);
  }

  /**
   * Get the current bid increment for an auction
   * Based on Tradera/eBay-style bid ladder
   */
  getCurrentBidIncrement(auctionId: string): number {
    const auction = auctionService.getAuction(auctionId);
    return getBidIncrement(auction.currentPrice);
  }

  // ==================== VALIDATION HELPERS ====================

  /**
   * Validate auction is in correct state for bidding
   */
  private validateAuctionState(auction: Auction): void {
    // Check if auction can accept bids
    if (!auctionService.canAcceptBids(auction)) {
      const reason = this.getAuctionNotAcceptingReason(auction);
      throw new AuctionError(reason, ErrorCode.INVALID_AUCTION_STATE);
    }

    // Double-check timing (race condition safety)
    const now = new Date();
    if (now < auction.startTime) {
      throw new AuctionError('Auction has not started yet', ErrorCode.AUCTION_NOT_STARTED);
    }

    if (now >= auction.endTime) {
      throw new AuctionError('Auction has already ended', ErrorCode.AUCTION_ENDED);
    }

    if (auction.buyNowPrice !== null && auction.currentPrice >= auction.buyNowPrice) {
      throw new AuctionError('Auction already sold via Buy Now price', ErrorCode.AUCTION_ENDED);
    }
  }

  /**
   * Get human-readable reason why auction is not accepting bids
   */
  private getAuctionNotAcceptingReason(auction: Auction): string {
    const now = new Date();

    if (now < auction.startTime) {
      return 'Auction has not started yet';
    }

    if (now >= auction.endTime) {
      return 'Auction has already ended';
    }

    switch (auction.status) {
      case 'PENDING':
        return 'Auction is pending';
      case 'ENDED':
        return 'Auction has ended';
      default:
        return 'Auction is not accepting bids';
    }
  }

  /**
   * Validate bid amount meets requirements
   * Uses dynamic bid ladder for minimum increment validation
   */
  private validateBidAmount(auction: Auction, amount: number): void {
    // Amount must be positive
    if (amount <= 0) {
      throw new AuctionError('Bid amount must be positive', ErrorCode.VALIDATION_ERROR);
    }

    // Use bid ladder to calculate minimum bid
    const minimumBid = getMinimumNextBid(auction.currentPrice);
    const bidIncrement = getBidIncrement(auction.currentPrice);

    if (amount < minimumBid) {
      throw new AuctionError(
        `Bid must be at least $${minimumBid / 100} ` +
        `(current price: $${auction.currentPrice / 100} + increment: $${bidIncrement / 100})`,
        ErrorCode.BID_TOO_LOW
      );
    }

    // Sanity check: amount must be reasonable (< $1 million)
    const MAX_BID = 100_000_000; // 1 million dollars in cents
    if (amount > MAX_BID) {
      throw new AuctionError(
        'Bid amount exceeds maximum allowed ($1,000,000)',
        ErrorCode.VALIDATION_ERROR
      );
    }
  }

  /**
   * Validate user can place bid
   */
  private validateUser(auction: Auction, userId: string): void {
    // User must exist
    const user = dataStore.getUser(userId);
    if (!user) {
      throw new AuctionError('User not found', ErrorCode.USER_NOT_FOUND);
    }

    // User cannot bid on their own auction
    if (auction.createdBy === userId) {
      throw new AuctionError(
        'Cannot bid on your own auction',
        ErrorCode.VALIDATION_ERROR
      );
    }
  }

  /**
   * Determine if this bid amount would be winning
   */
  private isWinningBid(existingBids: Bid[], amount: number): boolean {
    if (existingBids.length === 0) {
      return true; // First bid is always winning
    }

    // Check if amount is higher than all existing bids
    const highestBid = existingBids[0]; // Bids are sorted by amount DESC
    return amount > highestBid.amount;
  }

  /**
   * Mark all previous winning bids as no longer winning
   */
  private updatePreviousWinningBids(existingBids: Bid[]): void {
    existingBids.forEach(bid => {
      if (bid.isWinning) {
        const updated: Bid = { ...bid, isWinning: false };
        dataStore.updateBid(updated);
      }
    });
  }
}

// Export singleton instance
export const biddingService = new BiddingService();
