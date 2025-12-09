import { config } from '../config';
import { logger } from '../utils/logger';
import { ErrorCode, AuctionError } from '../types';

/**
 * Lock state for an auction
 */
interface LockState {
  isLocked: boolean;
  acquiredAt: number;
  timeout: number;
}

/**
 * LockManager - Prevents race conditions in concurrent bidding
 *
 * How it works:
 * 1. Before processing a bid, acquire a lock on the auction
 * 2. Only one operation can hold the lock at a time
 * 3. Lock automatically expires after timeout (default 500ms)
 * 4. Other operations must wait or fail if lock is held
 *
 * This ensures bids are processed one at a time per auction
 */
class LockManager {
  private locks: Map<string, LockState>;
  private cleanupInterval: NodeJS.Timeout | null;

  constructor() {
    this.locks = new Map();
    this.cleanupInterval = null;
    this.startCleanup();
  }

  /**
   * Acquire lock for an auction
   * Returns true if lock acquired, false if already locked
   */
  async acquireLock(
    auctionId: string,
    timeout: number = config.auction.lockTimeout
  ): Promise<boolean> {
    const existingLock = this.locks.get(auctionId);

    // Check if lock exists and is still valid
    if (existingLock && existingLock.isLocked) {
      const now = Date.now();
      const elapsed = now - existingLock.acquiredAt;

      // Check if lock has expired
      if (elapsed < existingLock.timeout) {
        logger.debug(`Lock already held for auction ${auctionId}`);
        return false;
      }

      // Lock expired, remove it
      logger.warn(`Lock expired for auction ${auctionId}, removing stale lock`);
      this.locks.delete(auctionId);
    }

    // Acquire new lock
    this.locks.set(auctionId, {
      isLocked: true,
      acquiredAt: Date.now(),
      timeout,
    });

    logger.debug(`Lock acquired for auction ${auctionId}`);
    return true;
  }

  /**
   * Release lock for an auction
   */
  releaseLock(auctionId: string): void {
    const lock = this.locks.get(auctionId);

    if (lock) {
      this.locks.delete(auctionId);
      logger.debug(`Lock released for auction ${auctionId}`);
    }
  }

  /**
   * Check if auction is locked
   */
  isLocked(auctionId: string): boolean {
    const lock = this.locks.get(auctionId);

    if (!lock || !lock.isLocked) {
      return false;
    }

    const now = Date.now();
    const elapsed = now - lock.acquiredAt;

    // Check if lock has expired
    if (elapsed >= lock.timeout) {
      this.locks.delete(auctionId);
      return false;
    }

    return true;
  }

  /**
   * Execute a function with lock protection
   * Automatically acquires and releases lock
   *
   * Usage:
   *   await lockManager.withLock(auctionId, async () => {
   *     // Your protected code here
   *   });
   */
  async withLock<T>(
    auctionId: string,
    fn: () => Promise<T>,
    maxRetries: number = 3,
    retryDelay: number = 100
  ): Promise<T> {
    let attempts = 0;

    while (attempts < maxRetries) {
      const acquired = await this.acquireLock(auctionId);

      if (acquired) {
        try {
          const result = await fn();
          return result;
        } finally {
          this.releaseLock(auctionId);
        }
      }

      // Lock not acquired, wait and retry
      attempts++;
      if (attempts < maxRetries) {
        logger.debug(`Lock acquisition failed for ${auctionId}, retry ${attempts}/${maxRetries}`);
        await this.sleep(retryDelay * attempts); // Exponential backoff
      }
    }

    // Failed to acquire lock after retries
    throw new AuctionError(
      'Auction is currently locked, please try again',
      ErrorCode.AUCTION_LOCKED,
      409,
      { auctionId, attempts }
    );
  }

  /**
   * Cleanup expired locks periodically
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      let cleanedCount = 0;

      for (const [auctionId, lock] of this.locks.entries()) {
        const elapsed = now - lock.acquiredAt;

        if (elapsed >= lock.timeout) {
          this.locks.delete(auctionId);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        logger.debug(`Cleaned up ${cleanedCount} expired locks`);
      }
    }, 5000); // Check every 5 seconds
  }

  /**
   * Stop cleanup interval
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Get lock statistics (for debugging)
   */
  getStats(): { totalLocks: number; lockedAuctions: string[] } {
    return {
      totalLocks: this.locks.size,
      lockedAuctions: Array.from(this.locks.keys()),
    };
  }

  /**
   * Helper to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const lockManager = new LockManager();
