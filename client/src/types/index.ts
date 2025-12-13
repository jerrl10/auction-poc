export enum AuctionStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  ENDED = 'ENDED',
  UNSOLD = 'UNSOLD',
}

export interface Auction {
  id: string;
  title: string;
  description: string;
  startingPrice: number;
  currentPrice: number;
  minimumBidIncrement: number;
  reservePrice: number | null;
  reserveMet: boolean;
  startTime: string;
  endTime: string;
  hasTimeLimit: boolean;
  buyNowPrice: number | null;
  status: AuctionStatus;
  winnerId: string | null;
  createdAt: string;
  createdBy: string;
  bidCount: number;
}

export enum BidRetractionReason {
  TYPO = 'TYPO',
  ITEM_DESCRIPTION_CHANGED = 'ITEM_DESCRIPTION_CHANGED',
  CANNOT_CONTACT_SELLER = 'CANNOT_CONTACT_SELLER',
  OTHER = 'OTHER',
}

export interface Bid {
  id: string;
  auctionId: string;
  userId: string;
  amount: number;
  maxBid: number | null;
  autoBidStep: number | null;
  timestamp: string;
  isWinning: boolean;
  isProxyBid: boolean;
  isRetracted: boolean;
  retractedAt: string | null;
  retractionReason: BidRetractionReason | null;
  message?: string;
  isMaxBidReached?: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
  };
}

export interface AuctionDetailResponse {
  auction: Auction;
  timeRemaining: number;
  isEndingSoon: boolean;
  minimumBid: number;
}

export interface PlaceBidResponse {
  bid: Bid;
  auction: Auction;
  isWinning: boolean;
}

// WebSocket Events
export enum WebSocketEvent {
  SUBSCRIBE_AUCTION = 'subscribe_auction',
  UNSUBSCRIBE_AUCTION = 'unsubscribe_auction',
  BID_PLACED = 'bid_placed',
  BID_RETRACTED = 'bid_retracted',
  AUCTION_CREATED = 'auction_created',
  AUCTION_STARTED = 'auction_started',
  AUCTION_ENDED = 'auction_ended',
  AUCTION_ENDING_SOON = 'auction_ending_soon',
  YOU_WERE_OUTBID = 'you_were_outbid',
  USER_CREATED = 'user_created',
  CONNECTED = 'connected',
}

export interface BidPlacedEvent {
  bid: Bid;
  auction: Auction;
  isWinning: boolean;
  timestamp: string;
}

export interface AuctionEndedEvent {
  auction: Auction;
  winnerId: string | null;
  finalPrice: number;
  timestamp: string;
}

export interface AuctionEndingSoonEvent {
  auction: Auction;
  timeRemaining: number;
  timestamp: string;
}

export interface OutbidEvent {
  auctionId: string;
  auctionTitle: string;
  yourBidAmount: number;
  newHighestBid: number;
  newLeaderId: string;
  targetUserId: string;
  timestamp: string;
}

export interface BidRetractedEvent {
  bid: Bid;
  auction: Auction;
  previousWinner: Bid | null;
  retractedBy: string;
  timestamp: string;
}

export interface CanRetractResponse {
  canRetract: boolean;
  reason: string | null;
}

export interface RetractBidResponse {
  bid: Bid;
  auction: Auction;
  previousWinner: Bid | null;
}
