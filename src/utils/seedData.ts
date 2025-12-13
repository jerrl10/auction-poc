import { dataStore } from '../services/dataStore';
import { User } from '../types';
import { generateId } from './generateId';
import { logger } from './logger';

/**
 * Seed initial data for development/testing
 */
export function seedInitialData(): void {
  // Check if users already exist
  const existingUsers = dataStore.getAllUsers();
  if (existingUsers.length > 0) {
    logger.info(`Users already exist (${existingUsers.length}), skipping seed data`);
    return;
  }

  logger.info('Seeding initial data...');

  // Create 5 default users
  const users: User[] = [
    {
      id: generateId('user'),
      name: 'Alice Johnson',
      email: 'alice@example.com',
      createdAt: new Date(),
    },
    {
      id: generateId('user'),
      name: 'Bob Smith',
      email: 'bob@example.com',
      createdAt: new Date(),
    },
    {
      id: generateId('user'),
      name: 'Charlie Brown',
      email: 'charlie@example.com',
      createdAt: new Date(),
    },
    {
      id: generateId('user'),
      name: 'Diana Prince',
      email: 'diana@example.com',
      createdAt: new Date(),
    },
    {
      id: generateId('user'),
      name: 'Eve Davis',
      email: 'eve@example.com',
      createdAt: new Date(),
    },
  ];

  // Add users to dataStore
  users.forEach(user => {
    dataStore.createUser(user);
    logger.info(`✅ Created user: ${user.name} (${user.id})`);
  });

  logger.info(`🎉 Seed data created: ${users.length} users`);
}
