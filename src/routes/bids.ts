import { Router, Request, Response } from 'express';
import { biddingService } from '../services/biddingService';
import { bidRetractionService } from '../services/bidRetractionService';
import { AuctionError, BidRetractionReason } from '../types';
import { logger } from '../utils/logger';

const router = Router();

/**
 * POST /api/bids
 * Place a new bid
 *
 * This is the CRITICAL endpoint for high-concurrency scenarios
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { auctionId, userId, amount, maxBid, autoBidStep } = req.body;

    // Validate required fields
    if (!auctionId || !userId || amount === undefined) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing required fields: auctionId, userId, amount',
        },
      });
      return;
    }

    // Place bid (handles all validation and race conditions)
    // Supports proxy bidding if maxBid is provided
    const result = await biddingService.placeBid({
      auctionId,
      userId,
      amount: Number(amount),
      maxBid: maxBid !== undefined ? Number(maxBid) : undefined,
      autoBidStep: autoBidStep !== undefined ? Number(autoBidStep) : undefined,
    });

    res.status(201).json({
      success: true,
      data: {
        bid: result.bid,
        auction: result.auction,
        isWinning: result.isWinning,
      },
      message: result.isWinning ? 'You are now winning!' : 'Bid placed, but you were outbid',
    });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/bids/user/:userId
 * Get all bids by a user
 */
router.get('/user/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const bids = biddingService.getBidsByUser(userId);

    res.json({
      success: true,
      data: bids,
      count: bids.length,
    });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/bids/auction/:auctionId/user/:userId
 * Get user's bids for a specific auction
 */
router.get('/auction/:auctionId/user/:userId', async (req: Request, res: Response) => {
  try {
    const { auctionId, userId } = req.params;
    const highestBid = biddingService.getUserHighestBid(auctionId, userId);
    const hasBid = biddingService.hasUserBid(auctionId, userId);

    res.json({
      success: true,
      data: {
        highestBid,
        hasBid,
      },
    });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/bids/auction/:auctionId/history
 * Get complete bid history for an auction (sorted by timestamp DESC)
 */
router.get('/auction/:auctionId/history', async (req: Request, res: Response) => {
  try {
    const { auctionId } = req.params;
    const history = biddingService.getBidHistory(auctionId);

    res.json({
      success: true,
      data: history,
      count: history.length,
    });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * POST /api/bids/:bidId/retract
 * Retract/cancel a bid
 */
router.post('/:bidId/retract', async (req: Request, res: Response): Promise<void> => {
  try {
    const { bidId } = req.params;
    const { userId, reason } = req.body;

    // Validate required fields
    if (!userId || !reason) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing required fields: userId, reason',
        },
      });
      return;
    }

    // Validate reason enum
    if (!Object.values(BidRetractionReason).includes(reason)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `Invalid reason. Must be one of: ${Object.values(BidRetractionReason).join(', ')}`,
        },
      });
      return;
    }

    // Retract bid
    const result = await bidRetractionService.retractBid({
      bidId,
      userId,
      reason: reason as BidRetractionReason,
    });

    res.json({
      success: true,
      data: {
        bid: result.bid,
        auction: result.auction,
        previousWinner: result.previousWinner,
      },
      message: 'Bid successfully retracted',
    });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/bids/:bidId/can-retract
 * Check if a bid can be retracted
 */
router.get('/:bidId/can-retract', async (req: Request, res: Response) => {
  try {
    const { bidId } = req.params;
    const { userId } = req.query;

    if (!userId || typeof userId !== 'string') {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing required query parameter: userId',
        },
      });
      return;
    }

    const result = bidRetractionService.canRetractBid(bidId, userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * Error handler helper
 */
function handleError(error: unknown, res: Response): void {
  if (error instanceof AuctionError) {
    logger.warn(`API Error: ${error.message}`);
    res.status(error.statusCode).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
      },
    });
  } else {
    logger.error('Unexpected error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
}

export default router;
