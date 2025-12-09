import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { auctionApi } from '../services/api';
import { useWebSocket } from '../hooks/useWebSocket';
import { useUser } from '../contexts/UserContext';
import { Toast } from '../components/Toast';
import { BiddingForm } from '../components/auction/BiddingForm';
import { AuctionStats } from '../components/auction/AuctionStats';
import { AuctionInfo } from '../components/auction/AuctionInfo';
import { BidHistory } from '../components/auction/BidHistory';
import { OwnerControls } from '../components/auction/OwnerControls';
import type { Auction, Bid, User } from '../types';
import { WebSocketEvent } from '../types';
import { formatPrice, formatDateTime, getAuctionStatusColor } from '../utils/format';
import './AuctionDetail.css';

interface ToastData {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

export function AuctionDetail() {
  const { id } = useParams<{ id: string }>();
  const { currentUser } = useUser();
  const [auction, setAuction] = useState<Auction | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [selectedWinnerId, setSelectedWinnerId] = useState<string>('');
  const [ownerActionLoading, setOwnerActionLoading] = useState(false);
  const [winnerSubmitting, setWinnerSubmitting] = useState(false);
  const ws = useWebSocket();

  const userLookup = useMemo(() => {
    const map = new Map<string, User>();
    users.forEach((user) => map.set(user.id, user));
    return map;
  }, [users]);

  const getBidderLabel = (userId: string) => userLookup.get(userId)?.name || `${userId.substring(0, 10)}...`;

  useEffect(() => {
    if (!id) return;
    loadData();

    ws.subscribe(id);

    return () => {
      ws.unsubscribe(id);
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;

    const unsubscribeBid = ws.on(WebSocketEvent.BID_PLACED, (data: any) => {
      if (data.auction.id === id) {
        setAuction(data.auction);
        loadBids();

        if (data.isWinning) {
          showToast(`New leading bid: ${formatPrice(data.bid.amount)}!`, 'success');
        }
      }
    });

    const unsubscribeEnded = ws.on(WebSocketEvent.AUCTION_ENDED, (data: any) => {
      if (data.auction.id === id) {
        setAuction(data.auction);
        if (data.winnerId) {
          showToast(`Auction ended! Winner: ${data.winnerId.substring(0, 10)}...`, 'info');
        } else {
          showToast('Auction ended with no bids', 'info');
        }
      }
    });

    const unsubscribeEndingSoon = ws.on(WebSocketEvent.AUCTION_ENDING_SOON, (data: any) => {
      if (data.auction.id === id) {
        const minutes = Math.floor(data.timeRemaining / 60);
        const seconds = data.timeRemaining % 60;
        const timeStr = minutes > 0
          ? `${minutes}.${Math.floor(seconds / 6)} min`
          : `${seconds}s`;
        showToast(`⏰ Auction closing in ${timeStr}`, 'warning');
      }
    });

    const unsubscribeOutbid = ws.on(WebSocketEvent.YOU_WERE_OUTBID, (data: any) => {
      if (data.auctionId === id && currentUser && data.targetUserId === currentUser.id) {
        showToast(`You were outbid! New price: ${formatPrice(data.newHighestBid)}`, 'warning');
      }
    });

    const unsubscribeBidRetracted = ws.on(WebSocketEvent.BID_RETRACTED, (data: any) => {
      if (data.auction.id === id) {
        setAuction(data.auction);
        loadBids();
        showToast('A bid was cancelled. Auction updated.', 'info');
      }
    });

    return () => {
      unsubscribeBid();
      unsubscribeEnded();
      unsubscribeEndingSoon();
      unsubscribeOutbid();
      unsubscribeBidRetracted();
    };
  }, [id, ws, currentUser]);

  useEffect(() => {
    const interval = setInterval(() => {
      setAuction((prev) => (prev ? { ...prev } : null));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  async function loadData() {
    if (!id) return;

    try {
      setLoading(true);
      setError(null);

      const [auctionData, bidsData, usersData] = await Promise.all([
        auctionApi.getAuction(id),
        auctionApi.getBidsForAuction(id),
        auctionApi.getAllUsers(),
      ]);

      setAuction(auctionData);
      setBids(bidsData);
      setUsers(usersData);
      setSelectedWinnerId((prev) => (prev || bidsData[0]?.userId || ''));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadBids() {
    if (!id) return;
    try {
      const bidsData = await auctionApi.getBidsForAuction(id);
      setBids(bidsData);
      setSelectedWinnerId((prev) => (prev || bidsData[0]?.userId || ''));
    } catch (err) {
      console.error('Failed to load bids:', err);
    }
  }

  async function handlePlaceBid(amount: number, maxBid?: number, autoBidStep?: number) {
    if (!id || !currentUser) {
      showToast('Please select a user from the top navigation', 'error');
      return;
    }

    if (auction && currentUser.id === auction.createdBy) {
      showToast('Auction owners cannot place bids on their own listing', 'error');
      return;
    }

    try {
      setSubmitting(true);
      const result = await auctionApi.placeBid({
        auctionId: id,
        userId: currentUser.id,
        amount,
        maxBid,
        autoBidStep,
      });

      setAuction(result.auction);
      await loadBids();

      const message = maxBid
        ? result.isWinning
          ? `Auto-bid set! Max: ${formatPrice(maxBid)}, Step: ${formatPrice(autoBidStep || 0)}. Currently winning at ${formatPrice(result.auction.currentPrice)}.`
          : `Auto-bid set! Max: ${formatPrice(maxBid)}, Step: ${formatPrice(autoBidStep || 0)}. You were outbid.`
        : result.isWinning
          ? `Bid placed successfully! Current price is ${formatPrice(result.auction.currentPrice)}`
          : 'Bid placed, but you were outbid immediately.';

      showToast(message, result.isWinning ? 'success' : 'info');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEndAuction() {
    if (!id) return;
    try {
      setOwnerActionLoading(true);
      const result = await auctionApi.endAuction(id);
      setAuction(result);
      await loadBids();
      setSelectedWinnerId(result.winnerId || selectedWinnerId);
      showToast('Auction ended successfully', 'info');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setOwnerActionLoading(false);
    }
  }

  async function handleStartAuction() {
    if (!id) return;
    try {
      setOwnerActionLoading(true);
      const result = await auctionApi.startAuction(id);
      setAuction(result);
      showToast('Auction started', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setOwnerActionLoading(false);
    }
  }

  async function handleSelectWinner() {
    if (!id || !selectedWinnerId) {
      showToast('Select a bidder before choosing a winner', 'error');
      return;
    }

    try {
      setWinnerSubmitting(true);
      const result = await auctionApi.selectWinner(id, selectedWinnerId);
      setAuction(result);
      await loadBids();
      setSelectedWinnerId(result.winnerId || selectedWinnerId);
      showToast('Winner selected successfully', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setWinnerSubmitting(false);
    }
  }

  function showToast(message: string, type: ToastData['type']) {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
  }

  function removeToast(id: number) {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }

  if (loading) {
    return <div className="loading">Loading auction...</div>;
  }

  if (error || !auction) {
    return <div className="error">Error: {error || 'Auction not found'}</div>;
  }

  const ownerName = userLookup.get(auction.createdBy)?.name || `${auction.createdBy.substring(0, 8)}...`;
  const isOwner = currentUser?.id === auction.createdBy;
  const canBid = auction.status === 'ACTIVE' && currentUser && !isOwner;
  const winnerName = auction.winnerId ? getBidderLabel(auction.winnerId) : null;

  return (
    <div className="auction-detail-container">
      <Link to="/" className="back-link">
        ← Back to Auctions
      </Link>

      <div className="auction-detail-header">
        <div>
          <h1>{auction.title}</h1>
          <span
            className="auction-status-badge"
            style={{ backgroundColor: getAuctionStatusColor(auction.status) }}
          >
            {auction.status}
          </span>
          <p className="auction-owner">Listed by {ownerName}</p>
        </div>
      </div>

      <div className="auction-detail-grid">
        <div className="auction-main-info">
          <AuctionInfo auction={auction} />
          <AuctionStats auction={auction} />
        </div>

        <div className="auction-sidebar">
          {isOwner && (
            <OwnerControls
              auction={auction}
              bids={bids}
              userLookup={userLookup}
              selectedWinnerId={selectedWinnerId}
              onSelectedWinnerChange={setSelectedWinnerId}
              onStartAuction={handleStartAuction}
              onEndAuction={handleEndAuction}
              onSelectWinner={handleSelectWinner}
              loading={ownerActionLoading}
              winnerSubmitting={winnerSubmitting}
            />
          )}

          {canBid && currentUser && (
            <BiddingForm
              auction={auction}
              currentUser={currentUser}
              userBids={bids}
              onSubmit={handlePlaceBid}
              submitting={submitting}
            />
          )}

          {!currentUser && auction.status === 'ACTIVE' && (
            <div className="bid-form-card info">
              <p>Select a user from the navigation above to place bids on this auction.</p>
            </div>
          )}

          {isOwner && auction.status === 'ACTIVE' && (
            <div className="bid-form-card info">
              <p>You own this auction. Select a different user in the navigation to place bids.</p>
            </div>
          )}

          {!canBid && auction.status === 'ENDED' && (
            <div className="auction-ended-card">
              <h2>Auction Ended</h2>
              {auction.winnerId ? (
                <div className="winner-info">
                  <p className="winner-label">Winner</p>
                  <p className="winner-id">{winnerName || auction.winnerId}</p>
                  <p className="final-price">{formatPrice(auction.currentPrice)}</p>
                </div>
              ) : (
                <p className="no-bids">No bids were placed</p>
              )}
            </div>
          )}

          {!canBid && auction.status === 'PENDING' && (
            <div className="auction-pending-card">
              <h2>Auction Not Started</h2>
              <p>This auction will start at:</p>
              <p className="start-time">{formatDateTime(auction.startTime)}</p>
            </div>
          )}

          <BidHistory
            bids={bids}
            userLookup={userLookup}
            auctionStatus={auction.status}
            onBidRetracted={loadBids}
          />
        </div>
      </div>

      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
}
