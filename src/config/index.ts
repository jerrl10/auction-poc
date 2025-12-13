import dotenv from 'dotenv';

dotenv.config();

export const config = {
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  auction: {
    lockTimeout: parseInt(process.env.LOCK_TIMEOUT || '500', 10),
    schedulerInterval: parseInt(process.env.SCHEDULER_INTERVAL || '5000', 10), // Check every 5 seconds
    gracePeriod: parseInt(process.env.GRACE_PERIOD || '60000', 10), // 1 minute grace for fail-safe
    bidGracePeriod: parseInt(process.env.BID_GRACE_PERIOD || '2000', 10),
    minAuctionDuration: 5 * 60 * 1000, // 5 minutes
    endingSoonThreshold: 60 * 1000, // 1 minute
  },
  rateLimit: {
    maxBidsPerMinute: parseInt(process.env.MAX_BIDS_PER_MINUTE || '10', 10),
    maxRequestsPerMinute: parseInt(process.env.MAX_REQUESTS_PER_MINUTE || '100', 10),
  },
  websocket: {
    heartbeatInterval: parseInt(process.env.WS_HEARTBEAT_INTERVAL || '30000', 10),
    heartbeatTimeout: parseInt(process.env.WS_HEARTBEAT_TIMEOUT || '10000', 10),
  },
};
