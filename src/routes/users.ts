import { Router, Request, Response } from 'express';
import { dataStore } from '../services/dataStore';
import { User, AuctionError, ErrorCode } from '../types';
import { generateId } from '../utils/generateId';
import { logger } from '../utils/logger';
import { websocketService } from '../services/websocketService';

const router = Router();

/**
 * POST /api/users
 * Create a new user
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, email } = req.body;

    // Validate required fields
    if (!name || !email) {
      throw new AuctionError('Name and email are required', ErrorCode.VALIDATION_ERROR);
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new AuctionError('Invalid email format', ErrorCode.VALIDATION_ERROR);
    }

    // Check if email already exists
    const existingUsers = dataStore.getAllUsers();
    if (existingUsers.some(u => u.email === email)) {
      throw new AuctionError('Email already exists', ErrorCode.VALIDATION_ERROR);
    }

    const user: User = {
      id: generateId('user'),
      name,
      email,
      createdAt: new Date(),
    };

    dataStore.createUser(user);
    logger.info(`User created: ${user.id} (${user.email})`);

    // Broadcast new user to all connected clients
    websocketService.broadcastUserCreated(user);

    res.status(201).json({
      success: true,
      data: user,
    });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/users
 * Get all users
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const users = dataStore.getAllUsers();

    res.json({
      success: true,
      data: users,
      count: users.length,
    });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/users/:id
 * Get a specific user by ID
 */
router.get('/:id', async (_req: Request, res: Response) => {
  try {
    const { id } = _req.params;
    const user = dataStore.getUser(id);

    if (!user) {
      throw new AuctionError('User not found', ErrorCode.USER_NOT_FOUND);
    }

    res.json({
      success: true,
      data: user,
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
