export function formatPrice(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toFixed(2)}`;
}

export function toDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function toCents(dollars: number | string): number {
  const amount = typeof dollars === 'string' ? parseFloat(dollars) : dollars;
  return Math.round(amount * 100);
}

export function suggestNextBid(currentPrice: number, increment: number): number {
  return currentPrice + increment;
}

export function smartRoundBid(amount: number): number {
  if (amount < 1000) return amount;
  if (amount < 10000) return Math.ceil(amount / 100) * 100;
  return Math.ceil(amount / 500) * 500;
}

export function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTimeRemaining(endTime: string): string {
  const now = new Date().getTime();
  const end = new Date(endTime).getTime();
  const diff = end - now;

  if (diff <= 0) {
    return 'Ended';
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  if (days > 0) {
    return `${days}d ${hours}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    // Show minutes with decimal when under 1 hour
    const totalMinutes = diff / (1000 * 60);
    if (totalMinutes < 10) {
      return `${totalMinutes.toFixed(1)} min`;
    }
    return `${minutes} min`;
  } else {
    return `${seconds}s`;
  }
}

export function getAuctionStatusColor(status: string): string {
  switch (status) {
    case 'ACTIVE':
      return '#28a745';
    case 'PENDING':
      return '#ffc107';
    case 'ENDED':
      return '#dc3545';
    default:
      return '#6c757d';
  }
}

export function getAuctionImageUrl(_seed: string | undefined, width = 640, height = 360): string {
  // Return a fixed placeholder image instead of random
  return `https://picsum.photos/seed/auction/${width}/${height}`;
}
