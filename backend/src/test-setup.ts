import { vi } from 'vitest';

// Set up environment variables at module load time (before any other imports)
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.PORT = '3000';
process.env.NODE_ENV = 'test';
process.env.SLA_THRESHOLD_HOURS = '8';
process.env.LOG_LEVEL = 'error';

// Mock database pool globally
vi.mock('./db/pool.js', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(() => Promise.resolve({
      query: vi.fn(),
      release: vi.fn(),
    })),
    end: vi.fn(),
    on: vi.fn(),
  },
  checkDatabaseConnection: vi.fn(() => Promise.resolve(true)),
  default: {
    query: vi.fn(),
    connect: vi.fn(() => Promise.resolve({
      query: vi.fn(),
      release: vi.fn(),
    })),
    end: vi.fn(),
    on: vi.fn(),
  },
}));

// Mock logger globally
vi.mock('./utils/logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
