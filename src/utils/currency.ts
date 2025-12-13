/**
 * Currency utility functions to ensure proper handling of money amounts
 *
 * All amounts are stored in cents as integers to avoid floating point errors
 */

/**
 * Ensure an amount is a valid integer (in cents)
 * Prevents floating point errors and fractional cents
 */
export function ensureValidCents(amount: number): number {
  // Round to nearest integer to prevent fractional cents
  return Math.round(amount);
}

/**
 * Convert dollars to cents with proper rounding
 */
export function dollarsToCents(dollars: number): number {
  return ensureValidCents(dollars * 100);
}

/**
 * Convert cents to dollars
 */
export function centsToDollars(cents: number): number {
  return cents / 100;
}

/**
 * Format cents as dollar string
 */
export function formatCents(cents: number): string {
  const dollars = centsToDollars(cents);
  return `$${dollars.toFixed(2)}`;
}
