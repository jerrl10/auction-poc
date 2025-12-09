import type { Auction } from '../../types';
import { formatPrice } from '../../utils/format';

interface AuctionStatsProps {
  auction: Auction;
}

export function AuctionStats({ auction }: AuctionStatsProps) {
  const hasBuyNow = auction.buyNowPrice !== null;
  const buyNowPrice = auction.buyNowPrice ?? 0;
  const hasReserve = auction.reservePrice !== null;

  return (
    <div className="auction-stats-card">
      <h2>Auction Stats</h2>
      <div className="stats-grid">
        <div className="stat-item">
          <span className="stat-label">Current Price</span>
          <span className="stat-value-large">{formatPrice(auction.currentPrice)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Starting Price</span>
          <span className="stat-value">{formatPrice(auction.startingPrice)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Minimum Increment</span>
          <span className="stat-value">{formatPrice(auction.minimumBidIncrement)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Total Bids</span>
          <span className="stat-value">{auction.bidCount}</span>
        </div>
        {hasBuyNow && (
          <div className="stat-item">
            <span className="stat-label">Buy Now Price</span>
            <span className="stat-value buy-now-price">{formatPrice(buyNowPrice)}</span>
          </div>
        )}
      </div>

      {hasReserve && (
        <div className={`reserve-status-banner ${auction.reserveMet ? 'met' : 'not-met'}`}>
          <div className="reserve-icon">
            {auction.reserveMet ? '✓' : '⚠'}
          </div>
          <div className="reserve-content">
            <div className="reserve-title">
              {auction.reserveMet ? 'Reserve Price Met' : 'Reserve Not Met'}
            </div>
            <div className="reserve-description">
              {auction.reserveMet
                ? 'The current bid has met the seller\'s minimum acceptable price.'
                : 'Current bid is below the seller\'s hidden reserve. Seller may not complete sale unless reserve is met.'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
