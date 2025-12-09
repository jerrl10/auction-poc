import { Bid, Auction, AuctionError, ErrorCode, BidRetractionReason } from '../types';
import { dataStore } from './dataStore';
import { auctionService } from './auctionService';
import { websocketService } from './websocketService';
import { logger } from '../utils/logger';

/**
 * Bid Retraction Service
 *
 * Handles bid cancellation/retraction following real-world auction platform rules.
 *
 * Rules (based on eBay):
 * 1. Can retract if auction has >12 hours remaining and you placed bid <1 hour ago
 * 2. Can retract within 1 hour of placing bid if auction ends in <12 hours
 * 3. Cannot retract if you are not the highest bidder (to prevent gaming)
 * 4. Must provide a valid reason
 * 5. Retracting a bid reinstates the previous winning bid
 * 6. User must be the owner of the bid
 */

interface RetractBidParams {
  bidId: string;
  userId: string;
  reason: BidRetractionReason;
}

class BidRetractionService {
  // Time windows (in milliseconds)
  private readonly LONG_AUCTION_THRESHOLD = 12 * 60 * 60 * 1000; // 12 hours
  private readonly RETRACTION_WINDOW = 60 * 60 * 1000; // 1 hour

  /**
   * Retract/cancel a bid
   *
   * This implements eBay-style bid retraction rules
   */
  async retractBid(params: RetractBidParams): Promise<{
    bid: Bid;
    auction: Auction;
    previousWinner: Bid | null;
  }> {
    const { bidId, userId, reason } = params;

    logger.info(`Bid retraction attempt: ${bidId} by user ${userId}, reason: ${reason}`);

    // 1. Get the bid
    const bid = dataStore.getBid(bidId);
    if (!bid) {
      throw new AuctionError(
        'Bid not found',
        ErrorCode.BID_NOT_FOUND,
        404
      );
    }

    // 2. Verify ownership
    if (bid.userId !== userId) {
      throw new AuctionError(
        'You can only retract your own bids',
        ErrorCode.BID_RETRACTION_NOT_ALLOWED,
        403
      );
    }

    // 3. Check if already retracted
    if (bid.isRetracted) {
      throw new AuctionError(
        'This bid has already been retracted',
        ErrorCode.BID_ALREADY_RETRACTED,
        400
      );
    }

    // 4. Get auction
    const auction = auctionService.getAuction(bid.auctionId);

    // 5. Check auction state
    if (auction.status === 'ENDED') {
      throw new AuctionError(
        'Cannot retract bid on ended auction',
        ErrorCode.BID_RETRACTION_NOT_ALLOWED,
        400
      );
    }

    // 6. Validate retraction eligibility based on time rules
    this.validateRetractionEligibility(bid, auction);

    // 7. Check if bid is winning (can only retract if winning)
    if (!bid.isWinning) {
      throw new AuctionError(
        'Can only retract your winning bid. Non-winning bids cannot be retracted.',
        ErrorCode.BID_RETRACTION_NOT_ALLOWED,
        400
      );
    }

    // 8. Mark bid as retracted
    const retractedBid: Bid = {
      ...bid,
      isRetracted: true,
      retractedAt: new Date(),
      retractionReason: reason,
      isWinning: false, // No longer winning
    };

    dataStore.updateBid(retractedBid);

    // 9. Find previous highest non-retracted bid
    const allBids = dataStore.getAuctionBids(bid.auctionId, true); // Include retracted
    const nonRetractedBids = allBids
      .filter(b => !b.isRetracted && b.id !== bidId)
      .sort((a, b) => {
        if (b.amount !== a.amount) {
          return b.amount - a.amount;
        }
        return a.timestamp.getTime() - b.timestamp.getTime();
      });

    let previousWinner: Bid | null = null;

    if (nonRetractedBids.length > 0) {
      // Mark new winner
      previousWinner = nonRetractedBids[0];
      const updatedPreviousWinner: Bid = {
        ...previousWinner,
        isWinning: true,
      };
      dataStore.updateBid(updatedPreviousWinner);
      previousWinner = updatedPreviousWinner;

      // Update auction price to new winning bid
      auctionService.updateAuctionStats(auction.id, previousWinner.amount);
    } else {
      // No other bids, reset to starting price
      const resetAuction: Auction = {
        ...auction,
        currentPrice: auction.startingPrice,
        bidCount: 0,
        reserveMet: auction.reservePrice === null || auction.startingPrice >= auction.reservePrice,
      };
      dataStore.updateAuction(resetAuction);
    }

    const updatedAuction = auctionService.getAuction(auction.id);

    logger.info(
      `✅ Bid retracted: ${bidId} ($${bid.amount / 100}). ` +
      `New winner: ${previousWinner ? `${previousWinner.userId} ($${previousWinner.amount / 100})` : 'None'}`
    );

    // Broadcast bid retraction event via WebSocket
    websocketService.broadcastBidRetracted({
      bid: retractedBid,
      auction: updatedAuction,
      previousWinner,
      retractedBy: userId,
    });

    return {
      bid: retractedBid,
      auction: updatedAuction,
      previousWinner,
    };
  }

  /**
   * Validate if bid can be retracted based on time rules
   *
   * eBay rules:
   * - If auction ends in >12 hours: Can retract if bid placed <1 hour ago
   * - If auction ends in <12 hours: Can retract within 1 hour of placing bid
   */
  private validateRetractionEligibility(bid: Bid, auction: Auction): void {
    const now = new Date();
    const timeSinceBid = now.getTime() - bid.timestamp.getTime();
    const timeUntilEnd = auction.endTime.getTime() - now.getTime();

    // Case 1: Auction ends in more than 12 hours
    if (timeUntilEnd > this.LONG_AUCTION_THRESHOLD) {
      if (timeSinceBid > this.RETRACTION_WINDOW) {
        throw new AuctionError(
          'Can only retract bids placed within the last 1 hour when auction has more than 12 hours remaining',
          ErrorCode.BID_RETRACTION_TIME_EXPIRED,
          400,
          {
            timeSinceBid: Math.floor(timeSinceBid / 1000),
            timeUntilEnd: Math.floor(timeUntilEnd / 1000),
            maxRetractionWindow: Math.floor(this.RETRACTION_WINDOW / 1000),
          }
        );
      }
    }
    // Case 2: Auction ends in less than 12 hours
    else {
      if (timeSinceBid > this.RETRACTION_WINDOW) {
        throw new AuctionError(
          'Can only retract bids placed within the last 1 hour',
          ErrorCode.BID_RETRACTION_TIME_EXPIRED,
          400,
          {
            timeSinceBid: Math.floor(timeSinceBid / 1000),
            timeUntilEnd: Math.floor(timeUntilEnd / 1000),
            maxRetractionWindow: Math.floor(this.RETRACTION_WINDOW / 1000),
          }
        );
      }
    }
  }

  /**
   * Check if a bid can be retracted (without actually retracting)
   */
  canRetractBid(bidId: string, userId: string): {
    canRetract: boolean;
    reason: string | null;
  } {
    try {
      const bid = dataStore.getBid(bidId);
      if (!bid) {
        return { canRetract: false, reason: 'Bid not found' };
      }

      if (bid.userId !== userId) {
        return { canRetract: false, reason: 'Not your bid' };
      }

      if (bid.isRetracted) {
        return { canRetract: false, reason: 'Already retracted' };
      }

      const auction = auctionService.getAuction(bid.auctionId);

      if (auction.status === 'ENDED') {
        return { canRetract: false, reason: 'Auction has ended' };
      }

      if (!bid.isWinning) {
        return { canRetract: false, reason: 'Only winning bids can be retracted' };
      }

      // Check time eligibility
      const now = new Date();
      const timeSinceBid = now.getTime() - bid.timestamp.getTime();
      const timeUntilEnd = auction.endTime.getTime() - now.getTime();

      if (timeUntilEnd > this.LONG_AUCTION_THRESHOLD) {
        if (timeSinceBid > this.RETRACTION_WINDOW) {
          return {
            canRetract: false,
            reason: `Can only retract bids placed within last hour (bid placed ${Math.floor(timeSinceBid / 60000)} minutes ago)`,
          };
        }
      } else {
        if (timeSinceBid > this.RETRACTION_WINDOW) {
          return {
            canRetract: false,
            reason: `Can only retract bids placed within last hour (bid placed ${Math.floor(timeSinceBid / 60000)} minutes ago)`,
          };
        }
      }

      return { canRetract: true, reason: null };
    } catch (error) {
      return {
        canRetract: false,
        reason: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get retracted bids for an auction
   */
  getRetractedBids(auctionId: string): Bid[] {
    const allBids = dataStore.getAuctionBids(auctionId, true);
    return allBids.filter(bid => bid.isRetracted);
  }

  /**
   * Get retraction statistics
   */
  getStats(): {
    totalRetractions: number;
    retractionsByReason: Record<BidRetractionReason, number>;
  } {
    const allBids: Bid[] = [];
    const allAuctions = dataStore.getAllAuctions();

    allAuctions.forEach(auction => {
      const bids = dataStore.getAuctionBids(auction.id, true);
      allBids.push(...bids);
    });

    const retractedBids = allBids.filter(bid => bid.isRetracted);

    const retractionsByReason: Record<BidRetractionReason, number> = {
      [BidRetractionReason.TYPO]: 0,
      [BidRetractionReason.ITEM_DESCRIPTION_CHANGED]: 0,
      [BidRetractionReason.CANNOT_CONTACT_SELLER]: 0,
      [BidRetractionReason.OTHER]: 0,
    };

    retractedBids.forEach(bid => {
      if (bid.retractionReason) {
        retractionsByReason[bid.retractionReason]++;
      }
    });

    return {
      totalRetractions: retractedBids.length,
      retractionsByReason,
    };
  }
}

// Export singleton instance
export const bidRetractionService = new BidRetractionService();
