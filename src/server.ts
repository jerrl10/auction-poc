import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { config } from './config';
import { logger } from './utils/logger';
import { schedulerService } from './services/schedulerService';
import { websocketService } from './services/websocketService';
import { swaggerSpec } from './swagger';
import { seedInitialData } from './utils/seedData';

// Import API routes
import auctionsRouter from './routes/auctions';
import bidsRouter from './routes/bids';
import usersRouter from './routes/users';
import adminRouter from './routes/admin';

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

// API Routes
app.use('/api/auctions', auctionsRouter);
app.use('/api/bids', bidsRouter);
app.use('/api/users', usersRouter);
app.use('/api/admin', adminRouter);

// Create HTTP server and attach WebSocket
const PORT = config.server.port;
const HOST = config.server.host;
const httpServer = createServer(app);

// Initialize WebSocket server
websocketService.initialize(httpServer);

// Get local IP address for network access
const getLocalIp = () => {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
};

// Start server
httpServer.listen(PORT, HOST, () => {
  const localIp = getLocalIp();

  logger.info(`🚀 Auction server started on port ${PORT}`);
  logger.info(`📊 Environment: ${config.server.nodeEnv}`);
  logger.info(`🏥 Health check: http://localhost:${PORT}/health`);
  logger.info(`🌐 Network access: http://${localIp}:${PORT}/health`);
  logger.info(`📚 API Docs: http://localhost:${PORT}/api-docs`);
  logger.info(`📡 WebSocket server ready`);

  // Seed initial data (users)
  seedInitialData();

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
