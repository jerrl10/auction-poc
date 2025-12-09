import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { auctionApi } from '../services/api';
import { useWebSocket } from '../hooks/useWebSocket';
import type { Auction } from '../types';
import { formatPrice, formatDateTime, formatTimeRemaining, getAuctionStatusColor, getAuctionImageUrl } from '../utils/format';
import { WebSocketEvent } from '../types';
import './AuctionList.css';

export function AuctionList() {
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'pending' | 'ended'>('all');
  const ws = useWebSocket();

  useEffect(() => {
    loadAuctions();
    const interval = setInterval(() => {
      setAuctions((prev) => [...prev]); // Trigger re-render for countdown
    }, 1000);
    return () => clearInterval(interval);
  }, [filter]);

  useEffect(() => {
    // Listen for auction updates via WebSocket
    const unsubscribeCreated = ws.on(WebSocketEvent.AUCTION_CREATED, (data: any) => {
      // Add new auction to the list
      setAuctions((prev) => [data.auction, ...prev]);
    });

    const unsubscribeBid = ws.on(WebSocketEvent.BID_PLACED, (data: any) => {
      setAuctions((prev) =>
        prev.map((auction) =>
          auction.id === data.auction.id ? { ...auction, ...data.auction } : auction
        )
      );
    });

    const unsubscribeStarted = ws.on(WebSocketEvent.AUCTION_STARTED, (data: any) => {
      setAuctions((prev) =>
        prev.map((auction) =>
          auction.id === data.auction.id ? { ...auction, ...data.auction } : auction
        )
      );
    });

    const unsubscribeEnded = ws.on(WebSocketEvent.AUCTION_ENDED, (data: any) => {
      setAuctions((prev) =>
        prev.map((auction) =>
          auction.id === data.auction.id ? { ...auction, ...data.auction } : auction
        )
      );
    });

    return () => {
      unsubscribeCreated();
      unsubscribeBid();
      unsubscribeStarted();
      unsubscribeEnded();
    };
  }, [ws]);

  async function loadAuctions() {
    try {
      setLoading(true);
      setError(null);
      const filterValue = filter === 'all' ? undefined : filter.toUpperCase();
      const data = await auctionApi.getAllAuctions(filterValue);
      setAuctions(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auction-list-container">
      <div className="auction-list-header">
        <h1>Live Auctions</h1>
        <div className="filters">
          <button
            className={filter === 'all' ? 'filter-btn active' : 'filter-btn'}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button
            className={filter === 'active' ? 'filter-btn active' : 'filter-btn'}
            onClick={() => setFilter('active')}
          >
            Active
          </button>
          <button
            className={filter === 'pending' ? 'filter-btn active' : 'filter-btn'}
            onClick={() => setFilter('pending')}
          >
            Pending
          </button>
          <button
            className={filter === 'ended' ? 'filter-btn active' : 'filter-btn'}
            onClick={() => setFilter('ended')}
          >
            Ended
          </button>
        </div>
      </div>

      {loading && <div className="loading">Loading auctions...</div>}
      {error && <div className="error">Error: {error}</div>}

      {!loading && !error && auctions.length === 0 && (
        <div className="empty-state">
          <h2>No auctions found</h2>
          <p>Check back later for new auctions!</p>
        </div>
      )}

      <div className="auction-grid">
        {auctions.map((auction) => (
          <Link key={auction.id} to={`/auction/${auction.id}`} className="auction-card">
            <div className="auction-card-image">
              <img src={getAuctionImageUrl(auction.id, 600, 320)} alt={`${auction.title} preview`} loading="lazy" />
            </div>
            <div className="auction-card-header">
              <h3>{auction.title}</h3>
              <span
                className="auction-status-badge"
                style={{ backgroundColor: getAuctionStatusColor(auction.status) }}
              >
                {auction.status}
              </span>
            </div>

            <p className="auction-description">{auction.description}</p>

            <div className="auction-card-stats">
              <div className="stat">
                <span className="stat-value price">{formatPrice(auction.currentPrice)}</span>
                <span className="stat-label">{auction.bidCount} {auction.bidCount === 1 ? 'bid' : 'bids'}</span>
              </div>
            </div>

            <div className="auction-card-footer">
              {auction.status === 'ACTIVE' && auction.hasTimeLimit && (
                <div className="time-remaining">
                  <span>Ends in:</span>
                  <strong>{formatTimeRemaining(auction.endTime)}</strong>
                </div>
              )}
              {auction.status === 'ACTIVE' && !auction.hasTimeLimit && (
                <div className="time-remaining">
                  <span>No time limit</span>
                </div>
              )}
              {auction.status === 'PENDING' && (
                <div className="time-remaining">
                  <span>Starts:</span>
                  <strong>{formatDateTime(auction.startTime)}</strong>
                </div>
              )}
              {auction.status === 'ENDED' && (
                <div className="time-remaining ended">
                  {auction.winnerId ? (
                    <>
                      <span>Winner:</span>
                      <strong>{auction.winnerId.substring(0, 8)}...</strong>
                    </>
                  ) : (
                    <strong>No bids placed</strong>
                  )}
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
