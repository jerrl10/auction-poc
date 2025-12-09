import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { config } from './config';
import { logger } from './utils/logger';
import { dataStore } from './services/dataStore';
import { lockManager } from './services/lockManager';
import { schedulerService } from './services/schedulerService';
import { websocketService } from './services/websocketService';
import { AuctionStatus } from './types';
import { generateAuctionId, generateUserId } from './utils/generateId';
import { swaggerSpec } from './swagger';

// Import API routes
import auctionsRouter from './routes/auctions';
import bidsRouter from './routes/bids';
import usersRouter from './routes/users';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Auction POC API Docs',
}));

// Swagger JSON spec
app.get('/api-docs.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// API Routes (Production)
app.use('/api/auctions', auctionsRouter);
app.use('/api/bids', bidsRouter);
app.use('/api/users', usersRouter);

// Test endpoint: Get data store statistics
app.get('/test/stats', (_req, res) => {
  const stats = dataStore.getStats();
  const lockStats = lockManager.getStats();
  const memoryStats = dataStore.getMemoryEstimate();
  const schedulerStats = schedulerService.getStats();
  const websocketStats = websocketService.getStats();

  res.json({
    dataStore: stats,
    locks: lockStats,
    scheduler: {
      ...schedulerStats,
      isActive: schedulerService.isActive(),
      uptimeSeconds: Math.floor(schedulerStats.uptime / 1000),
    },
    websocket: {
      isInitialized: websocketService.isInitialized(),
      totalConnections: websocketStats.totalConnections,
      activeConnections: websocketStats.activeConnections,
      totalEventsSent: websocketStats.totalEventsSent,
      activeRooms: websocketStats.activeRooms,
    },
    memory: {
      ...memoryStats,
      totalKB: (memoryStats.total / 1024).toFixed(2),
    },
  });
});

// Test endpoint: Create a sample auction
app.post('/test/create-auction', (_req, res) => {
  try {
    const now = new Date();
    const auction = dataStore.createAuction({
      id: generateAuctionId(),
      title: 'Test Auction - Vintage Camera',
      description: 'A beautiful 1960s Leica M3 camera in excellent condition',
      startingPrice: 50000, // $500.00
      currentPrice: 50000,
      minimumBidIncrement: 1000, // $10.00
      reservePrice: null,
      reserveMet: true,
      startTime: now,
      endTime: new Date(now.getTime() + 3600000), // 1 hour from now
      hasTimeLimit: true,
      buyNowPrice: null,
      status: AuctionStatus.ACTIVE,
      winnerId: null,
      createdAt: now,
      createdBy: 'system',
      bidCount: 0,
    });

    res.json({
      success: true,
      data: {
        ...auction,
        currentPriceFormatted: `$${(auction.currentPrice / 100).toFixed(2)}`,
        minimumBidIncrementFormatted: `$${(auction.minimumBidIncrement / 100).toFixed(2)}`,
      },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: {
        message: error.message,
      },
    });
  }
});

// Test endpoint: Create a sample user
app.post('/test/create-user', (req, res) => {
  try {
    const name = req.body.name || 'Test User';
    const user = dataStore.createUser({
      id: generateUserId(),
      name,
      email: `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
      createdAt: new Date(),
    });

    res.json({
      success: true,
      data: user,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: {
        message: error.message,
      },
    });
  }
});

// Test endpoint: Test lock manager
app.post('/test/lock/:auctionId', async (req, res) => {
  const { auctionId } = req.params;

  try {
    // Try to acquire lock
    const acquired = await lockManager.acquireLock(auctionId);

    if (acquired) {
      // Hold lock for 2 seconds to demonstrate
      setTimeout(() => {
        lockManager.releaseLock(auctionId);
        logger.info(`Lock released for ${auctionId} after 2 seconds`);
      }, 2000);

      res.json({
        success: true,
        message: 'Lock acquired! Will be released in 2 seconds.',
        auctionId,
      });
    } else {
      res.status(409).json({
        success: false,
        message: 'Lock already held by another operation',
        auctionId,
      });
    }
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        message: error.message,
      },
    });
  }
});

// Test endpoint: Get all auctions
app.get('/test/auctions', (_req, res) => {
  const auctions = dataStore.getAllAuctions();

  res.json({
    success: true,
    data: auctions.map((auction) => ({
      ...auction,
      currentPriceFormatted: `$${(auction.currentPrice / 100).toFixed(2)}`,
    })),
  });
});

// Create HTTP server and attach WebSocket
const PORT = config.server.port;
const httpServer = createServer(app);

// Initialize WebSocket server
websocketService.initialize(httpServer);

// Start server
httpServer.listen(PORT, () => {
  logger.info(`🚀 Auction server started on port ${PORT}`);
  logger.info(`📊 Environment: ${config.server.nodeEnv}`);
  logger.info(`🏥 Health check: http://localhost:${PORT}/health`);
  logger.info(`📚 API Docs (Swagger): http://localhost:${PORT}/api-docs`);
  logger.info(`📡 WebSocket server ready`);

  // Start the scheduler
  schedulerService.start();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  schedulerService.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  schedulerService.stop();
  process.exit(0);
});
