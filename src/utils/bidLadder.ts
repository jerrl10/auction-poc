/**
 * Bid Increment Ladder - Tradera/eBay Style
 *
 * Determines the minimum bid increment based on the current price.
 * This matches standard auction sites like Tradera and eBay.
 *
 * Price ranges are in cents for consistency with the rest of the system.
 */

interface BidIncrement {
  minPrice: number;  // in cents
  maxPrice: number;  // in cents
  increment: number; // in cents
}

/**
 * Bid increment ladder based on Tradera/eBay standards
 * Amounts are in cents (multiply SEK by 100)
 */
const BID_LADDER: BidIncrement[] = [
  { minPrice: 0, maxPrice: 9999, increment: 500 },           // 0 - 99.99 SEK: 5 SEK increment
  { minPrice: 10000, maxPrice: 24999, increment: 1000 },     // 100 - 249.99 SEK: 10 SEK increment
  { minPrice: 25000, maxPrice: 49999, increment: 2500 },     // 250 - 499.99 SEK: 25 SEK increment
  { minPrice: 50000, maxPrice: 99999, increment: 5000 },     // 500 - 999.99 SEK: 50 SEK increment
  { minPrice: 100000, maxPrice: 249999, increment: 10000 },  // 1000 - 2499.99 SEK: 100 SEK increment
  { minPrice: 250000, maxPrice: 499999, increment: 25000 },  // 2500 - 4999.99 SEK: 250 SEK increment
  { minPrice: 500000, maxPrice: 999999, increment: 50000 },  // 5000 - 9999.99 SEK: 500 SEK increment
  { minPrice: 1000000, maxPrice: Infinity, increment: 100000 }, // 10000+ SEK: 1000 SEK increment
];

/**
 * Get the minimum bid increment for a given price
 *
 * @param currentPrice - Current price in cents
 * @returns The minimum increment in cents based on the bid ladder
 *
 * @example
 * getBidIncrement(5000)  // Returns 500 (5 SEK for prices under 100 SEK)
 * getBidIncrement(15000) // Returns 1000 (10 SEK for prices 100-249 SEK)
 * getBidIncrement(100000) // Returns 10000 (100 SEK for prices 1000-2499 SEK)
 */
export function getBidIncrement(currentPrice: number): number {
  const ladder = BID_LADDER.find(
    (level) => currentPrice >= level.minPrice && currentPrice <= level.maxPrice
  );

  if (!ladder) {
    // Fallback to highest increment if somehow not found
    return BID_LADDER[BID_LADDER.length - 1].increment;
  }

  return ladder.increment;
}

/**
 * Calculate the minimum valid next bid for an auction
 *
 * @param currentPrice - Current price in cents
 * @returns The minimum next bid amount in cents
 *
 * @example
 * getMinimumNextBid(5000) // Returns 5500 (current + 5 SEK increment)
 */
export function getMinimumNextBid(currentPrice: number): number {
  const increment = getBidIncrement(currentPrice);
  return currentPrice + increment;
}

/**
 * Validate if a bid amount meets the minimum requirement
 *
 * @param bidAmount - Proposed bid amount in cents
 * @param currentPrice - Current auction price in cents
 * @returns True if bid is valid, false otherwise
 *
 * @example
 * isValidBidAmount(5500, 5000) // true (meets 5 SEK increment)
 * isValidBidAmount(5400, 5000) // false (doesn't meet increment)
 */
export function isValidBidAmount(bidAmount: number, currentPrice: number): boolean {
  const minimumRequired = getMinimumNextBid(currentPrice);
  return bidAmount >= minimumRequired;
}

/**
 * Round a bid amount up to the nearest valid increment
 *
 * @param amount - Amount to round in cents
 * @param currentPrice - Current auction price in cents
 * @returns Rounded amount that meets minimum bid requirement
 *
 * @example
 * roundToValidBid(5300, 5000) // Returns 5500 (rounds up to next valid bid)
 */
export function roundToValidBid(amount: number, currentPrice: number): number {
  const minimumNext = getMinimumNextBid(currentPrice);

  if (amount < minimumNext) {
    return minimumNext;
  }

  const increment = getBidIncrement(currentPrice);
  const stepsAboveMinimum = Math.ceil((amount - minimumNext) / increment);

  return minimumNext + (stepsAboveMinimum * increment);
}

/**
 * Get a formatted description of the current bid increment
 *
 * @param currentPrice - Current price in cents
 * @returns Human-readable description (e.g., "5.00 SEK")
 */
export function getBidIncrementDescription(currentPrice: number): string {
  const increment = getBidIncrement(currentPrice);
  const sek = increment / 100;
  return `${sek.toFixed(2)} SEK`;
}

/**
 * Export the bid ladder for reference/display purposes
 */
export function getBidLadder(): BidIncrement[] {
  return [...BID_LADDER];
}
