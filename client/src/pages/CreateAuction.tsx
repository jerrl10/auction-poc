import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auctionApi } from '../services/api';
import { useUser } from '../contexts/UserContext';
import { getAuctionImageUrl } from '../utils/format';
import './CreateAuction.css';

type ListingFormat = 'auction' | 'buyNow' | 'auctionAndBuyNow';

export function CreateAuction() {
  const navigate = useNavigate();
  const { currentUser } = useUser();
  const [listingFormat, setListingFormat] = useState<ListingFormat>('auction');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startingPrice, setStartingPrice] = useState('100.00');
  const [minimumBidIncrement, setMinimumBidIncrement] = useState('10.00');
  const [durationMinutes, setDurationMinutes] = useState('10');
  const [startImmediately, setStartImmediately] = useState(true);
  const [hasTimeLimit, setHasTimeLimit] = useState(true);
  const [buyNowPrice, setBuyNowPrice] = useState('');
  const [reservePrice, setReservePrice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewImageUrl = getAuctionImageUrl(title || currentUser?.id || 'auction-preview', 960, 480);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!currentUser) {
      setError('Please select a user from the navigation to create an auction.');
      return;
    }

    // Validate pricing based on listing format
    let startPriceCents: number;
    let reservePriceCents: number | null = null;
    let buyNowPriceCents: number | null = null;

    if (listingFormat === 'buyNow') {
      // For Buy Now only, use buyNowPrice as the fixed price
      if (!buyNowPrice || parseFloat(buyNowPrice) <= 0) {
        setError('Buy Now price is required for Buy Now listings.');
        return;
      }
      buyNowPriceCents = Math.round(parseFloat(buyNowPrice) * 100);
      startPriceCents = buyNowPriceCents; // Set starting price same as buy now for consistency
    } else {
      // For Auction or Auction + Buy Now
      startPriceCents = Math.round(parseFloat(startingPrice) * 100);
      reservePriceCents = reservePrice ? Math.round(parseFloat(reservePrice) * 100) : null;

      if (listingFormat === 'auctionAndBuyNow') {
        if (!buyNowPrice || parseFloat(buyNowPrice) <= 0) {
          setError('Buy Now price is required for Auction + Buy Now listings.');
          return;
        }
        buyNowPriceCents = Math.round(parseFloat(buyNowPrice) * 100);
      }

      if (reservePriceCents && reservePriceCents < startPriceCents) {
        setError('Reserve price must be greater than or equal to starting price.');
        return;
      }

      if (buyNowPriceCents && buyNowPriceCents < startPriceCents) {
        setError('Buy Now price must be greater than or equal to starting price.');
        return;
      }

      if (reservePriceCents && buyNowPriceCents && reservePriceCents >= buyNowPriceCents) {
        setError('Reserve price must be less than Buy Now price.');
        return;
      }
    }

    try {
      setSubmitting(true);

      const now = new Date();
      const startTime = startImmediately
        ? new Date(now.getTime() - 1000)
        : new Date(now.getTime() + 60000);

      const endTime = hasTimeLimit
        ? new Date(startTime.getTime() + parseInt(durationMinutes) * 60000)
        : undefined;

      const auctionData = {
        title,
        description,
        startingPrice: startPriceCents,
        minimumBidIncrement: Math.round(parseFloat(minimumBidIncrement) * 100),
        reservePrice: reservePriceCents,
        startTime: startTime.toISOString(),
        endTime: endTime?.toISOString(),
        createdBy: currentUser.id,
        hasTimeLimit,
        buyNowPrice: buyNowPriceCents,
      };

      let created = await auctionApi.createAuction(auctionData);

      // Only start manually if the auction is still pending (e.g., scheduled start in future)
      if (startImmediately && created.status === 'PENDING') {
        created = await auctionApi.startAuction(created.id);
      }

      // Reset form
      setTitle('');
      setDescription('');
      setStartingPrice('100.00');
      setMinimumBidIncrement('10.00');
      setDurationMinutes('10');
      setHasTimeLimit(true);
      setBuyNowPrice('');
      setReservePrice('');

      navigate(`/auction/${created.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="create-auction-container">
      <div className="create-auction-header">
        <h1>Create Auction</h1>
        <p className="subtitle">Set up a new auction for bidding</p>
      </div>

      {!currentUser && (
        <div className="warning-panel">
          <div className="warning-icon">⚠</div>
          <h3>No User Selected</h3>
          <p>Select a user from the navigation above to create an auction as that user.</p>
          <button onClick={() => navigate('/create-user')} className="btn-primary">
            Create New User
          </button>
        </div>
      )}

      {currentUser && (
        <>
          <div className="info-banner">
            Creating auction as <strong>{currentUser.name}</strong>
          </div>

          <div className="auction-preview-card">
            <img src={previewImageUrl} alt="Auction preview" />
            <p>This mock image will be displayed for the listing to keep demos visual.</p>
          </div>

          <div className="create-auction-content">
          <form onSubmit={handleSubmit} className="create-auction-form">
            <div className="form-section">
              <h2>Basic Information</h2>

              <div className="form-group">
                <label htmlFor="title">Auction Title *</label>
                <input
                  type="text"
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Vintage Camera, Rare Book, etc."
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="description">Description *</label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the item in detail..."
                  rows={4}
                  required
                />
              </div>
            </div>

            <div className="form-section">
              <h2>Listing Format</h2>
              <p className="section-description">Choose how you want to sell your item</p>

              <div className="format-selector">
                <label className={`format-option ${listingFormat === 'auction' ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="listingFormat"
                    value="auction"
                    checked={listingFormat === 'auction'}
                    onChange={(e) => setListingFormat(e.target.value as ListingFormat)}
                  />
                  <div className="format-content">
                    <div className="format-icon">🔨</div>
                    <div className="format-title">Auction</div>
                    <div className="format-description">Let buyers bid on your item. Highest bidder wins.</div>
                  </div>
                </label>

                <label className={`format-option ${listingFormat === 'buyNow' ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="listingFormat"
                    value="buyNow"
                    checked={listingFormat === 'buyNow'}
                    onChange={(e) => setListingFormat(e.target.value as ListingFormat)}
                  />
                  <div className="format-content">
                    <div className="format-icon">⚡</div>
                    <div className="format-title">Buy Now</div>
                    <div className="format-description">Set a fixed price. First buyer gets it instantly.</div>
                  </div>
                </label>

                <label className={`format-option ${listingFormat === 'auctionAndBuyNow' ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="listingFormat"
                    value="auctionAndBuyNow"
                    checked={listingFormat === 'auctionAndBuyNow'}
                    onChange={(e) => setListingFormat(e.target.value as ListingFormat)}
                  />
                  <div className="format-content">
                    <div className="format-icon">🔨⚡</div>
                    <div className="format-title">Auction + Buy Now</div>
                    <div className="format-description">Bidding + instant purchase option at fixed price.</div>
                  </div>
                </label>
              </div>
            </div>

            <div className="form-section">
              <h2>Pricing</h2>

              {listingFormat === 'buyNow' ? (
                <div className="form-group">
                  <label htmlFor="buyNowPrice">Fixed Price *</label>
                  <div className="input-with-prefix">
                    <span className="prefix">$</span>
                    <input
                      type="number"
                      id="buyNowPrice"
                      value={buyNowPrice}
                      onChange={(e) => setBuyNowPrice(e.target.value)}
                      step="0.01"
                      min="0.01"
                      placeholder="e.g., 250.00"
                      required
                    />
                  </div>
                  <small className="form-help">
                    Set the price buyers will pay to purchase this item immediately.
                  </small>
                </div>
              ) : (
                <>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="startingPrice">Starting Price *</label>
                      <div className="input-with-prefix">
                        <span className="prefix">$</span>
                        <input
                          type="number"
                          id="startingPrice"
                          value={startingPrice}
                          onChange={(e) => setStartingPrice(e.target.value)}
                          step="0.01"
                          min="0.01"
                          required
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label htmlFor="minimumBidIncrement">Minimum Bid Increment *</label>
                      <div className="input-with-prefix">
                        <span className="prefix">$</span>
                        <input
                          type="number"
                          id="minimumBidIncrement"
                          value={minimumBidIncrement}
                          onChange={(e) => setMinimumBidIncrement(e.target.value)}
                          step="0.01"
                          min="0.01"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="reservePrice">Reserve Price (optional, hidden) 🔒</label>
                    <div className="input-with-prefix">
                      <span className="prefix">$</span>
                      <input
                        type="number"
                        id="reservePrice"
                        value={reservePrice}
                        onChange={(e) => setReservePrice(e.target.value)}
                        step="0.01"
                        min={startingPrice}
                        placeholder="Leave blank for no reserve"
                      />
                    </div>
                    <small className="form-help">
                      <strong>What is a reserve price?</strong> A hidden minimum you'll accept. Bidders see only whether it's met, not the actual amount. Protects you from selling too low.
                      {reservePrice && parseFloat(reservePrice) > 0 && (
                        <span className="form-help-success"> ✓ Reserve set at ${parseFloat(reservePrice).toFixed(2)}</span>
                      )}
                    </small>
                  </div>

                  {listingFormat === 'auctionAndBuyNow' && (
                    <div className="form-group">
                      <label htmlFor="buyNowPrice">Buy Now Price *</label>
                      <div className="input-with-prefix">
                        <span className="prefix">$</span>
                        <input
                          type="number"
                          id="buyNowPrice"
                          value={buyNowPrice}
                          onChange={(e) => setBuyNowPrice(e.target.value)}
                          step="0.01"
                          min={reservePrice || startingPrice}
                          placeholder="e.g., 500.00"
                          required
                        />
                      </div>
                      <small className="form-help">
                        Set a price where bidders can instantly win and end the auction. Great for items you're willing to sell at a fixed price.
                        {buyNowPrice && parseFloat(buyNowPrice) > 0 && (
                          <span className="form-help-success"> ✓ Instant win at ${parseFloat(buyNowPrice).toFixed(2)}</span>
                        )}
                      </small>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="form-section">
              <h2>Timing</h2>

              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={hasTimeLimit}
                    onChange={(e) => setHasTimeLimit(e.target.checked)}
                  />
                  <span>Enforce a time limit</span>
                </label>
                <small className="form-help">
                  {hasTimeLimit
                    ? 'Auction will automatically end once the timer hits zero'
                    : 'Auction stays open until you manually select a winner or end it'}
                </small>
              </div>

              {hasTimeLimit && (
                <div className="form-group">
                  <label htmlFor="durationMinutes">Duration (minutes) *</label>
                  <input
                    type="number"
                    id="durationMinutes"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(e.target.value)}
                    min="1"
                    required
                  />
                  <small className="form-help">Auction will last for this many minutes</small>
                </div>
              )}

              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={startImmediately}
                    onChange={(e) => setStartImmediately(e.target.checked)}
                  />
                  <span>Start auction immediately</span>
                </label>
                <small className="form-help">
                  {startImmediately
                    ? 'Auction will start as soon as it\'s created'
                    : 'Auction will be scheduled to start in 1 minute'}
                </small>
              </div>
            </div>

            {error && <div className="error-message">{error}</div>}

            <div className="form-actions">
              <button type="button" onClick={() => navigate('/')} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={submitting} className="btn-primary">
                {submitting ? 'Creating...' : 'Create Auction'}
              </button>
            </div>
          </form>
          </div>
        </>
      )}
    </div>
  );
}
