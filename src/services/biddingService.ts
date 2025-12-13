import { Bid, Auction, AuctionError, ErrorCode } from '../types';
import { dataStore } from './dataStore';
import { lockManager } from './lockManager';
import { auctionService } from './auctionService';
import { websocketService } from './websocketService';
import { proxyBiddingService } from './proxyBiddingService';
import { generateId } from '../utils/generateId';
import { logger } from '../utils/logger';
import { getBidIncrement } from '../utils/bidIncrement';

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
      let bidMessage: string | undefined = undefined;
      let isMaxBidReached: boolean = false;
      let competitorBids: Array<any> = [];

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
        bidMessage = proxyResult.message;
        isMaxBidReached = proxyResult.isMaxBidReached || false;
        competitorBids = proxyResult.competitorBids || [];

        logger.info(
          `Proxy bid calculated: $${actualBidAmount / 100} ` +
          `(user max: $${maxBid / 100}, step: $${(autoBidStep || getBidIncrement(auction.currentPrice)) / 100}, would win: ${proxyResult.wouldWin})` +
          (bidMessage ? ` - Message: ${bidMessage}` : '')
        );
      }

      // 5. Validate bid amount
      this.validateBidAmount(auction, actualBidAmount);

      // 6. Place competitor bids first (if any) - these are auto-bids for users whose max was reached
      const placedCompetitorBids: Bid[] = [];
      if (competitorBids.length > 0) {
        logger.info(`📊 Placing ${competitorBids.length} competitor max-reached bid(s) before user's bid`);

        for (const competitorBid of competitorBids) {
          const existingBids = dataStore.getBidsForAuction(auctionId);
          const compIsWinning = this.isWinningBid(existingBids, competitorBid.amount);

          const compBid: Bid = {
            id: generateId('bid'),
            auctionId,
            userId: competitorBid.userId,
            amount: competitorBid.amount,
            maxBid: competitorBid.maxBid,
            autoBidStep: autoBidStep || null,
            timestamp: new Date(),
            isWinning: compIsWinning,
            isProxyBid: true,
            isRetracted: false,
            retractedAt: null,
            retractionReason: null,
            message: competitorBid.message,
            isMaxBidReached: competitorBid.isMaxBidReached,
          };

          dataStore.createBid(compBid);

          // Update auction stats (price only if winning)
          if (compIsWinning) {
            auctionService.updateAuctionStats(auctionId, competitorBid.amount);
            const existingBidsBeforeUpdate = dataStore.getBidsForAuction(auctionId);
            this.updatePreviousWinningBids(existingBidsBeforeUpdate.filter(b => b.id !== compBid.id));
          } else {
            // Still increment bid count even if not winning
            const currentAuction = auctionService.getAuction(auctionId);
            const updated: Auction = {
              ...currentAuction,
              bidCount: currentAuction.bidCount + 1,
            };
            dataStore.updateAuction(updated);
          }

          placedCompetitorBids.push(compBid);

          logger.info(`📢 Competitor max-reached bid: User ${competitorBid.userId} -> $${competitorBid.amount / 100} (${competitorBid.message})`);
        }
      }

      // 7. Get existing bids to determine if this will be winning
      const existingBids = dataStore.getBidsForAuction(auctionId);
      // Exclude user's own bids when determining if new bid is winning
      // This allows leader to raise their max without losing leadership (Tradera Spec Scenario 5)
      const competingBids = existingBids.filter(b => b.userId !== userId);
      const isWinning = this.isWinningBid(competingBids, actualBidAmount);
      const previousWinnerId = existingBids.find(b => b.isWinning)?.userId;

      // 8. Create user's bid
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
        message: bidMessage,
        isMaxBidReached,
      };

      // 9. Save user's bid to data store
      dataStore.createBid(bid);

      // 10. Update auction stats (current price only if winning, bid count always)
      // TRADERA SPEC: Price only changes when a new winning bid is placed
      if (isWinning) {
        auctionService.updateAuctionStats(auctionId, actualBidAmount);
      } else {
        // Still increment bid count even if not winning
        const auction = auctionService.getAuction(auctionId);
        const updated: Auction = {
          ...auction,
          bidCount: auction.bidCount + 1,
        };
        dataStore.updateAuction(updated);
      }

      // 11. Mark previous winning bids as no longer winning
      if (isWinning) {
        const bidsToUpdate = existingBids.filter(b => b.id !== bid.id);
        this.updatePreviousWinningBids(bidsToUpdate);
      }

      // 12. Get updated auction
      let updatedAuction = auctionService.getAuction(auctionId);

      // 13. Buy Now Removal Logic (Tradera Spec Scenario 3)
      // Rule 1: Auction WITHOUT reserve - remove Buy Now on first bid
      // Rule 2: Auction WITH reserve - remove Buy Now when reserve is met
      if (updatedAuction.buyNowPrice !== null) {
        const hasReservePrice = updatedAuction.reservePrice !== null && updatedAuction.reservePrice > 0;
        let shouldRemoveBuyNow = false;

        if (!hasReservePrice) {
          // No reserve: Remove Buy Now on first bid (any bid removes it)
          shouldRemoveBuyNow = true;
          logger.info(`🛒 Buy Now removed: First bid placed (no reserve price)`);
        } else if (updatedAuction.reserveMet) {
          // Has reserve: Remove Buy Now when reserve is met
          shouldRemoveBuyNow = true;
          logger.info(
            `🛒 Buy Now removed: Reserve price met ` +
            `(reserve: $${updatedAuction.reservePrice! / 100}, current: $${updatedAuction.currentPrice / 100})`
          );
        }

        if (shouldRemoveBuyNow) {
          const auctionWithoutBuyNow: Auction = {
            ...updatedAuction,
            buyNowPrice: null,
          };
          dataStore.updateAuction(auctionWithoutBuyNow);
          updatedAuction = auctionWithoutBuyNow;
        }
      }

      logger.info(
        `Bid placed: ${bid.id} (${isWinning ? 'WINNING' : 'outbid'}) ` +
        `- Auction ${auctionId} now at $${actualBidAmount / 100}`
      );

      // 14. Broadcast competitor max-reached bids first
      for (const compBid of placedCompetitorBids) {
        websocketService.broadcastBidPlaced({
          bid: compBid,
          auction: updatedAuction,
          isWinning: compBid.isWinning,
          previousWinnerId: undefined,
        });
      }

      // 15. Broadcast user's bid placed event via WebSocket
      websocketService.broadcastBidPlaced({
        bid,
        auction: updatedAuction,
        isWinning,
        previousWinnerId,
      });

      return {
        bid,
        auction: updatedAuction,
        isWinning,
        competitorBids: placedCompetitorBids,
      };
    });

    // Step 2: Return final auction state
    // Note: Buy Now is manually triggered via separate endpoint, not automatically
    return {
      bid: result.bid,
      auction: result.auction,
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
   */
  getMinimumBidAmount(auctionId: string): number {
    const auction = auctionService.getAuction(auctionId);
    return auction.currentPrice + getBidIncrement(auction.currentPrice);
  }

  /**
   * Get the current bid increment for an auction
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
   */
  private validateBidAmount(auction: Auction, amount: number): void {
    // Amount must be positive
    if (amount <= 0) {
      throw new AuctionError('Bid amount must be positive', ErrorCode.VALIDATION_ERROR);
    }

    // Calculate minimum bid using dynamic increment
    const bidIncrement = getBidIncrement(auction.currentPrice);
    const minimumBid = auction.currentPrice + bidIncrement;

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
