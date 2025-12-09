import { config } from '../config';
import { logger } from '../utils/logger';
import { auctionService } from './auctionService';
import { dataStore } from './dataStore';
import { websocketService } from './websocketService';
import { AuctionStatus, Auction } from '../types';

/**
 * Scheduler Service
 *
 * Automatically manages auction lifecycle based on time:
 * - Auto-starts PENDING auctions when startTime arrives
 * - Auto-ends ACTIVE auctions when endTime arrives
 * - Provides "ending soon" warnings
 * - Fail-safe mechanisms for missed schedules
 *
 * Runs on configurable interval (default: every 5 seconds)
 */

interface SchedulerStats {
  totalChecks: number;
  auctionsStarted: number;
  auctionsEnded: number;
  failSafeActivations: number;
  lastCheckTime: Date;
  uptime: number;
}

class SchedulerService {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private stats: SchedulerStats = {
    totalChecks: 0,
    auctionsStarted: 0,
    auctionsEnded: 0,
    failSafeActivations: 0,
    lastCheckTime: new Date(),
    uptime: 0,
  };
  private startTime: Date = new Date();
  // @ts-ignore - Used in checkAuctions method
  private lastEndingSoonNotifications = new Map<string, number>(); // Track last notification time per auction
  // @ts-ignore - Used in checkAuctions method
  private readonly NOTIFICATION_THROTTLE_MS = 30000; // 30 seconds between notifications

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Scheduler is already running');
      return;
    }

    const intervalMs = config.auction.schedulerInterval;
    this.startTime = new Date();

    logger.info(`🕐 Starting scheduler (interval: ${intervalMs}ms = ${intervalMs / 1000}s)`);

    // Run immediately on start
    this.checkAuctions();

    // Then run on interval
    this.intervalId = setInterval(() => {
      this.checkAuctions();
    }, intervalMs);

    this.isRunning = true;
    logger.info('✅ Scheduler started successfully');
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (!this.isRunning || !this.intervalId) {
      logger.warn('Scheduler is not running');
      return;
    }

    clearInterval(this.intervalId);
    this.intervalId = null;
    this.isRunning = false;

    logger.info('🛑 Scheduler stopped');
  }

  /**
   * Main scheduling logic - checks all auctions and processes them
   */
  private async checkAuctions(): Promise<void> {
    this.stats.totalChecks++;
    this.stats.lastCheckTime = new Date();
    this.stats.uptime = Date.now() - this.startTime.getTime();

    const now = new Date();

    try {
      // Get all auctions that need processing
      const pendingAuctions = dataStore.getAuctionsByStatus(AuctionStatus.PENDING);
      const activeAuctions = dataStore.getAuctionsByStatus(AuctionStatus.ACTIVE);

      let startedCount = 0;
      let endedCount = 0;
      let endingSoonCount = 0;

      // Process pending auctions (auto-start)
      for (const auction of pendingAuctions) {
        if (this.shouldStartAuction(auction, now)) {
          await this.startAuction(auction);
          startedCount++;
        }
      }

      // Process active auctions (auto-end or warn)
      for (const auction of activeAuctions) {
        if (this.shouldEndAuction(auction, now)) {
          await this.endAuction(auction);
          endedCount++;
        } else if (this.isEndingSoon(auction, now)) {
          // Check if we should send notification (throttled to once per 30 seconds)
          const lastNotificationTime = this.lastEndingSoonNotifications.get(auction.id) || 0;
          const timeSinceLastNotification = now.getTime() - lastNotificationTime;

          if (timeSinceLastNotification >= this.NOTIFICATION_THROTTLE_MS) {
            endingSoonCount++;
            const timeRemaining = this.getTimeRemaining(auction, now);
            logger.debug(`⏰ Auction ending soon: ${auction.id} (${timeRemaining}s remaining)`);

            // Broadcast ending soon notification
            websocketService.broadcastAuctionEndingSoon({
              auction,
              timeRemaining,
            });

            // Update last notification time
            this.lastEndingSoonNotifications.set(auction.id, now.getTime());
          }
        }
      }

      // Log summary if any actions were taken
      if (startedCount > 0 || endedCount > 0 || endingSoonCount > 0) {
        logger.info(
          `📊 Scheduler check #${this.stats.totalChecks}: ` +
          `started=${startedCount}, ended=${endedCount}, ending_soon=${endingSoonCount}`
        );
      }

    } catch (error) {
      logger.error('Error in scheduler check:', error);
    }
  }

  /**
   * Determine if auction should start
   */
  private shouldStartAuction(auction: Auction, now: Date): boolean {
    // Auction should start if:
    // 1. Status is PENDING
    // 2. Current time >= start time
    return auction.status === AuctionStatus.PENDING && now >= auction.startTime;
  }

  /**
   * Determine if auction should end
   */
  private shouldEndAuction(auction: Auction, now: Date): boolean {
    // Auction should end if:
    // 1. Status is ACTIVE
    // 2. Current time >= end time
    return auction.status === AuctionStatus.ACTIVE && now >= auction.endTime;
  }

  /**
   * Check if auction is ending soon (within 5 minutes)
   */
  private isEndingSoon(auction: Auction, now: Date): boolean {
    const remaining = this.getTimeRemaining(auction, now);
    return remaining > 0 && remaining <= 300; // 5 minutes
  }

  /**
   * Get time remaining in seconds
   */
  private getTimeRemaining(auction: Auction, now: Date): number {
    const remaining = auction.endTime.getTime() - now.getTime();
    return Math.max(0, Math.floor(remaining / 1000));
  }

  /**
   * Start an auction
   */
  private async startAuction(auction: Auction): Promise<void> {
    try {
      logger.info(`🚀 Auto-starting auction: ${auction.id} - ${auction.title}`);
      const startedAuction = await auctionService.startAuction(auction.id);
      this.stats.auctionsStarted++;

      // Broadcast auction started event
      websocketService.broadcastAuctionStarted(startedAuction);
    } catch (error) {
      logger.error(`Failed to start auction ${auction.id}:`, error);
    }
  }

  /**
   * End an auction
   */
  private async endAuction(auction: Auction): Promise<void> {
    try {
      logger.info(`🏁 Auto-ending auction: ${auction.id} - ${auction.title}`);
      const endedAuction = await auctionService.endAuction(auction.id);
      this.stats.auctionsEnded++;

      // Clean up notification tracking for this auction
      this.lastEndingSoonNotifications.delete(auction.id);

      if (endedAuction.winnerId) {
        logger.info(`🏆 Auction ${auction.id} winner: ${endedAuction.winnerId} ($${endedAuction.currentPrice / 100})`);
      } else {
        logger.info(`📭 Auction ${auction.id} ended with no bids`);
      }

      // Broadcast auction ended event
      websocketService.broadcastAuctionEnded({
        auction: endedAuction,
        winnerId: endedAuction.winnerId,
        finalPrice: endedAuction.currentPrice,
      });
    } catch (error) {
      logger.error(`Failed to end auction ${auction.id}:`, error);
    }
  }

  /**
   * Fail-safe: Force end all auctions that are past their end time by grace period
   * This catches any auctions that may have been missed by regular checks
   */
  async runFailSafe(): Promise<void> {
    const now = new Date();
    const gracePeriod = config.auction.gracePeriod; // e.g., 60000ms = 1 minute
    const activeAuctions = dataStore.getAuctionsByStatus(AuctionStatus.ACTIVE);

    let failSafeCount = 0;

    for (const auction of activeAuctions) {
      const timeSinceEnd = now.getTime() - auction.endTime.getTime();

      // If auction is past end time + grace period, force end it
      if (timeSinceEnd > gracePeriod) {
        logger.warn(
          `⚠️ FAIL-SAFE: Force-ending auction ${auction.id} ` +
          `(${Math.floor(timeSinceEnd / 1000)}s past end time)`
        );

        await this.endAuction(auction);
        failSafeCount++;
        this.stats.failSafeActivations++;
      }
    }

    if (failSafeCount > 0) {
      logger.warn(`⚠️ Fail-safe ended ${failSafeCount} auction(s)`);
    }
  }

  /**
   * Get scheduler statistics
   */
  getStats(): SchedulerStats {
    return {
      ...this.stats,
      uptime: Date.now() - this.startTime.getTime(),
    };
  }

  /**
   * Check if scheduler is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Get all auctions ending in next N seconds
   */
  getEndingSoonAuctions(withinSeconds: number = 300): Auction[] {
    const now = new Date();
    const activeAuctions = dataStore.getAuctionsByStatus(AuctionStatus.ACTIVE);

    return activeAuctions.filter((auction) => {
      const remaining = this.getTimeRemaining(auction, now);
      return remaining > 0 && remaining <= withinSeconds;
    });
  }

  /**
   * Get next auction to start
   */
  getNextAuctionToStart(): Auction | null {
    const pendingAuctions = dataStore.getAuctionsByStatus(AuctionStatus.PENDING);

    if (pendingAuctions.length === 0) {
      return null;
    }

    // Sort by start time (earliest first)
    const sorted = [...pendingAuctions].sort(
      (a, b) => a.startTime.getTime() - b.startTime.getTime()
    );

    return sorted[0];
  }

  /**
   * Get next auction to end
   */
  getNextAuctionToEnd(): Auction | null {
    const activeAuctions = dataStore.getAuctionsByStatus(AuctionStatus.ACTIVE);

    if (activeAuctions.length === 0) {
      return null;
    }

    // Sort by end time (earliest first)
    const sorted = [...activeAuctions].sort(
      (a, b) => a.endTime.getTime() - b.endTime.getTime()
    );

    return sorted[0];
  }

  /**
   * Manual trigger for testing
   */
  async triggerCheck(): Promise<void> {
    logger.info('🔄 Manual scheduler check triggered');
    await this.checkAuctions();
  }
}

// Export singleton instance
export const schedulerService = new SchedulerService();
