import { Auction, AuctionStatus, AuctionError, ErrorCode } from '../types';
import { dataStore } from './dataStore';
import { generateId } from '../utils/generateId';
import { logger } from '../utils/logger';

/**
 * Auction Service
 *
 * Handles the complete auction lifecycle:
 * - Creation with validation
 * - State transitions (PENDING -> ACTIVE -> ENDED)
 * - Business rule enforcement
 * - Winner determination
 */

interface CreateAuctionParams {
  title: string;
  description: string;
  startingPrice: number; // in cents
  minimumBidIncrement: number; // in cents
  reservePrice?: number | null; // in cents (hidden minimum)
  startTime: Date;
  endTime?: Date;
  createdBy: string; // userId
  hasTimeLimit?: boolean;
  buyNowPrice?: number | null;
}

interface UpdateAuctionParams {
  title?: string;
  description?: string;
  startingPrice?: number;
  minimumBidIncrement?: number;
  startTime?: Date;
  endTime?: Date;
  hasTimeLimit?: boolean;
  buyNowPrice?: number | null;
}

class AuctionService {
  /**
   * Create a new auction with validation
   */
  async createAuction(params: CreateAuctionParams): Promise<Auction> {
    logger.info(`Creating auction: ${params.title}`);

    // Validate inputs
    this.validateAuctionParams(params);

    // Validate timing
    const now = new Date();
    // Allow start time in the past if it's very recent (within 5 seconds) - for immediate auctions
    const fiveSecondsAgo = new Date(now.getTime() - 5000);
    if (params.startTime < fiveSecondsAgo) {
      throw new AuctionError(
        'Start time cannot be more than 5 seconds in the past',
        ErrorCode.INVALID_AUCTION_STATE
      );
    }

    const hasTimeLimit = params.hasTimeLimit ?? true;
    const buyNowPrice = params.buyNowPrice ?? null;

    let endTime = params.endTime;
    if (!endTime) {
      if (hasTimeLimit) {
        throw new AuctionError('End time is required for time-limited auctions', ErrorCode.INVALID_AUCTION_STATE);
      }
      // Provide a generous default window (e.g., 365 days) for non time-limited auctions
      const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
      endTime = new Date(params.startTime.getTime() + ONE_YEAR_MS);
    }

    if (endTime <= params.startTime) {
      throw new AuctionError(
        'End time must be after start time',
        ErrorCode.INVALID_AUCTION_STATE
      );
    }

    if (buyNowPrice !== null && buyNowPrice < params.startingPrice) {
      throw new AuctionError(
        'Buy Now price must be greater than or equal to the starting price',
        ErrorCode.VALIDATION_ERROR
      );
    }

    // Validate reserve price
    const reservePrice = params.reservePrice ?? null;
    if (reservePrice !== null) {
      if (reservePrice < params.startingPrice) {
        throw new AuctionError(
          'Reserve price must be greater than or equal to the starting price',
          ErrorCode.VALIDATION_ERROR
        );
      }
      if (buyNowPrice !== null && reservePrice >= buyNowPrice) {
        throw new AuctionError(
          'Reserve price must be less than Buy Now price',
          ErrorCode.VALIDATION_ERROR
        );
      }
    }

    // Determine initial status
    const status = params.startTime <= now ? AuctionStatus.ACTIVE : AuctionStatus.PENDING;

    // Create auction object
    const auction: Auction = {
      id: generateId('auction'),
      title: params.title,
      description: params.description,
      startingPrice: params.startingPrice,
      currentPrice: params.startingPrice,
      minimumBidIncrement: params.minimumBidIncrement,
      reservePrice,
      reserveMet: reservePrice === null || params.startingPrice >= reservePrice, // True if no reserve or already met
      startTime: params.startTime,
      endTime,
      hasTimeLimit,
      buyNowPrice,
      status,
      createdAt: now,
      createdBy: params.createdBy,
      winnerId: null,
      bidCount: 0,
    };

    // Save to data store
    dataStore.createAuction(auction);

    logger.info(`Auction created: ${auction.id} (${status})`);
    return auction;
  }

  /**
   * Get auction by ID
   */
  getAuction(auctionId: string): Auction {
    const auction = dataStore.getAuction(auctionId);
    if (!auction) {
      throw new AuctionError(
        `Auction not found: ${auctionId}`,
        ErrorCode.AUCTION_NOT_FOUND
      );
    }
    return auction;
  }

  /**
   * Get all auctions with optional filtering
   */
  getAuctions(filters?: {
    status?: AuctionStatus;
    createdBy?: string;
  }): Auction[] {
    let auctions = dataStore.getAllAuctions();

    if (filters?.status) {
      auctions = auctions.filter(a => a.status === filters.status);
    }

    if (filters?.createdBy) {
      auctions = auctions.filter(a => a.createdBy === filters.createdBy);
    }

    // Sort by start time (newest first)
    return auctions.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }

  /**
   * Update auction (only if PENDING or ACTIVE without bids)
   */
  async updateAuction(auctionId: string, params: UpdateAuctionParams): Promise<Auction> {
    const auction = this.getAuction(auctionId);

    // Can't update ended auctions
    if (auction.status === AuctionStatus.ENDED) {
      throw new AuctionError(
        'Cannot update ended auction',
        ErrorCode.INVALID_AUCTION_STATE
      );
    }

    // Can't update active auctions with bids
    if (auction.status === AuctionStatus.ACTIVE && auction.bidCount > 0) {
      throw new AuctionError(
        'Cannot update active auction with existing bids',
        ErrorCode.INVALID_AUCTION_STATE
      );
    }

    // Validate new values
    if (params.startingPrice !== undefined && params.startingPrice < 0) {
      throw new AuctionError('Starting price must be non-negative', ErrorCode.VALIDATION_ERROR);
    }

    if (params.minimumBidIncrement !== undefined && params.minimumBidIncrement <= 0) {
      throw new AuctionError('Minimum bid increment must be positive', ErrorCode.VALIDATION_ERROR);
    }

    const nextStartingPrice = params.startingPrice ?? auction.startingPrice;
    if (params.buyNowPrice !== undefined && params.buyNowPrice !== null && params.buyNowPrice < nextStartingPrice) {
      throw new AuctionError('Buy Now price must be at least the starting price', ErrorCode.VALIDATION_ERROR);
    }

    if (params.hasTimeLimit === true && !params.endTime) {
      throw new AuctionError('End time is required when enabling a time limit', ErrorCode.INVALID_AUCTION_STATE);
    }

    // Update fields
    const updated: Auction = {
      ...auction,
      ...(params.title && { title: params.title }),
      ...(params.description && { description: params.description }),
      ...(params.startingPrice !== undefined && {
        startingPrice: params.startingPrice,
        currentPrice: params.startingPrice, // Reset current price if no bids
      }),
      ...(params.minimumBidIncrement !== undefined && { minimumBidIncrement: params.minimumBidIncrement }),
      ...(params.startTime && { startTime: params.startTime }),
      ...(params.endTime && { endTime: params.endTime }),
      ...(params.hasTimeLimit !== undefined && { hasTimeLimit: params.hasTimeLimit }),
      ...(params.buyNowPrice !== undefined && { buyNowPrice: params.buyNowPrice ?? null }),
    };

    dataStore.updateAuction(updated);
    logger.info(`Auction updated: ${auctionId}`);

    return updated;
  }

  async selectWinner(auctionId: string, winnerId: string): Promise<Auction> {
    const auction = this.getAuction(auctionId);

    if (auction.status === AuctionStatus.ENDED) {
      throw new AuctionError('Auction already ended', ErrorCode.INVALID_AUCTION_STATE);
    }

    const bids = dataStore.getBidsForAuction(auctionId);
    const winningBid = bids.find((bid) => bid.userId === winnerId);

    if (!winningBid) {
      throw new AuctionError('Selected user has not placed a bid', ErrorCode.VALIDATION_ERROR);
    }

    const updated: Auction = {
      ...auction,
      status: AuctionStatus.ENDED,
      winnerId: winnerId,
      currentPrice: Math.max(auction.currentPrice, winningBid.amount),
    };

    dataStore.updateAuction(updated);
    logger.info(`Auction winner selected manually: ${auctionId} -> ${winnerId}`);

    return updated;
  }

  /**
   * Start an auction (PENDING -> ACTIVE)
   * Called by scheduler or manually
   */
  async startAuction(auctionId: string): Promise<Auction> {
    const auction = this.getAuction(auctionId);

    if (auction.status !== AuctionStatus.PENDING) {
      throw new AuctionError(
        `Cannot start auction in ${auction.status} state`,
        ErrorCode.INVALID_AUCTION_STATE
      );
    }

    const now = new Date();
    if (auction.startTime > now) {
      throw new AuctionError(
        'Cannot start auction before scheduled start time',
        ErrorCode.INVALID_AUCTION_STATE
      );
    }

    const updated: Auction = {
      ...auction,
      status: AuctionStatus.ACTIVE,
    };

    dataStore.updateAuction(updated);
    logger.info(`Auction started: ${auctionId}`);

    return updated;
  }

  /**
   * End an auction (ACTIVE -> ENDED or UNSOLD)
   * Called by scheduler or manually
   * Determines winner if bids exist and reserve price is met
   *
   * - If reserve price not met, auction status becomes UNSOLD (no winner)
   * - If reserve price met (or no reserve), determine winner
   * - Final price is already correct (second-price logic applied during bidding)
   */
  async endAuction(auctionId: string): Promise<Auction> {
    const auction = this.getAuction(auctionId);

    if (auction.status === AuctionStatus.ENDED || auction.status === AuctionStatus.UNSOLD) {
      logger.warn(`Auction already ended: ${auctionId} (${auction.status})`);
      return auction;
    }

    if (auction.status !== AuctionStatus.ACTIVE) {
      throw new AuctionError(
        `Cannot end auction in ${auction.status} state`,
        ErrorCode.INVALID_AUCTION_STATE
      );
    }

    // Check if reserve price was met
    const hasReservePrice = auction.reservePrice !== null;
    const reserveMet = !hasReservePrice || auction.currentPrice >= auction.reservePrice!;

    let status: AuctionStatus;
    let winnerId: string | null;

    if (!reserveMet) {
      // Reserve price not met - auction becomes UNSOLD
      status = AuctionStatus.UNSOLD;
      winnerId = null;
      logger.info(
        `Auction ended UNSOLD: ${auctionId} ` +
        `(reserve: $${auction.reservePrice! / 100}, highest bid: $${auction.currentPrice / 100})`
      );
    } else {
      // Reserve met or no reserve - determine winner
      status = AuctionStatus.ENDED;
      winnerId = this.determineWinner(auctionId);
      logger.info(
        `Auction ended: ${auctionId}, Winner: ${winnerId || 'none'}, ` +
        `Final price: $${auction.currentPrice / 100}`
      );
    }

    const updated: Auction = {
      ...auction,
      status,
      winnerId,
    };

    dataStore.updateAuction(updated);

    return updated;
  }

  /**
   * Cancel an auction (only if PENDING or no bids)
   */
  async cancelAuction(auctionId: string): Promise<void> {
    const auction = this.getAuction(auctionId);

    if (auction.status === AuctionStatus.ENDED) {
      throw new AuctionError(
        'Cannot cancel ended auction',
        ErrorCode.INVALID_AUCTION_STATE
      );
    }

    if (auction.bidCount > 0) {
      throw new AuctionError(
        'Cannot cancel auction with existing bids',
        ErrorCode.INVALID_AUCTION_STATE
      );
    }

    dataStore.deleteAuction(auctionId);
    logger.info(`Auction cancelled: ${auctionId}`);
  }

  /**
   * Check if auction is accepting bids
   */
  canAcceptBids(auction: Auction): boolean {
    const now = new Date();
    return (
      auction.status === AuctionStatus.ACTIVE &&
      now >= auction.startTime &&
      now < auction.endTime
    );
  }

  /**
   * Get time remaining in seconds (0 if ended)
   */
  getTimeRemaining(auction: Auction): number {
    if (auction.status === AuctionStatus.ENDED) {
      return 0;
    }

    const now = new Date();
    const remaining = Math.max(0, auction.endTime.getTime() - now.getTime());
    return Math.floor(remaining / 1000); // seconds
  }

  /**
   * Check if auction is ending soon (within 5 minutes)
   */
  isEndingSoon(auction: Auction): boolean {
    const remaining = this.getTimeRemaining(auction);
    return remaining > 0 && remaining <= 300; // 5 minutes
  }

  /**
   * Determine winner from all bids (highest amount, earliest if tied)
   */
  private determineWinner(auctionId: string): string | null {
    const bids = dataStore.getBidsForAuction(auctionId);

    if (bids.length === 0) {
      return null;
    }

    // Bids are already sorted by amount DESC, then timestamp ASC
    // So the first bid is the winner
    return bids[0].userId;
  }

  /**
   * Update auction's current price and bid count (called by bidding service)
   */
  updateAuctionStats(auctionId: string, newPrice: number): void {
    const auction = this.getAuction(auctionId);

    // Check if reserve price is now met
    const reserveMet = auction.reservePrice === null || newPrice >= auction.reservePrice;

    const updated: Auction = {
      ...auction,
      currentPrice: newPrice,
      bidCount: auction.bidCount + 1,
      reserveMet,
    };

    dataStore.updateAuction(updated);
  }

  /**
   * Check if reserve price is met for an auction
   */
  isReserveMet(auction: Auction): boolean {
    return auction.reserveMet;
  }

  /**
   * Validate auction parameters
   */
  private validateAuctionParams(params: CreateAuctionParams): void {
    if (!params.title || params.title.trim().length === 0) {
      throw new AuctionError('Title is required', ErrorCode.VALIDATION_ERROR);
    }

    if (params.title.length > 200) {
      throw new AuctionError('Title must be 200 characters or less', ErrorCode.VALIDATION_ERROR);
    }

    if (!params.description || params.description.trim().length === 0) {
      throw new AuctionError('Description is required', ErrorCode.VALIDATION_ERROR);
    }

    if (params.startingPrice < 0) {
      throw new AuctionError('Starting price must be non-negative', ErrorCode.VALIDATION_ERROR);
    }

    if (params.minimumBidIncrement <= 0) {
      throw new AuctionError('Minimum bid increment must be positive', ErrorCode.VALIDATION_ERROR);
    }

    if (!params.createdBy || params.createdBy.trim().length === 0) {
      throw new AuctionError('Creator user ID is required', ErrorCode.VALIDATION_ERROR);
    }
  }
}

// Export singleton instance
export const auctionService = new AuctionService();
