import { Bid, Auction } from '../types';
import { dataStore } from './dataStore';
import { logger } from '../utils/logger';
import { ensureValidCents } from '../utils/currency';
import { getBidIncrement } from '../utils/bidIncrement';

/**
 * Proxy Bidding Service - Tradera-Style Second-Price Auctions
 *
 * CORE CONCEPT: Second-Price Logic
 * ================================
 * Winner pays: second-highest max bid + increment (NOT their own max bid)
 *
 * This is the fundamental principle of Tradera/eBay proxy bidding:
 * - Users enter their TRUE maximum willingness to pay
 * - System automatically bids the MINIMUM needed to win
 * - Winner pays just enough to beat the second-place bidder
 *
 * IMPLEMENTATION:
 * ===============
 * When User B places a max bid higher than User A's max:
 * 1. System creates an auto-bid for User A at their MAX (shows "max reached")
 * 2. System creates a winning bid for User B at: A's max + increment
 * 3. The visible price becomes: A's max + increment (second-price!)
 * 4. User B wins but pays less than their max (incentivizes honest bidding)
 *
 * EXAMPLE FLOW:
 * =============
 * Starting: $100, increment: $10
 * - User A max $200 → visible bid: $110 (no competition, bid minimum)
 * - User B max $300 → User A auto-bids to $200 (max reached), User B bids $210
 *   Result: B wins, pays $210 (not $300!)
 *
 * BENEFITS:
 * =========
 * - Encourages bidders to enter their true maximum
 * - Prevents "bid sniping" strategy from being effective
 * - Fair price discovery through competitive bidding
 * - Winners pay market price, not their private valuation
 */

interface ProxyBidResult {
  actualBidAmount: number;      // The amount this user will bid
  isProxyActivated: boolean;    // Whether proxy bidding was used
  wouldWin: boolean;            // Whether this bid would win
  nextIncrementNeeded: number;  // Next amount needed to win
  message?: string;             // Optional message for the user
  isMaxBidReached?: boolean;    // True if user's max bid was reached
  competitorBids?: Array<{      // Bids that should be auto-placed for competitors
    userId: string;
    amount: number;
    maxBid: number;
    message: string;
    isMaxBidReached: boolean;
  }>;
}

class ProxyBiddingService {
  /**
   * Calculate proxy bid with transparent max bid notifications
   *
   * NEW IMPROVED LOGIC:
   * - When placing a max bid, show when competitors' max bids are reached
   * - Losing bidder gets auto-bid to their max with notification
   * - Winner bids one increment above loser's max
   * - Provides much better user experience and transparency
   *
   * Example:
   * - Starting: $100
   * - User1 max $160 → bids $110 (no competition)
   * - User2 max $200 → User1 auto-bids to $160 (msg: "max reached"), User2 bids $170
   * - User1 max $240 → User2 auto-bids to $200 (msg: "max reached"), User1 bids $210
   */
  calculateProxyBidAmount(
    auction: Auction,
    userId: string,
    userMaxBid: number,
    customStep?: number
  ): ProxyBidResult {
    const allBids = dataStore.getBidsForAuction(auction.id);
    // Use dynamic bid increment based on current price, or custom step if provided
    const bidIncrement = customStep || getBidIncrement(auction.currentPrice);

    // Filter out user's own bids to find competing bids
    const competingBids = allBids.filter(bid => bid.userId !== userId);

    // If no competing bids, bid the minimum required
    if (competingBids.length === 0) {
      const minRequired = ensureValidCents(auction.currentPrice + bidIncrement);
      let actualBid = ensureValidCents(Math.min(userMaxBid, minRequired));

      // First bidder: check if max meets reserve (Tradera Spec)
      // Note: First bid does NOT jump to reserve, it stays at start + increment
      // Reserve is only checked for subsequent bids
      const isMaxReached = actualBid === userMaxBid && actualBid < minRequired;

      return {
        actualBidAmount: actualBid,
        isProxyActivated: true,
        wouldWin: actualBid >= minRequired,
        nextIncrementNeeded: ensureValidCents(actualBid + bidIncrement),
        message: isMaxReached ? `You've placed your max bid of $${(userMaxBid / 100).toFixed(2)}` : undefined,
        isMaxBidReached: isMaxReached,
        competitorBids: [],
      };
    }

    // Find the highest competing MAX BID
    const competingMaxBids = competingBids
      .filter(bid => bid.maxBid !== null)
      .map(bid => ({ userId: bid.userId, maxBid: bid.maxBid! }));

    // If no competing max bids exist, just beat the current price
    if (competingMaxBids.length === 0) {
      const minRequired = ensureValidCents(auction.currentPrice + bidIncrement);
      const actualBid = ensureValidCents(Math.min(userMaxBid, minRequired));
      const isMaxReached = actualBid === userMaxBid && actualBid < minRequired;

      return {
        actualBidAmount: actualBid,
        isProxyActivated: true,
        wouldWin: actualBid >= minRequired,
        nextIncrementNeeded: ensureValidCents(actualBid + bidIncrement),
        message: isMaxReached ? `You've placed your max bid of $${(userMaxBid / 100).toFixed(2)}` : undefined,
        isMaxBidReached: isMaxReached,
        competitorBids: [],
      };
    }

    // Get the highest competing max bid
    const highestCompetitor = competingMaxBids.reduce((highest, current) =>
      current.maxBid > highest.maxBid ? current : highest
    );

    // ============================================================================
    // SECOND-PRICE LOGIC IMPLEMENTATION (Core of Tradera bidding)
    // ============================================================================
    // When user's max bid beats competitor's max bid:
    // 1. Competitor bids their full max amount (transparent, shows "max reached")
    // 2. User bids: competitor's max + increment (second-price!)
    // 3. User wins but pays LESS than their max bid
    //
    // RESERVE PRICE HANDLING (Tradera Spec Scenario 3):
    // - When winner's max bid meets/exceeds reserve
    // - And calculated price < reserve
    // - Jump visible price to reserve
    //
    // This implements the Vickrey auction principle where winner pays the
    // second-highest price, encouraging truthful bidding.
    // ============================================================================
    if (userMaxBid > highestCompetitor.maxBid) {
      // User wins - competitor bids their max, user bids one increment above
      const competitorMaxReachedBid = {
        userId: highestCompetitor.userId,
        amount: ensureValidCents(highestCompetitor.maxBid),
        maxBid: ensureValidCents(highestCompetitor.maxBid),
        message: `Your max bid of $${(highestCompetitor.maxBid / 100).toFixed(2)} has been reached`,
        isMaxBidReached: true,
      };

      // SECOND-PRICE FORMULA: winner pays (loser's max + increment)
      let userBidAmount = ensureValidCents(highestCompetitor.maxBid + bidIncrement);

      // RESERVE PRICE CHECK (Tradera Spec):
      // If winner's max meets/exceeds reserve, and calculated price < reserve,
      // jump visible price to reserve
      const hasReservePrice = auction.reservePrice !== null && auction.reservePrice > 0;
      if (hasReservePrice && userMaxBid >= auction.reservePrice!) {
        if (userBidAmount < auction.reservePrice!) {
          userBidAmount = ensureValidCents(auction.reservePrice!);
          logger.info(
            `🔒 Reserve price triggered: User max (${userMaxBid / 100}) >= reserve (${auction.reservePrice! / 100}), ` +
            `calculated price (${(highestCompetitor.maxBid + bidIncrement) / 100}) < reserve, ` +
            `jumping to reserve: ${userBidAmount / 100}`
          );
        }
      }

      return {
        actualBidAmount: userBidAmount,
        isProxyActivated: true,
        wouldWin: true,
        nextIncrementNeeded: ensureValidCents(userBidAmount + bidIncrement),
        message: undefined, // User is winning, no special message
        isMaxBidReached: false,
        competitorBids: [competitorMaxReachedBid],
      };
    } else if (userMaxBid === highestCompetitor.maxBid) {
      // Tie - both at same max, earlier timestamp wins
      // User placing same max as current winner doesn't win
      // Price stays the same (Tradera Spec Scenario 4)
      return {
        actualBidAmount: ensureValidCents(userMaxBid),
        isProxyActivated: true,
        wouldWin: false, // Earlier bidder keeps winning
        nextIncrementNeeded: ensureValidCents(userMaxBid + bidIncrement),
        message: `You've placed your max bid of $${(userMaxBid / 100).toFixed(2)}, but you're tied with another bidder who bid first`,
        isMaxBidReached: true,
        competitorBids: [], // No price change, no new bids for competitor
      };
    } else {
      // User loses - user bids their max, competitor still wins
      return {
        actualBidAmount: ensureValidCents(userMaxBid),
        isProxyActivated: true,
        wouldWin: false,
        nextIncrementNeeded: ensureValidCents(highestCompetitor.maxBid + bidIncrement),
        message: `You've placed your max bid of $${(userMaxBid / 100).toFixed(2)}`,
        isMaxBidReached: true,
        competitorBids: [],
      };
    }
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
    _newBid: Bid
  ): Promise<Array<{userId: string; amount: number; maxBid: number | null; autoBidStep: number | null}>> {
    // TRADERA BEHAVIOR: No automatic counter-bid chains
    // When B places max bid of 200 and beats A's max of 150,
    // A does NOT automatically counter-bid. The bidding stops.
    //
    // A would only bid again if A manually increases their max bid.

    logger.info(`🔍 Tradera-style bidding: No counter-bids triggered (disabled for Tradera behavior)`);

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
