import { Bid, Auction } from '../types';
import { dataStore } from './dataStore';
import { logger } from '../utils/logger';
import { getBidIncrement, getMinimumNextBid } from '../utils/bidLadder';

/**
 * Proxy Bidding Service
 *
 * Implements automatic bidding logic where:
 * - Users set a maximum bid
 * - System automatically bids the minimum necessary to stay winning
 * - When outbid, system auto-bids up to user's maximum
 *
 * This creates a second-price auction mechanism similar to eBay
 */

interface ProxyBidResult {
  actualBidAmount: number;      // The amount actually bid
  isProxyActivated: boolean;    // Whether proxy bidding was used
  wouldWin: boolean;            // Whether this bid would win
  nextIncrementNeeded: number;  // Next amount needed to win
}

class ProxyBiddingService {
  /**
   * Calculate optimal bid amount based on Tradera proxy bidding logic
   *
   * TRADERA LOGIC:
   * - When you place a max bid, the system looks at ALL other users' max bids
   * - You bid the MINIMUM needed to beat the highest competing MAX BID
   * - NO incremental counter-bidding chains
   *
   * Example:
   * - Auction starts at 100
   * - User A sets max 150 → actual bid: 110 (minimum needed)
   * - User B sets max 200 → actual bid: 160 (A's max 150 + 1 increment = 160)
   * - No further auto-bidding because B's max (200) > A's max (150)
   *
   * The key: Compare MAX BIDS, not actual bid amounts
   */
  calculateProxyBidAmount(
    auction: Auction,
    userId: string,
    userMaxBid: number,
    customStep?: number
  ): ProxyBidResult {
    const allBids = dataStore.getBidsForAuction(auction.id);

    // Filter out user's own bids to find competing bids
    const competingBids = allBids.filter(bid => bid.userId !== userId);

    // If no competing bids, bid the minimum required (like Tradera)
    if (competingBids.length === 0) {
      const minRequired = getMinimumNextBid(auction.currentPrice);

      // Bid only the minimum needed, not the full max
      const actualBid = Math.min(userMaxBid, minRequired);

      return {
        actualBidAmount: actualBid,
        isProxyActivated: true,
        wouldWin: actualBid >= minRequired,
        nextIncrementNeeded: minRequired,
      };
    }

    // CRITICAL: Find the highest MAX BID from competitors (not highest actual bid)
    const competingMaxBids = competingBids
      .filter(bid => bid.maxBid !== null)
      .map(bid => bid.maxBid!);

    // If no competing max bids exist, just beat the current price
    if (competingMaxBids.length === 0) {
      const minRequired = getMinimumNextBid(auction.currentPrice);
      const actualBid = Math.min(userMaxBid, minRequired);

      return {
        actualBidAmount: actualBid,
        isProxyActivated: true,
        wouldWin: actualBid >= minRequired,
        nextIncrementNeeded: minRequired,
      };
    }

    // Get the highest competing MAX BID
    const highestCompetingMaxBid = Math.max(...competingMaxBids);

    // Calculate the increment based on the highest competing max bid
    const bidIncrement = customStep || getBidIncrement(highestCompetingMaxBid);

    // TRADERA LOGIC: Bid one increment above the highest competing MAX BID
    const amountToWin = highestCompetingMaxBid + bidIncrement;

    // If user's max bid can beat the highest competing max bid
    if (userMaxBid >= amountToWin) {
      const nextIncrement = getBidIncrement(amountToWin);

      return {
        actualBidAmount: amountToWin,
        isProxyActivated: true,
        wouldWin: true,
        nextIncrementNeeded: amountToWin + nextIncrement,
      };
    }

    // User's max bid isn't high enough to beat the highest competing max bid
    // Bid their maximum anyway (they'll be outbid)
    const nextIncrement = getBidIncrement(highestCompetingMaxBid);

    return {
      actualBidAmount: userMaxBid,
      isProxyActivated: true,
      wouldWin: false,
      nextIncrementNeeded: highestCompetingMaxBid + nextIncrement,
    };
  }

  /**
   * Check if proxy bidding should trigger for existing bidders
   *
   * TRADERA LOGIC: Counter-bids should NOT trigger in an incremental chain.
   * When someone places a max bid, the system calculates the bid amount based on
   * the highest competing MAX BID, and that's it. No automatic counter-bidding.
   *
   * The proxy calculation already handles this by comparing max bids directly.
   * This method is kept for compatibility but returns empty array.
   */
  async triggerProxyCounterBids(
    _auction: Auction,
    newBid: Bid
  ): Promise<Array<{userId: string; amount: number; maxBid: number | null; autoBidStep: number | null}>> {
    // TRADERA BEHAVIOR: No automatic counter-bid chains
    // When B places max bid of 200 and beats A's max of 150,
    // A does NOT automatically counter-bid. The bidding stops.
    //
    // A would only bid again if A manually increases their max bid.

    logger.info(
      `🔍 Tradera-style bidding: No counter-bids triggered for bid $${newBid.amount / 100} by ${newBid.userId}`
    );

    return []; // No counter-bids in Tradera system
  }

  /**
   * Get user's current max bid for an auction
   */
  getUserMaxBid(auctionId: string, userId: string): number | null {
    const userBids = dataStore.getBidsForAuction(auctionId)
      .filter(bid => bid.userId === userId);

    if (userBids.length === 0) {
      return null;
    }

    // Find the most recent max bid
    const bidsWithMax = userBids.filter(bid => bid.maxBid !== null);
    if (bidsWithMax.length === 0) {
      return null;
    }

    // Return the highest maxBid
    return Math.max(...bidsWithMax.map(bid => bid.maxBid!));
  }

  /**
   * Check if user's current max bid needs updating
   */
  shouldUpdateMaxBid(auctionId: string, userId: string, newMaxBid: number): boolean {
    const currentMaxBid = this.getUserMaxBid(auctionId, userId);

    if (currentMaxBid === null) {
      return true; // No existing max bid
    }

    return newMaxBid > currentMaxBid; // Only update if increasing
  }

}

// Export singleton instance
export const proxyBiddingService = new ProxyBiddingService();
