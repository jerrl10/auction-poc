import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { logger } from '../utils/logger';
import { Auction, Bid } from '../types';

/**
 * WebSocket Service
 *
 * Provides real-time bidirectional communication using Socket.IO
 *
 * Features:
 * - Room-based subscriptions (per auction)
 * - Broadcast events to specific auctions or all clients
 * - Connection management
 * - Event types: bid, auction_started, auction_ended, auction_ending_soon, outbid
 *
 * Room Structure:
 * - `auction:{auctionId}` - All clients watching specific auction
 * - Global namespace - All connected clients
 */

export enum WebSocketEvent {
  // Client → Server
  SUBSCRIBE_AUCTION = 'subscribe_auction',
  UNSUBSCRIBE_AUCTION = 'unsubscribe_auction',

  // Server → Client
  BID_PLACED = 'bid_placed',
  BID_RETRACTED = 'bid_retracted',
  AUCTION_CREATED = 'auction_created',
  AUCTION_STARTED = 'auction_started',
  AUCTION_ENDED = 'auction_ended',
  AUCTION_ENDING_SOON = 'auction_ending_soon',
  YOU_WERE_OUTBID = 'you_were_outbid',
  AUCTION_UPDATED = 'auction_updated',
  USER_CREATED = 'user_created',

  // Connection
  CONNECTED = 'connected',
  ERROR = 'error',
}

interface BidPlacedEvent {
  bid: Bid;
  auction: Auction;
  isWinning: boolean;
  previousWinnerId?: string | null;
}

interface AuctionEndedEvent {
  auction: Auction;
  winnerId: string | null;
  finalPrice: number;
}

interface AuctionEndingSoonEvent {
  auction: Auction;
  timeRemaining: number; // seconds
}

interface OutbidEvent {
  auctionId: string;
  auctionTitle: string;
  yourBidAmount: number;
  newHighestBid: number;
  newLeaderId: string;
}

interface BidRetractedEvent {
  bid: Bid;
  auction: Auction;
  previousWinner: Bid | null;
  retractedBy: string;
}

interface WebSocketStats {
  totalConnections: number;
  activeConnections: number;
  totalEventsSent: number;
  roomSubscriptions: Map<string, number>; // room -> subscriber count
}

class WebSocketService {
  private io: SocketIOServer | null = null;
  private stats: WebSocketStats = {
    totalConnections: 0,
    activeConnections: 0,
    totalEventsSent: 0,
    roomSubscriptions: new Map(),
  };

  /**
   * Initialize WebSocket server with HTTP server
   */
  initialize(httpServer: HTTPServer): void {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: '*', // Configure based on your frontend URL in production
        methods: ['GET', 'POST'],
      },
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    this.setupEventHandlers();
    logger.info('📡 WebSocket server initialized');
  }

  /**
   * Setup Socket.IO event handlers
   */
  private setupEventHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket: Socket) => {
      this.handleConnection(socket);

      // Handle subscription to auction rooms
      socket.on(WebSocketEvent.SUBSCRIBE_AUCTION, (auctionId: string) => {
        this.handleSubscribeAuction(socket, auctionId);
      });

      socket.on(WebSocketEvent.UNSUBSCRIBE_AUCTION, (auctionId: string) => {
        this.handleUnsubscribeAuction(socket, auctionId);
      });

      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });

      socket.on('error', (error) => {
        logger.error(`WebSocket error for ${socket.id}:`, error);
      });
    });
  }

  /**
   * Handle new client connection
   */
  private handleConnection(socket: Socket): void {
    this.stats.totalConnections++;
    this.stats.activeConnections++;

    logger.info(`🔌 Client connected: ${socket.id} (total: ${this.stats.activeConnections})`);

    // Send welcome message
    socket.emit(WebSocketEvent.CONNECTED, {
      message: 'Connected to auction server',
      socketId: socket.id,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(socket: Socket): void {
    this.stats.activeConnections--;
    logger.info(`🔌 Client disconnected: ${socket.id} (total: ${this.stats.activeConnections})`);
  }

  /**
   * Subscribe socket to auction room
   */
  private handleSubscribeAuction(socket: Socket, auctionId: string): void {
    const room = `auction:${auctionId}`;
    socket.join(room);

    // Update room subscription count
    const currentCount = this.stats.roomSubscriptions.get(room) || 0;
    this.stats.roomSubscriptions.set(room, currentCount + 1);

    logger.info(`📺 ${socket.id} subscribed to ${room} (subscribers: ${currentCount + 1})`);

    // Confirm subscription
    socket.emit('subscribed', {
      auctionId,
      room,
      message: `Subscribed to auction ${auctionId}`,
    });
  }

  /**
   * Unsubscribe socket from auction room
   */
  private handleUnsubscribeAuction(socket: Socket, auctionId: string): void {
    const room = `auction:${auctionId}`;
    socket.leave(room);

    // Update room subscription count
    const currentCount = this.stats.roomSubscriptions.get(room) || 0;
    const newCount = Math.max(0, currentCount - 1);

    if (newCount === 0) {
      this.stats.roomSubscriptions.delete(room);
    } else {
      this.stats.roomSubscriptions.set(room, newCount);
    }

    logger.info(`📺 ${socket.id} unsubscribed from ${room} (subscribers: ${newCount})`);

    // Confirm unsubscription
    socket.emit('unsubscribed', {
      auctionId,
      room,
      message: `Unsubscribed from auction ${auctionId}`,
    });
  }

  // ==================== BROADCAST METHODS ====================

  /**
   * Broadcast bid placed event to auction room AND globally
   */
  broadcastBidPlaced(event: BidPlacedEvent): void {
    if (!this.io) return;

    const room = `auction:${event.auction.id}`;

    // Broadcast to specific auction room
    this.io.to(room).emit(WebSocketEvent.BID_PLACED, {
      bid: event.bid,
      auction: event.auction,
      isWinning: event.isWinning,
      timestamp: new Date().toISOString(),
    });

    // Also broadcast globally for auction list updates
    this.io.emit(WebSocketEvent.BID_PLACED, {
      bid: event.bid,
      auction: event.auction,
      isWinning: event.isWinning,
      timestamp: new Date().toISOString(),
    });

    this.stats.totalEventsSent++;

    logger.debug(
      `📣 Broadcast BID_PLACED to ${room} and globally: ` +
      `$${event.bid.amount / 100} by ${event.bid.userId} (winning: ${event.isWinning})`
    );

    // Notify previous winner they were outbid
    if (event.previousWinnerId && event.previousWinnerId !== event.bid.userId) {
      this.notifyOutbid({
        auctionId: event.auction.id,
        auctionTitle: event.auction.title,
        yourBidAmount: event.auction.currentPrice - event.auction.minimumBidIncrement,
        newHighestBid: event.bid.amount,
        newLeaderId: event.bid.userId,
      }, event.previousWinnerId);
    }
  }

  /**
   * Broadcast auction created event globally
   */
  broadcastAuctionCreated(auction: Auction): void {
    if (!this.io) return;

    // Broadcast globally - no room needed for new auctions
    this.io.emit(WebSocketEvent.AUCTION_CREATED, {
      auction,
      timestamp: new Date().toISOString(),
    });

    this.stats.totalEventsSent++;

    logger.debug(`📣 Broadcast AUCTION_CREATED globally: ${auction.title}`);
  }

  /**
   * Broadcast user created event globally
   */
  broadcastUserCreated(user: any): void {
    if (!this.io) return;

    // Broadcast globally
    this.io.emit(WebSocketEvent.USER_CREATED, {
      user,
      timestamp: new Date().toISOString(),
    });

    this.stats.totalEventsSent++;

    logger.debug(`📣 Broadcast USER_CREATED globally: ${user.name}`);
  }

  /**
   * Broadcast auction started event globally
   */
  broadcastAuctionStarted(auction: Auction): void {
    if (!this.io) return;

    const room = `auction:${auction.id}`;

    // Broadcast to specific auction room
    this.io.to(room).emit(WebSocketEvent.AUCTION_STARTED, {
      auction,
      timestamp: new Date().toISOString(),
    });

    // Also broadcast globally for auction list updates
    this.io.emit(WebSocketEvent.AUCTION_STARTED, {
      auction,
      timestamp: new Date().toISOString(),
    });

    this.stats.totalEventsSent++;

    logger.debug(`📣 Broadcast AUCTION_STARTED to ${room} and globally: ${auction.title}`);
  }

  /**
   * Broadcast auction ended event globally
   */
  broadcastAuctionEnded(event: AuctionEndedEvent): void {
    if (!this.io) return;

    const room = `auction:${event.auction.id}`;

    // Broadcast to specific auction room
    this.io.to(room).emit(WebSocketEvent.AUCTION_ENDED, {
      auction: event.auction,
      winnerId: event.winnerId,
      finalPrice: event.finalPrice,
      timestamp: new Date().toISOString(),
    });

    // Also broadcast globally for auction list updates
    this.io.emit(WebSocketEvent.AUCTION_ENDED, {
      auction: event.auction,
      winnerId: event.winnerId,
      finalPrice: event.finalPrice,
      timestamp: new Date().toISOString(),
    });

    this.stats.totalEventsSent++;

    logger.debug(
      `📣 Broadcast AUCTION_ENDED to ${room} and globally: ` +
      `${event.auction.title} - Winner: ${event.winnerId || 'none'} - $${event.finalPrice / 100}`
    );
  }

  /**
   * Broadcast auction ending soon warning
   */
  broadcastAuctionEndingSoon(event: AuctionEndingSoonEvent): void {
    if (!this.io) return;

    const room = `auction:${event.auction.id}`;

    this.io.to(room).emit(WebSocketEvent.AUCTION_ENDING_SOON, {
      auction: event.auction,
      timeRemaining: event.timeRemaining,
      timestamp: new Date().toISOString(),
    });

    this.stats.totalEventsSent++;

    logger.debug(
      `📣 Broadcast AUCTION_ENDING_SOON to ${room}: ` +
      `${event.auction.title} - ${event.timeRemaining}s remaining`
    );
  }

  /**
   * Notify specific user they were outbid
   */
  private notifyOutbid(event: OutbidEvent, userId: string): void {
    if (!this.io) return;

    // In a real app, you'd map userId to socketId
    // For POC, we broadcast to the room and clients filter by userId
    const room = `auction:${event.auctionId}`;

    this.io.to(room).emit(WebSocketEvent.YOU_WERE_OUTBID, {
      ...event,
      targetUserId: userId, // Client should check if this matches their userId
      timestamp: new Date().toISOString(),
    });

    this.stats.totalEventsSent++;

    logger.debug(`📣 Notify OUTBID to ${room}: user ${userId}`);
  }

  /**
   * Broadcast bid retracted event
   */
  broadcastBidRetracted(event: BidRetractedEvent): void {
    if (!this.io) return;

    const room = `auction:${event.auction.id}`;

    // Broadcast to specific auction room
    this.io.to(room).emit(WebSocketEvent.BID_RETRACTED, {
      bid: event.bid,
      auction: event.auction,
      previousWinner: event.previousWinner,
      retractedBy: event.retractedBy,
      timestamp: new Date().toISOString(),
    });

    // Also broadcast globally for auction list updates
    this.io.emit(WebSocketEvent.BID_RETRACTED, {
      bid: event.bid,
      auction: event.auction,
      previousWinner: event.previousWinner,
      retractedBy: event.retractedBy,
      timestamp: new Date().toISOString(),
    });

    this.stats.totalEventsSent++;

    logger.debug(
      `📣 Broadcast BID_RETRACTED to ${room} and globally: ` +
      `Bid ${event.bid.id} ($${event.bid.amount / 100}) retracted by ${event.retractedBy}`
    );
  }

  /**
   * Broadcast auction updated event (for price changes, etc.)
   */
  broadcastAuctionUpdated(auction: Auction): void {
    if (!this.io) return;

    const room = `auction:${auction.id}`;

    this.io.to(room).emit(WebSocketEvent.AUCTION_UPDATED, {
      auction,
      timestamp: new Date().toISOString(),
    });

    this.stats.totalEventsSent++;
  }

  /**
   * Broadcast to all connected clients
   */
  broadcastGlobal(event: string, data: any): void {
    if (!this.io) return;

    this.io.emit(event, {
      ...data,
      timestamp: new Date().toISOString(),
    });

    this.stats.totalEventsSent++;
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Get number of clients in a room
   */
  async getRoomSize(auctionId: string): Promise<number> {
    if (!this.io) return 0;

    const room = `auction:${auctionId}`;
    const sockets = await this.io.in(room).fetchSockets();
    return sockets.length;
  }

  /**
   * Get all active rooms
   */
  getActiveRooms(): string[] {
    return Array.from(this.stats.roomSubscriptions.keys());
  }

  /**
   * Get WebSocket statistics
   */
  getStats(): WebSocketStats & { activeRooms: number } {
    return {
      ...this.stats,
      activeRooms: this.stats.roomSubscriptions.size,
      roomSubscriptions: new Map(this.stats.roomSubscriptions), // Return copy
    };
  }

  /**
   * Check if WebSocket server is initialized
   */
  isInitialized(): boolean {
    return this.io !== null;
  }

  /**
   * Get Socket.IO server instance (for advanced usage)
   */
  getIO(): SocketIOServer | null {
    return this.io;
  }
}

// Export singleton instance
export const websocketService = new WebSocketService();
