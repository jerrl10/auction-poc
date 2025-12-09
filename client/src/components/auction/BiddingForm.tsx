import { useState, useEffect } from 'react';
import type { Auction, User, Bid } from '../../types';
import { formatPrice, toDollars, toCents } from '../../utils/format';

interface BiddingFormProps {
  auction: Auction;
  currentUser: User;
  userBids: Bid[];
  onSubmit: (amount: number, maxBid?: number, autoBidStep?: number) => Promise<void>;
  submitting: boolean;
}

export function BiddingForm({ auction, currentUser, userBids, onSubmit, submitting }: BiddingFormProps) {
  const [maxBid, setMaxBid] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);

  const minBidAmount = auction.currentPrice + auction.minimumBidIncrement;
  const hasBuyNow = auction.buyNowPrice !== null;
  const buyNowPrice = auction.buyNowPrice ?? 0;

  // Check if user has an active max bid
  const activeMaxBid = userBids.find(bid => bid.maxBid !== null && bid.userId === currentUser.id);
  const currentUserMaxBid = activeMaxBid?.maxBid || null;
  const isWinning = userBids.find(bid => bid.userId === currentUser.id && bid.isWinning);

  // Auto-populate max bid field if user has one
  useEffect(() => {
    if (currentUserMaxBid && !isEditing) {
      setMaxBid(toDollars(currentUserMaxBid));
    }
  }, [currentUserMaxBid, isEditing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const maxBidCents = toCents(maxBid);

    // Validate max bid
    if (maxBidCents < minBidAmount) {
      alert(`Maximum bid must be at least ${formatPrice(minBidAmount)}`);
      return;
    }

    // If user already has a max bid, ensure new one is higher
    if (currentUserMaxBid && maxBidCents <= currentUserMaxBid) {
      alert(
        `New maximum bid must be higher than your current maximum (${formatPrice(currentUserMaxBid)}). ` +
        `You can increase your max bid anytime, but cannot lower it below the current high bid.`
      );
      return;
    }

    // Submit with max bid (amount = maxBid for initial placement)
    await onSubmit(maxBidCents, maxBidCents, undefined);
    setIsEditing(false);
  };

  const handleBuyNow = async () => {
    if (!hasBuyNow) return;
    await onSubmit(buyNowPrice);
  };

  const handleEditMaxBid = () => {
    setIsEditing(true);
    if (currentUserMaxBid) {
      // Pre-fill with current max bid for easy adjustment
      setMaxBid(toDollars(currentUserMaxBid));
    }
  };


  return (
    <div className="bid-form-card">
      <h2>Place Your Max Bid</h2>
      <p className="bidding-as">Bidding as <strong>{currentUser.name}</strong></p>

      {/* Show active max bid status */}
      {currentUserMaxBid && !isEditing ? (
        <div className="max-bid-status">
          <div className="status-header">
            <h3>
              {isWinning ? (
                <span className="status-winning">🏆 You're Winning!</span>
              ) : (
                <span className="status-outbid">⚠️ You've Been Outbid</span>
              )}
            </h3>
          </div>

          <div className="max-bid-details">
            <div className="detail-row">
              <span className="label">Your Maximum Bid:</span>
              <span className="value highlight">{formatPrice(currentUserMaxBid)}</span>
            </div>
            <div className="detail-row">
              <span className="label">Current Price:</span>
              <span className="value">{formatPrice(auction.currentPrice)}</span>
            </div>
            {!isWinning && (
              <div className="detail-row">
                <span className="label">Minimum to Win:</span>
                <span className="value">{formatPrice(minBidAmount)}</span>
              </div>
            )}
          </div>

          <div className="max-bid-explanation">
            <p>
              {isWinning ? (
                <>
                  <strong>Tradera will automatically bid for you</strong> up to your maximum ({formatPrice(currentUserMaxBid)})
                  if someone outbids you. You only pay the minimum needed to win.
                </>
              ) : (
                <>
                  Your maximum bid of {formatPrice(currentUserMaxBid)} was not high enough.
                  <strong> Increase your max bid</strong> to have Tradera automatically bid for you.
                </>
              )}
            </p>
          </div>

          <button
            type="button"
            className="bid-submit-btn secondary"
            onClick={handleEditMaxBid}
          >
            {isWinning ? 'Increase Max Bid' : 'Raise Max Bid'}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="bidding-section">
            {/* Tradera-style explanation */}
            <div className="tradera-explanation">
              <h4>How Max Bid Works (Tradera Style):</h4>
              <ul>
                <li>✅ Set your maximum - the most you're willing to pay</li>
                <li>✅ Tradera automatically bids for you using the minimum increment</li>
                <li>✅ You only pay what's needed to win, not your maximum</li>
                <li>✅ Your max bid stays private</li>
                <li>✅ You can increase your max bid anytime</li>
              </ul>
            </div>

            <div className="current-price-info">
              <div className="info-row">
                <span className="label">Current Price:</span>
                <span className="value">{formatPrice(auction.currentPrice)}</span>
              </div>
              <div className="info-row">
                <span className="label">Minimum Bid:</span>
                <span className="value highlight">{formatPrice(minBidAmount)}</span>
              </div>
              <div className="info-row">
                <span className="label">Bid Increment:</span>
                <span className="value">{formatPrice(auction.minimumBidIncrement)}</span>
              </div>
            </div>

            {/* Max bid input */}
            <div className="form-group">
              <label>Your Maximum Bid ($)</label>
              <input
                type="number"
                step="0.01"
                min={toDollars(currentUserMaxBid ? currentUserMaxBid + 1 : minBidAmount)}
                value={maxBid}
                onChange={(e) => setMaxBid(e.target.value)}
                placeholder={toDollars(minBidAmount)}
                required
                autoFocus={isEditing}
              />
              <small className="form-help">
                {currentUserMaxBid ? (
                  <>Must be higher than your current max ({formatPrice(currentUserMaxBid)})</>
                ) : (
                  <>Must be at least {formatPrice(minBidAmount)}</>
                )}
              </small>
            </div>

            <button type="submit" className="bid-submit-btn" disabled={submitting || !maxBid}>
              {submitting ? 'Placing...' : currentUserMaxBid ? 'Update Max Bid' : 'Place Max Bid'}
            </button>

            {isEditing && currentUserMaxBid && (
              <button
                type="button"
                className="bid-submit-btn cancel"
                onClick={() => setIsEditing(false)}
                disabled={submitting}
              >
                Cancel
              </button>
            )}

            {hasBuyNow && (
              <button
                type="button"
                className="bid-submit-btn buy-now"
                onClick={handleBuyNow}
                disabled={submitting}
              >
                Buy Now - {formatPrice(buyNowPrice)}
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
