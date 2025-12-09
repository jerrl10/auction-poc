import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Auction POC API',
      version: '1.0.0',
      description: `
# Auction System API

A production-grade auction system with high-concurrency bidding support.

## Features
- ✅ Real-time auction management
- ✅ Atomic bid placement with race condition prevention
- ✅ Complete auction lifecycle (PENDING → ACTIVE → ENDED)
- ✅ Lock manager for concurrent operations
- ✅ Business rule validation

## Quick Start

1. **Create a user** → POST /api/users
2. **Create an auction** → POST /api/auctions
3. **Place bids** → POST /api/bids
4. **Check status** → GET /api/auctions/:id

## Money Format
All prices are in **cents** (e.g., 50000 = $500.00)
      `,
      contact: {
        name: 'API Support',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    tags: [
      {
        name: 'Auctions',
        description: 'Auction lifecycle management',
      },
      {
        name: 'Bids',
        description: 'Bidding operations (handles race conditions)',
      },
      {
        name: 'Users',
        description: 'User management',
      },
      {
        name: 'Health',
        description: 'System health checks',
      },
    ],
    components: {
      schemas: {
        Auction: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'auction_1234567890_abc123' },
            title: { type: 'string', example: 'Vintage Leica M3 Camera' },
            description: { type: 'string', example: 'Rare 1960s camera in excellent condition' },
            startingPrice: { type: 'number', example: 50000, description: 'In cents ($500.00)' },
            currentPrice: { type: 'number', example: 65000, description: 'In cents ($650.00)' },
            minimumBidIncrement: { type: 'number', example: 1000, description: 'In cents ($10.00)' },
            startTime: { type: 'string', format: 'date-time', example: '2025-12-04T10:00:00Z' },
            endTime: { type: 'string', format: 'date-time', example: '2025-12-04T11:00:00Z' },
            status: { type: 'string', enum: ['PENDING', 'ACTIVE', 'ENDED'], example: 'ACTIVE' },
            winnerId: { type: 'string', nullable: true, example: 'user_1234567890_xyz789' },
            createdAt: { type: 'string', format: 'date-time' },
            createdBy: { type: 'string', example: 'user_1234567890_xyz789' },
            bidCount: { type: 'number', example: 5 },
          },
        },
        CreateAuctionRequest: {
          type: 'object',
          required: ['title', 'description', 'startingPrice', 'minimumBidIncrement', 'startTime', 'endTime', 'createdBy'],
          properties: {
            title: { type: 'string', example: 'Vintage Leica M3 Camera', maxLength: 200 },
            description: { type: 'string', example: 'Rare 1960s camera in excellent condition' },
            startingPrice: { type: 'number', example: 50000, description: 'In cents ($500.00)', minimum: 0 },
            minimumBidIncrement: { type: 'number', example: 1000, description: 'In cents ($10.00)', minimum: 1 },
            startTime: { type: 'string', format: 'date-time', example: '2025-12-04T10:00:00Z' },
            endTime: { type: 'string', format: 'date-time', example: '2025-12-04T11:00:00Z' },
            createdBy: { type: 'string', example: 'user_1234567890_xyz789', description: 'User ID of auction creator' },
          },
        },
        Bid: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'bid_1234567890_def456' },
            auctionId: { type: 'string', example: 'auction_1234567890_abc123' },
            userId: { type: 'string', example: 'user_1234567890_xyz789' },
            amount: { type: 'number', example: 51000, description: 'In cents ($510.00)' },
            timestamp: { type: 'string', format: 'date-time' },
            isWinning: { type: 'boolean', example: true },
          },
        },
        PlaceBidRequest: {
          type: 'object',
          required: ['auctionId', 'userId', 'amount'],
          properties: {
            auctionId: { type: 'string', example: 'auction_1234567890_abc123' },
            userId: { type: 'string', example: 'user_1234567890_xyz789' },
            amount: { type: 'number', example: 51000, description: 'In cents ($510.00)', minimum: 1 },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'user_1234567890_xyz789' },
            name: { type: 'string', example: 'Alice' },
            email: { type: 'string', format: 'email', example: 'alice@example.com' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        CreateUserRequest: {
          type: 'object',
          required: ['name', 'email'],
          properties: {
            name: { type: 'string', example: 'Alice' },
            email: { type: 'string', format: 'email', example: 'alice@example.com' },
          },
        },
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'object' },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'BID_TOO_LOW' },
                message: { type: 'string', example: 'Bid must be at least $560' },
              },
            },
          },
        },
      },
    },
    paths: {
      '/health': {
        get: {
          tags: ['Health'],
          summary: 'Health check',
          description: 'Check if the server is running',
          responses: {
            200: {
              description: 'Server is healthy',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', example: 'ok' },
                      uptime: { type: 'number', example: 123.45 },
                      timestamp: { type: 'string', format: 'date-time' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/auctions': {
        post: {
          tags: ['Auctions'],
          summary: 'Create a new auction',
          description: 'Creates a new auction with validation',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateAuctionRequest' },
              },
            },
          },
          responses: {
            201: {
              description: 'Auction created successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: { $ref: '#/components/schemas/Auction' },
                    },
                  },
                },
              },
            },
            400: {
              description: 'Validation error',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
        get: {
          tags: ['Auctions'],
          summary: 'Get all auctions',
          description: 'Retrieve all auctions with optional filters',
          parameters: [
            {
              name: 'status',
              in: 'query',
              schema: { type: 'string', enum: ['PENDING', 'ACTIVE', 'ENDED'] },
              description: 'Filter by auction status',
            },
            {
              name: 'createdBy',
              in: 'query',
              schema: { type: 'string' },
              description: 'Filter by creator user ID',
            },
          ],
          responses: {
            200: {
              description: 'List of auctions',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Auction' },
                      },
                      count: { type: 'number', example: 5 },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/auctions/{id}': {
        get: {
          tags: ['Auctions'],
          summary: 'Get auction by ID',
          description: 'Retrieve a single auction with metadata (time remaining, minimum bid, etc.)',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              example: 'auction_1234567890_abc123',
            },
          ],
          responses: {
            200: {
              description: 'Auction details',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: {
                        type: 'object',
                        properties: {
                          auction: { $ref: '#/components/schemas/Auction' },
                          timeRemaining: { type: 'number', example: 3542, description: 'Seconds until end' },
                          isEndingSoon: { type: 'boolean', example: false },
                          minimumBid: { type: 'number', example: 66000, description: 'Next minimum bid in cents' },
                        },
                      },
                    },
                  },
                },
              },
            },
            404: {
              description: 'Auction not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
        put: {
          tags: ['Auctions'],
          summary: 'Update auction',
          description: 'Update auction details (only if PENDING or no bids)',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    description: { type: 'string' },
                    startingPrice: { type: 'number' },
                    minimumBidIncrement: { type: 'number' },
                    startTime: { type: 'string', format: 'date-time' },
                    endTime: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Auction updated',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: { $ref: '#/components/schemas/Auction' },
                    },
                  },
                },
              },
            },
            400: { description: 'Cannot update (has bids or ended)' },
          },
        },
        delete: {
          tags: ['Auctions'],
          summary: 'Cancel auction',
          description: 'Delete auction (only if no bids)',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: { description: 'Auction cancelled' },
            400: { description: 'Cannot cancel (has bids)' },
          },
        },
      },
      '/api/auctions/{id}/start': {
        post: {
          tags: ['Auctions'],
          summary: 'Start auction',
          description: 'Manually start a pending auction',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: { description: 'Auction started' },
            400: { description: 'Invalid state' },
          },
        },
      },
      '/api/auctions/{id}/end': {
        post: {
          tags: ['Auctions'],
          summary: 'End auction',
          description: 'Manually end an active auction and determine winner',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: { description: 'Auction ended, winner determined' },
          },
        },
      },
      '/api/auctions/{id}/bids': {
        get: {
          tags: ['Auctions'],
          summary: 'Get auction bids',
          description: 'Retrieve all bids for an auction (sorted by timestamp DESC)',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: {
              description: 'Bid history',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Bid' },
                      },
                      count: { type: 'number' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/auctions/{id}/winning-bid': {
        get: {
          tags: ['Auctions'],
          summary: 'Get winning bid',
          description: 'Get the current winning bid for an auction',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: {
              description: 'Winning bid (or null if no bids)',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        oneOf: [
                          { $ref: '#/components/schemas/Bid' },
                          { type: 'null' },
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/bids': {
        post: {
          tags: ['Bids'],
          summary: '⚡ Place a bid (CRITICAL ENDPOINT)',
          description: `
**This is the critical high-concurrency endpoint.**

Places a bid with full atomic validation and race condition prevention.

### How it works:
1. Acquires exclusive lock on the auction
2. Validates auction state (ACTIVE, within time window)
3. Validates bid amount (≥ currentPrice + minimumBidIncrement)
4. Validates user (exists, not auction owner)
5. Creates bid and updates auction
6. Releases lock

### Concurrent Safety:
- Uses lock manager with retry (max 3 attempts)
- Lock timeout: 500ms
- Exponential backoff between retries
- Atomic operations within lock

### Business Rules:
- ✅ Bid must be ≥ currentPrice + minimumBidIncrement
- ✅ Auction must be ACTIVE
- ✅ Current time must be within start/end window
- ✅ User cannot bid on their own auction
- ✅ Max bid: $1,000,000
          `,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PlaceBidRequest' },
              },
            },
          },
          responses: {
            201: {
              description: 'Bid placed successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: {
                        type: 'object',
                        properties: {
                          bid: { $ref: '#/components/schemas/Bid' },
                          auction: { $ref: '#/components/schemas/Auction' },
                          isWinning: { type: 'boolean', example: true },
                        },
                      },
                      message: { type: 'string', example: 'You are now winning!' },
                    },
                  },
                },
              },
            },
            400: {
              description: 'Validation error (bid too low, wrong state, etc.)',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
            409: {
              description: 'Lock timeout (auction is busy, retry)',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/api/bids/user/{userId}': {
        get: {
          tags: ['Bids'],
          summary: 'Get user bids',
          description: 'Get all bids by a user across all auctions',
          parameters: [
            {
              name: 'userId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: {
              description: 'User bids',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Bid' },
                      },
                      count: { type: 'number' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/users': {
        post: {
          tags: ['Users'],
          summary: 'Create user',
          description: 'Create a new user',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateUserRequest' },
              },
            },
          },
          responses: {
            201: {
              description: 'User created',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: { $ref: '#/components/schemas/User' },
                    },
                  },
                },
              },
            },
            400: { description: 'Validation error' },
          },
        },
        get: {
          tags: ['Users'],
          summary: 'Get all users',
          description: 'Retrieve all users',
          responses: {
            200: {
              description: 'List of users',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/User' },
                      },
                      count: { type: 'number' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/users/{id}': {
        get: {
          tags: ['Users'],
          summary: 'Get user by ID',
          description: 'Retrieve a single user',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: {
              description: 'User details',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: { $ref: '#/components/schemas/User' },
                    },
                  },
                },
              },
            },
            404: { description: 'User not found' },
          },
        },
      },
    },
  },
  apis: [], // We're using inline definition above
};

export const swaggerSpec = swaggerJsdoc(options);
