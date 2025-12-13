/**
 * Comprehensive Unit Tests for Tradera-style Auction System
 *
 * These tests demonstrate all auction scenarios with:
 * - Input data (starting price, bids with max amounts)
 * - Expected bid history (what end users see - only visible price changes)
 * - Expected outcome (winner and final price using second-price logic)
 *
 * IMPORTANT: Uses dynamic bid increments based on price ranges (like real Tradera)
 * All prices in CENTS (e.g., 100 = $1.00)
 */

import { describe, test, expect } from '@jest/globals';

// Types
interface Bid {
  timestamp: string;
  userId: string;
  maxBid: number;
}

interface VisibleBidHistory {
  timestamp: string;
  message: string;
  userId: string;
  visiblePrice: number;
  isLeading: boolean;
}

interface AuctionResult {
  winner: string | null;
  finalPrice: number;
  status: 'sold' | 'unsold' | 'buy_now';
  bidHistory: VisibleBidHistory[];
}

/**
 * Dynamic bid increment based on current price (matches production logic)
 * This is the ACTUAL increment system used in the auction
 */
function getBidIncrement(currentPrice: number): number {
  if (currentPrice < 100) return 5;        // $0.00 - $1.00: $0.05
  if (currentPrice < 500) return 25;       // $1.00 - $5.00: $0.25
  if (currentPrice < 1000) return 50;      // $5.00 - $10.00: $0.50
  if (currentPrice < 2500) return 100;     // $10.00 - $25.00: $1.00
  if (currentPrice < 5000) return 250;     // $25.00 - $50.00: $2.50
  if (currentPrice < 10000) return 500;    // $50.00 - $100.00: $5.00
  if (currentPrice < 25000) return 1000;   // $100.00 - $250.00: $10.00
  if (currentPrice < 50000) return 2500;   // $250.00 - $500.00: $25.00
  if (currentPrice < 100000) return 5000;  // $500.00 - $1,000.00: $50.00
  if (currentPrice < 250000) return 10000; // $1,000.00 - $2,500.00: $100.00
  if (currentPrice < 500000) return 25000; // $2,500.00 - $5,000.00: $250.00
  return 50000;                            // $5,000.00+: $500.00
}

// Auction processor with Tradera logic
class AuctionProcessor {
  constructor(
    private startPrice: number,
    private reservePrice?: number
  ) {}

  processBids(bids: Bid[]): AuctionResult {
    if (bids.length === 0) {
      return {
        winner: null,
        finalPrice: this.startPrice,
        status: 'unsold',
        bidHistory: []
      };
    }

    const sortedBids = [...bids].sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp)
    );

    let currentWinner: string | null = null;
    let visiblePrice = this.startPrice;
    const bidHistory: VisibleBidHistory[] = [];
    const userMaxBids = new Map<string, number>();
    const firstBidTimestamp = new Map<string, string>();

    for (const bid of sortedBids) {
      const previousPrice = visiblePrice;

      userMaxBids.set(bid.userId, bid.maxBid);

      if (!firstBidTimestamp.has(bid.userId)) {
        firstBidTimestamp.set(bid.userId, bid.timestamp);
      }

      const allMaxBids = Array.from(userMaxBids.entries())
        .map(([userId, maxBid]) => ({
          userId,
          maxBid,
          firstTimestamp: firstBidTimestamp.get(userId) || ''
        }))
        .sort((a, b) => {
          if (b.maxBid !== a.maxBid) return b.maxBid - a.maxBid;
          return a.firstTimestamp.localeCompare(b.firstTimestamp);
        });

      const highest = allMaxBids[0];
      const secondHighest = allMaxBids[1];

      currentWinner = highest.userId;

      if (allMaxBids.length === 1) {
        const increment = getBidIncrement(this.startPrice);
        visiblePrice = this.startPrice + increment;
      } else {
        if (secondHighest.maxBid === highest.maxBid) {
          const increment = getBidIncrement(this.startPrice);
          visiblePrice = this.startPrice + increment;
        } else {
          const increment = getBidIncrement(secondHighest.maxBid);
          const calculatedPrice = secondHighest.maxBid + increment;
          visiblePrice = Math.min(calculatedPrice, highest.maxBid);

          if (this.reservePrice && highest.maxBid >= this.reservePrice) {
            if (visiblePrice < this.reservePrice) {
              visiblePrice = this.reservePrice;
            }
          }
        }
      }

      const priceChanged = visiblePrice !== previousPrice;

      // TRADERA SPEC: Show bid history ONLY when price changes
      // The history entry shows the WINNER's auto-bid, not the loser's bid
      if (priceChanged) {
        // Price changed - show the current winner's auto-bid at the new price
        bidHistory.push({
          timestamp: bid.timestamp,
          userId: currentWinner,
          message: `User ${currentWinner} auto-bid to ${visiblePrice}`,
          visiblePrice,
          isLeading: true
        });
      }
      // If no price change (leader raising max, or tied bid), don't add to history
    }

    const reserveMet = !this.reservePrice || visiblePrice >= this.reservePrice;

    return {
      winner: reserveMet ? currentWinner : null,
      finalPrice: visiblePrice,
      status: reserveMet ? 'sold' : 'unsold',
      bidHistory
    };
  }
}

describe('Auction System - Tradera Spec Compliant', () => {

  describe('Scenario 1: Standard Auction (No Reserve)', () => {
    test('Multiple bidders with proxy bidding', () => {
      const processor = new AuctionProcessor(10000); // Start at $100.00

      const bids: Bid[] = [
        { timestamp: '10:00', userId: 'A', maxBid: 20000 },  // $200
        { timestamp: '12:00', userId: 'B', maxBid: 12000 },  // $120
        { timestamp: '14:00', userId: 'C', maxBid: 30000 }   // $300
      ];

      const result = processor.processBids(bids);

      // Increment at 10000 ($100) is 1000 ($10)
      // A bids → 10000 + 1000 = 11000
      // B bids → A leads, 12000 + 1000 = 13000
      // C bids → C leads, 20000 + 1000 = 21000
      expect(result.winner).toBe('C');
      expect(result.finalPrice).toBe(21000); // $210
      expect(result.status).toBe('sold');
      expect(result.bidHistory.length).toBe(3);

      console.log('\n📊 Scenario 1: Standard Auction (Spec Example)');
      console.log('Input: Start=$100, A max=$200, B max=$120, C max=$300');
      console.log('\nBid History (User View):');
      result.bidHistory.forEach(h =>
        console.log(`  ${h.timestamp} ${h.message} ($${(h.visiblePrice / 100).toFixed(2)})`)
      );
      console.log(`\n✅ Winner: ${result.winner} at $${(result.finalPrice / 100).toFixed(2)}`);
    });

    test('Single bidder wins at start + increment', () => {
      const processor = new AuctionProcessor(10000); // Start at $100

      const bids: Bid[] = [
        { timestamp: '10:00', userId: 'A', maxBid: 20000 }  // $200
      ];

      const result = processor.processBids(bids);

      // Start $100 + increment at $100 ($10) = $110
      expect(result.winner).toBe('A');
      expect(result.finalPrice).toBe(11000); // $110 NOT $100
      expect(result.status).toBe('sold');

      console.log('\n📊 Scenario 1 Edge: Single Bidder');
      console.log(`Winner: A at $${(result.finalPrice / 100).toFixed(2)} (NOT $100!)`);
    });
  });

  describe('Scenario 2: Reserve Price Not Met', () => {
    test('Auction becomes UNSOLD when reserve not met', () => {
      const processor = new AuctionProcessor(1, 100000); // Start $0.01, reserve $1000

      const bids: Bid[] = [
        { timestamp: '10:00', userId: 'A', maxBid: 30000 },  // $300
        { timestamp: '12:00', userId: 'B', maxBid: 80000 }   // $800
      ];

      const result = processor.processBids(bids);

      // A bids → 1 + 5 = 6
      // B bids → 30000 + 2500 = 32500 (increment at 30000 is 2500)
      expect(result.winner).toBe(null);  // Reserve not met
      expect(result.status).toBe('unsold');
      expect(result.finalPrice).toBe(32500); // $325

      console.log('\n📊 Scenario 2: Reserve Not Met');
      console.log(`Result: UNSOLD ($${(result.finalPrice / 100).toFixed(2)} < $1000 reserve)`);
    });
  });

  describe('Scenario 4: Same Max Bid - Earlier Timestamp Wins', () => {
    test('No price change when bids are equal', () => {
      const processor = new AuctionProcessor(10000); // Start $100

      const bids: Bid[] = [
        { timestamp: '10:00:01.001', userId: 'A', maxBid: 20000 },
        { timestamp: '10:00:01.002', userId: 'B', maxBid: 20000 }
      ];

      const result = processor.processBids(bids);

      expect(result.winner).toBe('A'); // Earlier timestamp
      expect(result.finalPrice).toBe(11000); // $110 (NO price change for B)
      expect(result.bidHistory.length).toBe(1); // Only A's bid shown

      console.log('\n📊 Scenario 4: Equal Max Bids (Tradera Spec)');
      console.log(`Winner: A at $${(result.finalPrice / 100).toFixed(2)} (earlier timestamp, NO price change)`);
    });
  });

  describe('Scenario 5: Leader Raises Own Max Bid', () => {
    test('Price unchanged when leader increases max', () => {
      const processor = new AuctionProcessor(10000); // Start $100

      const bids: Bid[] = [
        { timestamp: '10:00', userId: 'A', maxBid: 60000 },  // $600
        { timestamp: '12:00', userId: 'B', maxBid: 55000 },  // $550
        { timestamp: '12:30', userId: 'A', maxBid: 80000 }   // A raises to $800
      ];

      const result = processor.processBids(bids);

      // A bids → 10000 + 1000 = 11000 ($110)
      // B bids → 55000 + 5000 = 60000, capped at A max (60000) = 60000 ($600)
      // A raises → price stays at 60000 (NO visible change)
      expect(result.winner).toBe('A');
      expect(result.finalPrice).toBe(60000); // $600 (unchanged)
      expect(result.bidHistory.length).toBe(2); // Only 2 visible (A's raise not shown)

      console.log('\n📊 Scenario 5: Leader Raises Max (Tradera Spec)');
      console.log(`Price stays at $${(result.finalPrice / 100).toFixed(2)} (NO change when leader raises max)`);
    });
  });

  describe('Scenario 6: Multiple Bid Battles', () => {
    test('Continuous raising between users', () => {
      const processor = new AuctionProcessor(10000); // Start $100

      const bids: Bid[] = [
        { timestamp: '10:00', userId: 'A', maxBid: 20000 },  // $200
        { timestamp: '10:10', userId: 'B', maxBid: 25000 },  // $250
        { timestamp: '10:15', userId: 'A', maxBid: 30000 },  // $300
        { timestamp: '10:20', userId: 'B', maxBid: 35000 },  // $350
        { timestamp: '10:25', userId: 'A', maxBid: 36000 },  // $360
        { timestamp: '10:30', userId: 'B', maxBid: 40000 }   // $400
      ];

      const result = processor.processBids(bids);

      // Increments change as price increases:
      // 20000: increment = 1000, price = 20000 + 1000 = 21000
      // 25000: increment = 2500, price = 25000 + 2500 = 27500
      // 30000: increment = 2500, price = 30000 + 2500 = 32500
      // 35000: increment = 2500, price = 35000 + 2500 = 37500
      // 36000: increment = 2500, price = 36000 + 2500 = 38500
      expect(result.winner).toBe('B');
      expect(result.finalPrice).toBe(38500); // $385 (36000 + 2500)

      console.log('\n📊 Scenario 6: Multiple Bid Battles');
      console.log('\nBid History:');
      result.bidHistory.forEach(h =>
        console.log(`  ${h.timestamp} ${h.message}`)
      );
      console.log(`\n✅ Winner: B at $${(result.finalPrice / 100).toFixed(2)}`);
    });
  });

  describe('Complex Scenario: Reserve Price Jump', () => {
    test('Price jumps to reserve when winner max meets reserve', () => {
      const processor = new AuctionProcessor(1000, 30000); // Start $10, reserve $300

      const bids: Bid[] = [
        { timestamp: '10:00', userId: 'A', maxBid: 20000 },  // $200
        { timestamp: '10:05', userId: 'B', maxBid: 40000 }   // $400 (meets reserve)
      ];

      const result = processor.processBids(bids);

      // Normal calculation: 20000 + 100 = 20100 ($201)
      // But B max (40000) >= reserve (30000), so jump to reserve
      expect(result.winner).toBe('B');
      expect(result.finalPrice).toBe(30000); // Jumped to reserve $300
      expect(result.status).toBe('sold');

      console.log('\n📊 Reserve Price Jump (Tradera Spec Scenario 3)');
      console.log(`Winner: B at $${(result.finalPrice / 100).toFixed(2)} (jumped to reserve)`);
    });
  });

  describe('Edge Cases', () => {
    test('No bids placed', () => {
      const processor = new AuctionProcessor(10000);
      const result = processor.processBids([]);

      expect(result.winner).toBe(null);
      expect(result.status).toBe('unsold');
      expect(result.bidHistory).toHaveLength(0);
    });

    test('Second-price verification', () => {
      const processor = new AuctionProcessor(100000); // Start $1000

      const bids: Bid[] = [
        { timestamp: '10:00', userId: 'A', maxBid: 500000 },  // $5000
        { timestamp: '10:05', userId: 'B', maxBid: 300000 },  // $3000
        { timestamp: '10:10', userId: 'C', maxBid: 400000 }   // $4000
      ];

      const result = processor.processBids(bids);

      // Second highest is C (400000)
      // Increment at 400000 is 25000 (400k is in 250k-500k range)
      // Price = 400000 + 25000 = 425000
      expect(result.winner).toBe('A');
      expect(result.finalPrice).toBe(425000); // $4250 (second-price!)

      console.log('\n📊 Second-Price Verification');
      console.log(`Winner pays $${(result.finalPrice / 100).toFixed(2)}, NOT $${(500000 / 100).toFixed(2)} (their max)`);
    });
  });
});

/**
 * Summary:
 *
 * ✅ Dynamic bid increments (matches production)
 * ✅ Second-price logic (winner pays second + increment)
 * ✅ Timestamp priority for ties (Scenario 4)
 * ✅ Leader raising max doesn't change price (Scenario 5)
 * ✅ Reserve price jump when met (Scenario 3)
 * ✅ Visible bid history shows ONLY price changes
 * ✅ All prices in cents for precision
 */
