import { io, Socket } from 'socket.io-client';
import { WebSocketEvent } from '../types';
import type {
  BidPlacedEvent,
  AuctionEndedEvent,
  AuctionEndingSoonEvent,
  OutbidEvent,
  Auction,
} from '../types';

class WebSocketService {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<Function>> = new Map();
  private connectionAttempted: boolean = false;

  connect(url: string = 'http://localhost:3000'): void {
    // Only allow one connection attempt per service instance
    if (this.connectionAttempted || this.socket?.connected) {
      return;
    }

    this.connectionAttempted = true;

    this.socket = io(url, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      console.log('✅ WebSocket connected:', this.socket?.id);
    });

    this.socket.on('disconnect', () => {
      console.log('❌ WebSocket disconnected');
    });

    // Setup event listeners
    this.socket.on(WebSocketEvent.BID_PLACED, (data: BidPlacedEvent) => {
      this.emit(WebSocketEvent.BID_PLACED, data);
    });

    this.socket.on(WebSocketEvent.AUCTION_CREATED, (data: { auction: Auction; timestamp: string }) => {
      this.emit(WebSocketEvent.AUCTION_CREATED, data);
    });

    this.socket.on(WebSocketEvent.AUCTION_STARTED, (data: { auction: Auction; timestamp: string }) => {
      this.emit(WebSocketEvent.AUCTION_STARTED, data);
    });

    this.socket.on(WebSocketEvent.AUCTION_ENDED, (data: AuctionEndedEvent) => {
      this.emit(WebSocketEvent.AUCTION_ENDED, data);
    });

    this.socket.on(WebSocketEvent.AUCTION_ENDING_SOON, (data: AuctionEndingSoonEvent) => {
      this.emit(WebSocketEvent.AUCTION_ENDING_SOON, data);
    });

    this.socket.on(WebSocketEvent.YOU_WERE_OUTBID, (data: OutbidEvent) => {
      this.emit(WebSocketEvent.YOU_WERE_OUTBID, data);
    });

    this.socket.on(WebSocketEvent.USER_CREATED, (data: any) => {
      this.emit(WebSocketEvent.USER_CREATED, data);
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.listeners.clear();
    this.connectionAttempted = false;
  }

  subscribeToAuction(auctionId: string): void {
    if (!this.socket) {
      throw new Error('WebSocket not connected');
    }
    this.socket.emit(WebSocketEvent.SUBSCRIBE_AUCTION, auctionId);
  }

  unsubscribeFromAuction(auctionId: string): void {
    if (!this.socket) {
      return;
    }
    this.socket.emit(WebSocketEvent.UNSUBSCRIBE_AUCTION, auctionId);
  }

  on(event: WebSocketEvent, callback: Function): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(event);
      if (callbacks) {
        callbacks.delete(callback);
      }
    };
  }

  private emit(event: string, data: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => callback(data));
    }
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  getSocketId(): string | undefined {
    return this.socket?.id;
  }
}

export const websocketService = new WebSocketService();
