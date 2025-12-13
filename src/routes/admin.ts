import { Router, Request, Response } from 'express';
import { dataStore } from '../services/dataStore';
import { logger } from '../utils/logger';
import { seedInitialData } from '../utils/seedData';

const router = Router();

/**
 * @route   POST /api/admin/reset
 * @desc    Reset all data (auctions, bids, users)
 * @access  Public (in production, this should be protected!)
 */
router.post('/reset', (_req: Request, res: Response) => {
  try {
    logger.info('Admin action: Data reset requested');

    dataStore.resetAllData();

    // Reseed users after reset
    seedInitialData();

    res.json({
      success: true,
      message: 'All data has been reset successfully and users reseeded',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Admin error: Failed to reset data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset data',
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/admin/stats
 * @desc    Get system statistics
 * @access  Public
 */
router.get('/stats', (_req: Request, res: Response) => {
  try {
    const allAuctions = dataStore.getAllAuctions();
    const stats = {
      auctions: {
        total: allAuctions.length,
        active: allAuctions.filter(a => a.status === 'ACTIVE').length,
        pending: allAuctions.filter(a => a.status === 'PENDING').length,
        ended: allAuctions.filter(a => a.status === 'ENDED').length,
      },
      bids: {
        total: allAuctions.reduce((sum, a) => {
          return sum + dataStore.getBidsForAuction(a.id).length;
        }, 0),
      },
      users: {
        total: dataStore.getAllUsers().length,
      },
    };

    res.json(stats);
  } catch (error: any) {
    logger.error('Admin error: Failed to get stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get statistics',
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/admin/meta
 * @desc    Get system statistics with detailed bid information
 * @access  Public
 */
router.get('/meta', (_req: Request, res: Response) => {
  try {
    const allAuctions = dataStore.getAllAuctions();
    const allUsers = dataStore.getAllUsers();
    const allBids = dataStore.getAllBids();

    // Format bids with more details for debugging
    const formattedBids = allBids.map(bid => ({
      id: bid.id,
      auctionId: bid.auctionId,
      userId: bid.userId,
      userName: dataStore.getUser(bid.userId)?.name || 'Unknown',
      amount: bid.amount,
      amountFormatted: `$${(bid.amount / 100).toFixed(2)}`,
      maxBid: bid.maxBid,
      maxBidFormatted: bid.maxBid ? `$${(bid.maxBid / 100).toFixed(2)}` : null,
      isWinning: bid.isWinning,
      isRetracted: bid.isRetracted,
      timestamp: bid.timestamp,
    }));

    res.json({
      allAuctions,
      allUsers,
      allBids: formattedBids
    });
  } catch (error: any) {
    logger.error('Admin error: Failed to get stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get statistics',
      error: error.message,
    });
  }
});

export default router;
