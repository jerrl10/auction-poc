import type { Auction } from '../../types';
import { formatDateTime, formatTimeRemaining, getAuctionImageUrl } from '../../utils/format';

interface AuctionInfoProps {
  auction: Auction;
}

export function AuctionInfo({ auction }: AuctionInfoProps) {
  return (
    <>
      <div className="auction-image-card">
        <img
          src={getAuctionImageUrl(auction.id, 960, 480)}
          alt={`${auction.title} preview`}
          loading="lazy"
        />
      </div>

      <div className="auction-description-card">
        <h2>Description</h2>
        <p>{auction.description}</p>
      </div>

      <div className="auction-timing-card">
        <h2>Timing</h2>
        <div className="timing-info">
          <div>
            <span className="timing-label">Start Time:</span>
            <span className="timing-value">{formatDateTime(auction.startTime)}</span>
          </div>
          <div>
            <span className="timing-label">End Time:</span>
            <span className="timing-value">{formatDateTime(auction.endTime)}</span>
          </div>
          {auction.status === 'ACTIVE' && auction.hasTimeLimit && (
            <div className="time-remaining-large">
              <span className="timing-label">Time Remaining:</span>
              <span className="timing-value countdown">{formatTimeRemaining(auction.endTime)}</span>
            </div>
          )}
          {auction.status === 'ACTIVE' && !auction.hasTimeLimit && (
            <div className="time-remaining-large">
              <span className="timing-label">Time Limit:</span>
              <span className="timing-value">No time limit</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
