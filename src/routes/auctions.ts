import { Router, Request, Response } from 'express';
import { auctionService } from '../services/auctionService';
import { biddingService } from '../services/biddingService';
import { AuctionError, ErrorCode } from '../types';
import { logger } from '../utils/logger';
import { websocketService } from '../services/websocketService';

const router = Router();

/**
 * POST /api/auctions
 * Create a new auction
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      title,
      description,
      startingPrice,
      minimumBidIncrement,
      reservePrice,
      startTime,
      endTime,
      createdBy,
      hasTimeLimit,
      buyNowPrice,
    } = req.body;

    // Convert string dates to Date objects
    const auction = await auctionService.createAuction({
      title,
      description,
      startingPrice: Number(startingPrice),
      minimumBidIncrement: Number(minimumBidIncrement),
      reservePrice: reservePrice !== undefined && reservePrice !== null
        ? Number(reservePrice)
        : null,
      startTime: new Date(startTime),
      endTime: endTime ? new Date(endTime) : undefined,
      createdBy,
      hasTimeLimit: hasTimeLimit !== undefined ? Boolean(hasTimeLimit) : undefined,
      buyNowPrice: buyNowPrice !== undefined && buyNowPrice !== null
        ? Number(buyNowPrice)
        : null,
    });

    // Broadcast new auction to all connected clients
    websocketService.broadcastAuctionCreated(auction);

    res.status(201).json({
      success: true,
      data: auction,
    });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/auctions
 * Get all auctions (with optional filters)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, createdBy } = req.query;

    const auctions = auctionService.getAuctions({
      status: status as any,
      createdBy: createdBy as string,
    });

    res.json({
      success: true,
      data: auctions,
      count: auctions.length,
    });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/auctions/:id
 * Get a specific auction by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const auction = auctionService.getAuction(id);

    // Include additional info
    const timeRemaining = auctionService.getTimeRemaining(auction);
    const isEndingSoon = auctionService.isEndingSoon(auction);
    const minimumBid = auction.currentPrice + auction.minimumBidIncrement;
    const reserveMet = auctionService.isReserveMet(auction);

    // Hide reserve price from non-owners
    const auctionData = { ...auction };
    // In a real app, we'd check if requester is the owner before showing reservePrice
    // For POC, we'll show reservePrice only to owner in frontend

    res.json({
      success: true,
      data: {
        auction: auctionData,
        timeRemaining,
        isEndingSoon,
        minimumBid,
        reserveMet,
      },
    });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * PUT /api/auctions/:id
 * Update an auction (only if pending or no bids)
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, startingPrice, minimumBidIncrement, startTime, endTime } = req.body;

    const auction = await auctionService.updateAuction(id, {
      title,
      description,
      startingPrice: startingPrice ? Number(startingPrice) : undefined,
      minimumBidIncrement: minimumBidIncrement ? Number(minimumBidIncrement) : undefined,
      startTime: startTime ? new Date(startTime) : undefined,
      endTime: endTime ? new Date(endTime) : undefined,
    });

    res.json({
      success: true,
      data: auction,
    });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * POST /api/auctions/:id/start
 * Manually start an auction
 */
router.post('/:id/start', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const auction = await auctionService.startAuction(id);

    res.json({
      success: true,
      data: auction,
      message: 'Auction started successfully',
    });

    websocketService.broadcastAuctionStarted(auction);
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * POST /api/auctions/:id/end
 * Manually end an auction
 */
router.post('/:id/end', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const auction = await auctionService.endAuction(id);

    res.json({
      success: true,
      data: auction,
      message: `Auction ended. Winner: ${auction.winnerId || 'none'}`,
    });

    websocketService.broadcastAuctionEnded({
      auction,
      winnerId: auction.winnerId,
      finalPrice: auction.currentPrice,
    });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * POST /api/auctions/:id/select-winner
 * Manually select a winner (owner decision)
 */
router.post('/:id/select-winner', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { winnerId } = req.body;

    if (!winnerId) {
      throw new AuctionError('winnerId is required', ErrorCode.VALIDATION_ERROR);
    }

    const auction = await auctionService.selectWinner(id, winnerId);

    res.json({
      success: true,
      data: auction,
      message: 'Auction winner selected successfully',
    });

    websocketService.broadcastAuctionEnded({
      auction,
      winnerId: auction.winnerId,
      finalPrice: auction.currentPrice,
    });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * DELETE /api/auctions/:id
 * Cancel an auction (only if no bids)
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await auctionService.cancelAuction(id);

    res.json({
      success: true,
      message: 'Auction cancelled successfully',
    });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/auctions/:id/bids
 * Get all bids for an auction
 */
router.get('/:id/bids', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const bids = biddingService.getBidHistory(id);

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
 * GET /api/auctions/:id/winning-bid
 * Get current winning bid
 */
router.get('/:id/winning-bid', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const winningBid = biddingService.getWinningBid(id);

    res.json({
      success: true,
      data: winningBid,
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
