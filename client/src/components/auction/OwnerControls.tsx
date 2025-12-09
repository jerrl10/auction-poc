import type { Auction, Bid, User } from '../../types';

interface OwnerControlsProps {
  auction: Auction;
  bids: Bid[];
  userLookup: Map<string, User>;
  selectedWinnerId: string;
  onSelectedWinnerChange: (winnerId: string) => void;
  onStartAuction: () => Promise<void>;
  onEndAuction: () => Promise<void>;
  onSelectWinner: () => Promise<void>;
  loading: boolean;
  winnerSubmitting: boolean;
}

export function OwnerControls({
  auction,
  bids,
  userLookup,
  selectedWinnerId,
  onSelectedWinnerChange,
  onStartAuction,
  onEndAuction,
  onSelectWinner,
  loading,
  winnerSubmitting,
}: OwnerControlsProps) {
  const getBidderLabel = (userId: string) =>
    userLookup.get(userId)?.name || `${userId.substring(0, 10)}...`;

  const bidderOptions = Array.from(new Set(bids.map((bid) => bid.userId))).map((id) => ({
    id,
    name: getBidderLabel(id),
  }));

  return (
    <div className="owner-controls-card">
      <h2>Owner Controls</h2>
      {auction.status === 'PENDING' && (
        <button
          type="button"
          className="bid-submit-btn secondary"
          onClick={onStartAuction}
          disabled={loading}
        >
          {loading ? 'Starting...' : 'Start Auction Now'}
        </button>
      )}

      {auction.status === 'ACTIVE' && (
        <>
          <button
            type="button"
            className="bid-submit-btn warning"
            onClick={onEndAuction}
            disabled={loading}
          >
            {loading ? 'Ending...' : 'End Auction Now'}
          </button>

          <div className="form-group">
            <label>Sell to Participant</label>
            {bids.length === 0 ? (
              <small className="form-help">No bids yet</small>
            ) : (
              <select value={selectedWinnerId} onChange={(e) => onSelectedWinnerChange(e.target.value)}>
                {bidderOptions.map((bidder) => (
                  <option key={bidder.id} value={bidder.id}>
                    {bidder.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <button
            type="button"
            className="bid-submit-btn"
            onClick={onSelectWinner}
            disabled={winnerSubmitting || bids.length === 0}
          >
            {winnerSubmitting ? 'Selecting...' : 'Confirm Winner'}
          </button>
        </>
      )}

      {auction.status === 'ENDED' && (
        <p className="form-help">
          Auction finalized {auction.winnerId ? `with ${getBidderLabel(auction.winnerId)}` : 'without a winning bid'}.
        </p>
      )}
    </div>
  );
}
