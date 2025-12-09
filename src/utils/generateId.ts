/**
 * Generate a unique ID with a prefix
 * Format: prefix_timestamp_random
 * Example: auct_1701626400000_abc123
 */
export function generateId(prefix: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Generate auction ID
 */
export function generateAuctionId(): string {
  return generateId('auct');
}

/**
 * Generate bid ID
 */
export function generateBidId(): string {
  return generateId('bid');
}

/**
 * Generate user ID
 */
export function generateUserId(): string {
  return generateId('user');
}
