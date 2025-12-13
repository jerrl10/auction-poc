import { Auction, Bid, User, AuctionStatus, ErrorCode, AuctionError } from '../types';
import { logger } from '../utils/logger';

/**
 * DataStore - In-memory storage for auctions, bids, and users
 *
 * This is the single source of truth for all data in the system.
 * In production, this would be replaced with a database (PostgreSQL, MongoDB, etc.)
 *
 * Thread-safety: This store is designed to work with the LockManager
 * to prevent race conditions during concurrent operations.
 */
class DataStore {
  private auctions: Map<string, Auction>;
  private bids: Map<string, Bid[]>; // Key: auctionId, Value: array of bids
  private users: Map<string, User>;

  constructor() {
    this.auctions = new Map();
    this.bids = new Map();
    this.users = new Map();

    logger.info('DataStore initialized');
  }

  // ==================== AUCTION OPERATIONS ====================

  /**
   * Create a new auction
   */
  createAuction(auction: Auction): Auction {
    if (this.auctions.has(auction.id)) {
      throw new AuctionError(
        'Auction with this ID already exists',
        ErrorCode.INVALID_INPUT,
        400,
        { auctionId: auction.id }
      );
    }

    this.auctions.set(auction.id, auction);
    this.bids.set(auction.id, []); // Initialize empty bid array

    logger.info(`Auction created: ${auction.id} - ${auction.title}`);
    return auction;
  }

  /**
   * Get auction by ID
   */
  getAuction(auctionId: string): Auction | null {
    return this.auctions.get(auctionId) || null;
  }

  /**
   * Get auction by ID or throw error
   */
  getAuctionOrThrow(auctionId: string): Auction {
    const auction = this.getAuction(auctionId);

    if (!auction) {
      throw new AuctionError(
        `Auction not found: ${auctionId}`,
        ErrorCode.AUCTION_NOT_FOUND,
        404
      );
    }

    return auction;
  }

  /**
   * Update auction
   */
  updateAuction(auction: Auction): Auction {
    this.auctions.set(auction.id, auction);
    logger.debug(`Auction updated: ${auction.id}`);
    return auction;
  }

  /**
   * Delete auction
   */
  deleteAuction(auctionId: string): void {
    this.auctions.delete(auctionId);
    this.bids.delete(auctionId);
    logger.info(`Auction deleted: ${auctionId}`);
  }

  /**
   * Get all auctions
   */
  getAllAuctions(): Auction[] {
    return Array.from(this.auctions.values());
  }

  /**
   * Get all bids across all auctions
   */
  getAllBids(): Bid[] {
    return Array.from(this.bids.values()).flat();
  }

  /**
   * Get auctions by status
   */
  getAuctionsByStatus(status: AuctionStatus): Auction[] {
    return this.getAllAuctions().filter((auction) => auction.status === status);
  }

  /**
   * Get active auctions (sorted by end time)
   */
  getActiveAuctions(): Auction[] {
    return this.getAuctionsByStatus(AuctionStatus.ACTIVE).sort(
      (a, b) => a.endTime.getTime() - b.endTime.getTime()
    );
  }

  // ==================== BID OPERATIONS ====================

  /**
   * Add a bid to an auction
   */
  addBid(bid: Bid): void {
    const bids = this.bids.get(bid.auctionId) || [];

    // Mark previous winning bids as not winning
    bids.forEach((b) => {
      if (b.isWinning) {
        b.isWinning = false;
      }
    });

    // Add new bid
    bids.push(bid);

    // Sort by amount DESC (highest first), then timestamp ASC (earliest first for ties)
    bids.sort((a, b) => {
      if (b.amount !== a.amount) {
        return b.amount - a.amount;
      }
      return a.timestamp.getTime() - b.timestamp.getTime();
    });

    this.bids.set(bid.auctionId, bids);

    logger.debug(`Bid added: ${bid.id} on auction ${bid.auctionId} for $${bid.amount / 100}`);
  }

  /**
   * Create a new bid
   */
  createBid(bid: Bid): Bid {
    this.addBid(bid);
    return bid;
  }

  /**
   * Update an existing bid
   */
  updateBid(bid: Bid): Bid {
    const bids = this.bids.get(bid.auctionId) || [];
    const index = bids.findIndex(b => b.id === bid.id);

    if (index !== -1) {
      bids[index] = bid;
      this.bids.set(bid.auctionId, bids);
    }

    return bid;
  }

  /**
   * Get all bids for an auction (alias for getAuctionBids)
   */
  getBidsForAuction(auctionId: string): Bid[] {
    return this.getAuctionBids(auctionId);
  }

  /**
   * Get all bids for an auction
   * By default, filters out retracted bids unless includeRetracted is true
   */
  getAuctionBids(auctionId: string, includeRetracted: boolean = false): Bid[] {
    const bids = this.bids.get(auctionId) || [];
    if (includeRetracted) {
      return bids;
    }
    return bids.filter(bid => !bid.isRetracted);
  }

  /**
   * Get a specific bid by ID
   */
  getBid(bidId: string): Bid | null {
    for (const bids of this.bids.values()) {
      const bid = bids.find(b => b.id === bidId);
      if (bid) {
        return bid;
      }
    }
    return null;
  }

  /**
   * Get all bids by a user across all auctions
   */
  getBidsByUser(userId: string): Bid[] {
    const allBids: Bid[] = [];
    for (const bids of this.bids.values()) {
      allBids.push(...bids.filter(bid => bid.userId === userId));
    }
    return allBids.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get highest bid for an auction
   */
  getHighestBid(auctionId: string): Bid | null {
    const bids = this.getAuctionBids(auctionId);

    if (bids.length === 0) {
      return null;
    }

    // Bids are sorted by timestamp, but we need highest amount
    return bids.reduce((highest, current) =>
      current.amount > highest.amount ? current : highest
    );
  }

  /**
   * Get bid count for an auction
   */
  getBidCount(auctionId: string): number {
    return this.getAuctionBids(auctionId).length;
  }

  /**
   * Get user's bids on an auction
   */
  getUserBidsOnAuction(userId: string, auctionId: string): Bid[] {
    return this.getAuctionBids(auctionId).filter((bid) => bid.userId === userId);
  }

  // ==================== USER OPERATIONS ====================

  /**
   * Create a new user
   */
  createUser(user: User): User {
    if (this.users.has(user.id)) {
      throw new AuctionError(
        'User with this ID already exists',
        ErrorCode.VALIDATION_ERROR,
        400,
        { userId: user.id }
      );
    }

    this.users.set(user.id, user);
    logger.info(`User created: ${user.id} - ${user.name}`);

    return user;
  }

  /**
   * Get user by ID
   */
  getUser(userId: string): User | null {
    return this.users.get(userId) || null;
  }

  /**
   * Get user by ID or throw error
   */
  getUserOrThrow(userId: string): User {
    const user = this.getUser(userId);

    if (!user) {
      throw new AuctionError(
        `User not found: ${userId}`,
        ErrorCode.USER_NOT_FOUND,
        404
      );
    }

    return user;
  }

  /**
   * Get all users
   */
  getAllUsers(): User[] {
    return Array.from(this.users.values());
  }

  // ==================== STATISTICS & UTILITIES ====================

  /**
   * Get system statistics
   */
  getStats(): {
    totalAuctions: number;
    totalBids: number;
    totalUsers: number;
    auctionsByStatus: Record<AuctionStatus, number>;
  } {
    const allBids = Array.from(this.bids.values()).flat();

    return {
      totalAuctions: this.auctions.size,
      totalBids: allBids.length,
      totalUsers: this.users.size,
      auctionsByStatus: {
        [AuctionStatus.PENDING]: this.getAuctionsByStatus(AuctionStatus.PENDING).length,
        [AuctionStatus.ACTIVE]: this.getAuctionsByStatus(AuctionStatus.ACTIVE).length,
        [AuctionStatus.ENDED]: this.getAuctionsByStatus(AuctionStatus.ENDED).length,
        [AuctionStatus.UNSOLD]: this.getAuctionsByStatus(AuctionStatus.UNSOLD).length,
      },
    };
  }

  /**
   * Clear all data (useful for testing)
   */
  clear(): void {
    this.auctions.clear();
    this.bids.clear();
    this.users.clear();
    logger.warn('DataStore cleared - all data removed');
  }

  /**
   * Get memory usage estimate (for monitoring)
   */
  getMemoryEstimate(): {
    auctions: number;
    bids: number;
    users: number;
    total: number;
  } {
    // Rough estimate of memory usage in bytes
    const auctionSize = JSON.stringify(Array.from(this.auctions.values())).length;
    const bidSize = JSON.stringify(Array.from(this.bids.values())).length;
    const userSize = JSON.stringify(Array.from(this.users.values())).length;

    return {
      auctions: auctionSize,
      bids: bidSize,
      users: userSize,
      total: auctionSize + bidSize + userSize,
    };
  }

  /**
   * Reset all data (for testing purposes after deployment)
   */
  resetAllData(): void {
    this.auctions.clear();
    this.bids.clear();
    this.users.clear();
    logger.info('🔄 All data has been reset (auctions, bids, users)');
  }
}

// Export singleton instance
export const dataStore = new DataStore();
