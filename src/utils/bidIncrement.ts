/**
 * Bid Increment Calculator
 *
 * Implements Tradera-style dynamic bid increments based on price ranges.
 * Higher prices = larger increments to keep bidding practical.
 *
 * This follows standard auction practices where:
 * - Low prices: small increments (e.g., $1, $5)
 * - Medium prices: moderate increments (e.g., $10, $25)
 * - High prices: larger increments (e.g., $50, $100, $250)
 */

interface BidIncrementRule {
  minPrice: number;  // In cents
  maxPrice: number;  // In cents
  increment: number; // In cents
}

/**
 * Bid increment rules based on current price
 * Inspired by Tradera/eBay increment systems
 *
 * Price ranges are in USD (converted to cents internally)
 */
const BID_INCREMENT_RULES: BidIncrementRule[] = [
  { minPrice: 0,           maxPrice: 100,      increment: 5 },      // $0.00 - $1.00: $0.05
  { minPrice: 100,         maxPrice: 500,      increment: 25 },     // $1.00 - $5.00: $0.25
  { minPrice: 500,         maxPrice: 1000,     increment: 50 },     // $5.00 - $10.00: $0.50
  { minPrice: 1000,        maxPrice: 2500,     increment: 100 },    // $10.00 - $25.00: $1.00
  { minPrice: 2500,        maxPrice: 5000,     increment: 250 },    // $25.00 - $50.00: $2.50
  { minPrice: 5000,        maxPrice: 10000,    increment: 500 },    // $50.00 - $100.00: $5.00
  { minPrice: 10000,       maxPrice: 25000,    increment: 1000 },   // $100.00 - $250.00: $10.00
  { minPrice: 25000,       maxPrice: 50000,    increment: 2500 },   // $250.00 - $500.00: $25.00
  { minPrice: 50000,       maxPrice: 100000,   increment: 5000 },   // $500.00 - $1,000.00: $50.00
  { minPrice: 100000,      maxPrice: 250000,   increment: 10000 },  // $1,000.00 - $2,500.00: $100.00
  { minPrice: 250000,      maxPrice: 500000,   increment: 25000 },  // $2,500.00 - $5,000.00: $250.00
  { minPrice: 500000,      maxPrice: Infinity, increment: 50000 },  // $5,000.00+: $500.00
];

/**
 * Get the appropriate bid increment for a given price
 *
 * @param currentPrice - Current auction price in cents
 * @returns Bid increment in cents
 */
export function getBidIncrement(currentPrice: number): number {
  // Find the matching rule
  for (const rule of BID_INCREMENT_RULES) {
    if (currentPrice >= rule.minPrice && currentPrice < rule.maxPrice) {
      return rule.increment;
    }
  }

  // Default fallback (should never reach here due to Infinity in last rule)
  return 100; // $1.00
}

/**
 * Calculate the minimum next bid amount
 *
 * @param currentPrice - Current auction price in cents
 * @returns Minimum valid next bid in cents
 */
export function getMinimumNextBid(currentPrice: number): number {
  return currentPrice + getBidIncrement(currentPrice);
}

/**
 * Format increment for display (debugging/logging)
 *
 * @param currentPrice - Current auction price in cents
 * @returns Human-readable increment string
 */
export function formatBidIncrement(currentPrice: number): string {
  const increment = getBidIncrement(currentPrice);
  return `$${(increment / 100).toFixed(2)}`;
}

/**
 * Check if a bid amount is valid (meets minimum increment)
 *
 * @param currentPrice - Current auction price in cents
 * @param bidAmount - Proposed bid amount in cents
 * @returns True if bid meets minimum increment requirement
 */
export function isValidBidAmount(currentPrice: number, bidAmount: number): boolean {
  const minimumBid = getMinimumNextBid(currentPrice);
  return bidAmount >= minimumBid;
}

/**
 * Get all increment rules (for display/documentation)
 */
export function getIncrementRules(): BidIncrementRule[] {
  return [...BID_INCREMENT_RULES];
}
