/**
 * Auction status enum
 */
export enum AuctionStatus {
  PENDING = 'PENDING',   // Created but not started
  ACTIVE = 'ACTIVE',     // Accepting bids
  ENDED = 'ENDED',       // Closed, winner determined
  UNSOLD = 'UNSOLD',     // Ended but reserve price not met
}

/**
 * Auction entity
 */
export interface Auction {
  id: string;
  title: string;
  description: string;
  startingPrice: number;        // In cents (e.g., 10000 = $100.00)
  currentPrice: number;         // In cents
  minimumBidIncrement: number;  // In cents
  reservePrice: number | null;  // In cents, hidden minimum price seller will accept (null if no reserve)
  reserveMet: boolean;          // True if current price meets or exceeds reserve
  startTime: Date;
  endTime: Date;
  hasTimeLimit: boolean;
  buyNowPrice: number | null;   // In cents, null if no buy-now option
  status: AuctionStatus;
  winnerId: string | null;
  createdAt: Date;
  createdBy: string;            // User ID who created the auction
  bidCount: number;             // Total number of bids
}

/**
 * Bid retraction reason enum
 */
export enum BidRetractionReason {
  TYPO = 'TYPO',                           // Made a typo in bid amount
  ITEM_DESCRIPTION_CHANGED = 'ITEM_DESCRIPTION_CHANGED', // Seller changed description
  CANNOT_CONTACT_SELLER = 'CANNOT_CONTACT_SELLER',       // Can't reach seller
  OTHER = 'OTHER',                         // Other valid reason
}

/**
 * Bid entity
 */
export interface Bid {
  id: string;
  auctionId: string;
  userId: string;
  amount: number;               // In cents (actual bid placed)
  maxBid: number | null;        // In cents (user's maximum bid for proxy bidding)
  autoBidStep: number | null;   // In cents (custom increment for auto-bidding)
  timestamp: Date;              // Timestamp when bid was placed
  isWinning: boolean;
  isProxyBid: boolean;          // True if this was placed automatically by proxy system
  isRetracted: boolean;         // True if bid was retracted/cancelled
  retractedAt: Date | null;     // Timestamp when retracted
  retractionReason: BidRetractionReason | null; // Reason for retraction
  message?: string;             // Optional message for bid notifications (e.g., "You've placed your max bid")
  isMaxBidReached?: boolean;    // True if this bid represents reaching the user's max bid
}

/**
 * User entity (mock for POC)
 */
export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

/**
 * Input for creating an auction
 */
export interface CreateAuctionInput {
  title: string;
  description: string;
  startingPrice: number;        // In cents
  minBidIncrement: number;      // In cents
  reservePrice?: number | null; // In cents, hidden minimum (optional)
  startTime: Date | string;     // ISO string or Date
  endTime: Date | string;       // ISO string or Date
  hasTimeLimit?: boolean;
  buyNowPrice?: number | null;
}

/**
 * Input for placing a bid
 */
export interface PlaceBidInput {
  auctionId: string;
  userId: string;
  amount: number;               // In cents (can be actual bid or max bid)
  maxBid?: number;              // In cents (optional, for proxy bidding)
}

/**
 * Error codes
 */
export enum ErrorCode {
  // Auction errors
  AUCTION_NOT_FOUND = 'AUCTION_NOT_FOUND',
  AUCTION_NOT_ACTIVE = 'AUCTION_NOT_ACTIVE',
  AUCTION_NOT_STARTED = 'AUCTION_NOT_STARTED',
  AUCTION_ENDED = 'AUCTION_ENDED',
  INVALID_AUCTION_STATE = 'INVALID_AUCTION_STATE',

  // Bid errors
  BID_TOO_LOW = 'BID_TOO_LOW',
  SAME_USER_HIGHEST = 'SAME_USER_HIGHEST',
  AUCTION_LOCKED = 'AUCTION_LOCKED',
  BID_NOT_FOUND = 'BID_NOT_FOUND',
  BID_ALREADY_RETRACTED = 'BID_ALREADY_RETRACTED',
  BID_RETRACTION_NOT_ALLOWED = 'BID_RETRACTION_NOT_ALLOWED',
  BID_RETRACTION_TIME_EXPIRED = 'BID_RETRACTION_TIME_EXPIRED',

  // User errors
  USER_NOT_FOUND = 'USER_NOT_FOUND',

  // Validation errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  INVALID_PRICE = 'INVALID_PRICE',
  INVALID_TIME_RANGE = 'INVALID_TIME_RANGE',

  // System errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/**
 * Custom error class
 */
export class AuctionError extends Error {
  public code: ErrorCode;
  public statusCode: number;
  public details?: Record<string, any>;

  constructor(
    message: string,
    code: ErrorCode,
    statusCode: number = 400,
    details?: Record<string, any>
  ) {
    super(message);
    this.name = 'AuctionError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * API Success Response
 */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * API Error Response
 */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, any>;
  };
}

/**
 * API Response (union type)
 */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
