import { useState, useEffect } from 'react';
import type { Bid, User, BidRetractionReason } from '../../types';
import { formatPrice, formatDateTime } from '../../utils/format';
import { auctionApi } from '../../services/api';
import { useUser } from '../../contexts/UserContext';

interface BidHistoryProps {
  bids: Bid[];
  userLookup: Map<string, User>;
  auctionStatus: string;
  onBidRetracted?: () => void;
}

export function BidHistory({ bids, userLookup, auctionStatus, onBidRetracted }: BidHistoryProps) {
  const { currentUser } = useUser();
  const [retractingBidId, setRetractingBidId] = useState<string | null>(null);
  const [selectedReason, setSelectedReason] = useState<BidRetractionReason>('TYPO' as BidRetractionReason);
  const [canRetractMap, setCanRetractMap] = useState<Map<string, { canRetract: boolean; reason: string | null }>>(new Map());

  const getBidderLabel = (userId: string) =>
    userLookup.get(userId)?.name || `${userId.substring(0, 10)}...`;

  // Filter bids to show only visible price changes
  // Only show bids that actually changed the visible price
  const getVisibleBids = (): Bid[] => {
    if (bids.length === 0) return [];

    const sortedBids = [...bids].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const visibleBids: Bid[] = [];
    let lastVisiblePrice = 0;

    for (const bid of sortedBids) {
      // Skip retracted bids
      if (bid.isRetracted) continue;

      // Show bid if it changed the visible price
      if (bid.amount > lastVisiblePrice) {
        visibleBids.push(bid);
        lastVisiblePrice = bid.amount;
      }
    }

    // Return in reverse order (newest first) for display
    return visibleBids.reverse();
  };

  const visibleBids = getVisibleBids();

  useEffect(() => {
    if (!currentUser || auctionStatus === 'ENDED') return;

    const checkRetractionEligibility = async () => {
      const map = new Map();

      // Check retraction eligibility for all user's bids (not just visible ones)
      for (const bid of bids) {
        if (bid.userId === currentUser.id && !bid.isRetracted) {
          try {
            const result = await auctionApi.canRetractBid(bid.id, currentUser.id);
            map.set(bid.id, result);
          } catch (error) {
            map.set(bid.id, { canRetract: false, reason: 'Error checking eligibility' });
          }
        }
      }

      setCanRetractMap(map);
    };

    checkRetractionEligibility();
  }, [bids, currentUser, auctionStatus]);

  const handleRetractBid = async (bidId: string) => {
    if (!currentUser) return;

    try {
      await auctionApi.retractBid(bidId, currentUser.id, selectedReason);
      setRetractingBidId(null);
      onBidRetracted?.();
    } catch (error: any) {
      alert(`Failed to retract bid: ${error.message}`);
    }
  };

  const retractionReasons = [
    { value: 'TYPO', label: 'Entered wrong amount (typo)' },
    { value: 'ITEM_DESCRIPTION_CHANGED', label: 'Item description changed by seller' },
    { value: 'CANNOT_CONTACT_SELLER', label: 'Cannot reach seller for questions' },
    { value: 'OTHER', label: 'Other valid reason' },
  ];

  const getRetractionTimeInfo = (bidId: string): string | null => {
    const canRetractInfo = canRetractMap.get(bidId);
    if (!canRetractInfo || canRetractInfo.canRetract) return null;

    const bid = bids.find(b => b.id === bidId);
    if (!bid) return null;

    const timeSinceBid = Date.now() - new Date(bid.timestamp).getTime();
    const minutesAgo = Math.floor(timeSinceBid / 60000);

    if (minutesAgo < 60) {
      return `Bid placed ${minutesAgo} min ago. Can retract within 1 hour.`;
    }

    return canRetractInfo.reason;
  };

  return (
    <div className="bid-history-card">
      <h2>Bid History ({visibleBids.length})</h2>
      {visibleBids.length === 0 ? (
        <p className="no-bids">No bids yet. Be the first!</p>
      ) : (
        <div className="bid-history-list">
          {visibleBids.map((bid, index) => {
            const isOwnBid = currentUser?.id === bid.userId;
            const canRetractInfo = canRetractMap.get(bid.id);
            const showRetractButton = isOwnBid && canRetractInfo?.canRetract && auctionStatus === 'ACTIVE';
            const isCurrentlyLeading = index === 0 && !bid.isRetracted; // First in list (newest) is leading

            return (
              <div
                key={bid.id}
                className={`bid-item ${isCurrentlyLeading ? 'winning' : ''} ${bid.isRetracted ? 'retracted' : ''}`}
              >
                <div className="bid-user">
                  {isCurrentlyLeading && !bid.isRetracted && <span className="winning-badge">LEADING</span>}
                  {bid.isRetracted && <span className="retracted-badge">RETRACTED</span>}
                  <span className="proxy-badge">AUTO-BID</span>
                  <span className="user-id">{getBidderLabel(bid.userId)}</span>
                </div>
                <div className="bid-details">
                  <span className={`bid-amount ${bid.isRetracted ? 'strikethrough' : ''}`}>
                    {formatPrice(bid.amount)}
                  </span>
                  <span className="bid-time">{formatDateTime(bid.timestamp)}</span>
                </div>

                {bid.isRetracted && (
                  <div className="retraction-info">
                    <small>Retracted: {bid.retractionReason?.replace(/_/g, ' ')}</small>
                  </div>
                )}

                {showRetractButton && retractingBidId !== bid.id && (
                  <button
                    className="btn-retract-small"
                    onClick={() => setRetractingBidId(bid.id)}
                    title="Cancel this bid"
                  >
                    Cancel Bid
                  </button>
                )}

                {retractingBidId === bid.id && (
                  <div className="retraction-panel">
                    <div className="retraction-header">
                      <h4>Cancel Your Bid</h4>
                      <div className="bid-amount-large">{formatPrice(bid.amount)}</div>
                    </div>

                    <div className="retraction-warning">
                      <strong>⚠ Important:</strong> Cancelling a bid should only be done in exceptional circumstances. Frequent cancellations may affect your bidding privileges.
                    </div>

                    <div className="form-group">
                      <label htmlFor={`reason-${bid.id}`}>Why are you cancelling this bid?</label>
                      <select
                        id={`reason-${bid.id}`}
                        value={selectedReason}
                        onChange={(e) => setSelectedReason(e.target.value as BidRetractionReason)}
                      >
                        {retractionReasons.map(r => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="retraction-actions">
                      <button
                        className="btn-secondary"
                        onClick={() => setRetractingBidId(null)}
                      >
                        Keep My Bid
                      </button>
                      <button
                        className="btn-danger"
                        onClick={() => handleRetractBid(bid.id)}
                      >
                        Yes, Cancel Bid
                      </button>
                    </div>
                  </div>
                )}

                {isOwnBid && !canRetractInfo?.canRetract && !bid.isRetracted && canRetractInfo && (
                  <div className="retract-info-tooltip">
                    <small>{getRetractionTimeInfo(bid.id)}</small>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
