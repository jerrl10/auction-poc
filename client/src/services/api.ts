import type {
  Auction,
  Bid,
  User,
  ApiResponse,
  AuctionDetailResponse,
  PlaceBidResponse,
  CanRetractResponse,
  RetractBidResponse,
  BidRetractionReason,
} from '../types';

const API_BASE_URL = '/api';

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  const data: ApiResponse<T> = await response.json();

  if (!data.success) {
    throw new Error(data.error?.message || 'API request failed');
  }

  return data.data as T;
}

export const auctionApi = {
  // Auctions
  async getAllAuctions(status?: string): Promise<Auction[]> {
    const query = status ? `?status=${status}` : '';
    return fetchApi<Auction[]>(`/auctions${query}`);
  },

  async getAuction(id: string): Promise<Auction> {
    const data = await fetchApi<AuctionDetailResponse>(`/auctions/${id}`);
    return data.auction;
  },

  async createAuction(data: {
    title: string;
    description: string;
    startingPrice: number;
    minimumBidIncrement: number;
    reservePrice?: number | null;
    startTime: string;
    endTime?: string;
    createdBy: string;
    hasTimeLimit: boolean;
    buyNowPrice?: number | null;
  }): Promise<Auction> {
    return fetchApi<Auction>('/auctions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async startAuction(id: string): Promise<Auction> {
    return fetchApi<Auction>(`/auctions/${id}/start`, {
      method: 'POST',
    });
  },

  async endAuction(id: string): Promise<Auction> {
    return fetchApi<Auction>(`/auctions/${id}/end`, {
      method: 'POST',
    });
  },

  async selectWinner(id: string, winnerId: string): Promise<Auction> {
    return fetchApi<Auction>(`/auctions/${id}/select-winner`, {
      method: 'POST',
      body: JSON.stringify({ winnerId }),
    });
  },

  async getBidsForAuction(id: string): Promise<Bid[]> {
    return fetchApi<Bid[]>(`/auctions/${id}/bids`);
  },

  async getWinningBid(id: string): Promise<Bid | null> {
    return fetchApi<Bid | null>(`/auctions/${id}/winning-bid`);
  },

  // Bids
  async placeBid(data: {
    auctionId: string;
    userId: string;
    amount: number;
    maxBid?: number;
    autoBidStep?: number;
  }): Promise<PlaceBidResponse> {
    return fetchApi<PlaceBidResponse>('/bids', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getUserBids(userId: string): Promise<Bid[]> {
    return fetchApi<Bid[]>(`/bids/user/${userId}`);
  },

  async getBidHistory(auctionId: string): Promise<Bid[]> {
    return fetchApi<Bid[]>(`/bids/auction/${auctionId}/history`);
  },

  async canRetractBid(bidId: string, userId: string): Promise<CanRetractResponse> {
    return fetchApi<CanRetractResponse>(`/bids/${bidId}/can-retract?userId=${userId}`);
  },

  async retractBid(bidId: string, userId: string, reason: BidRetractionReason): Promise<RetractBidResponse> {
    return fetchApi<RetractBidResponse>(`/bids/${bidId}/retract`, {
      method: 'POST',
      body: JSON.stringify({ userId, reason }),
    });
  },

  // Users
  async getAllUsers(): Promise<User[]> {
    return fetchApi<User[]>('/users');
  },

  async getUser(id: string): Promise<User> {
    return fetchApi<User>(`/users/${id}`);
  },

  async createUser(data: { name: string; email: string }): Promise<User> {
    return fetchApi<User>('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Admin
  async resetAllData(): Promise<{ success: boolean; message: string }> {
    return fetchApi<{ success: boolean; message: string }>('/admin/reset', {
      method: 'POST',
    });
  },
};
