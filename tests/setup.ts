import { config } from 'dotenv';

// Load test environment variables
config({ path: '.env.test' });

// Mock Firebase Admin SDK
jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  credential: {
    cert: jest.fn()
  },
  auth: jest.fn(() => ({
    verifyIdToken: jest.fn(),
    createUser: jest.fn(),
    updateUser: jest.fn(),
    deleteUser: jest.fn()
  })),
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(),
        set: jest.fn(),
        update: jest.fn(),
        delete: jest.fn()
      })),
      add: jest.fn(),
      where: jest.fn(() => ({
        get: jest.fn(),
        orderBy: jest.fn(() => ({
          limit: jest.fn(() => ({
            get: jest.fn()
          }))
        }))
      })),
      orderBy: jest.fn(() => ({
        limit: jest.fn(() => ({
          get: jest.fn()
        }))
      }))
    }))
  })),
  apps: []
}));

// Mock Firebase Client SDK
jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(),
  getApp: jest.fn()
}));

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({
    signInWithEmailAndPassword: jest.fn(),
    signOut: jest.fn()
  }))
}));

// Mock Winston logger
jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

// Global test timeout
jest.setTimeout(30000);

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});
