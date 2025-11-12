import { config } from './config/config';
import { logger } from './utils/logger';
import firebaseService from './services/firebaseService';
import { startMetricsCollection } from './middleware/metrics';
import { initializeServices } from './services/serviceContainer';
import fs from 'fs';
import path from 'path';

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Initialize Firebase
// Firebase service is already initialized as singleton

try {
  // Initialize all services BEFORE importing the app
  logger.info('Initializing services...');
  initializeServices();
  logger.info('Services initialized successfully');
} catch (error) {
  logger.error('Failed to initialize services', { error });
  process.exit(1);
}

// Import app
logger.info('Importing app...');
import app from './app';
logger.info('App imported successfully');

// Start metrics collection
try {
  logger.info('Starting metrics collection...');
  startMetricsCollection();
  logger.info('Metrics collection started');
} catch (error) {
  logger.warn('Failed to start metrics collection', { error });
  // Don't exit - metrics is optional
}

// Handle uncaught exceptions gracefully
process.on('uncaughtException', (err: Error) => {
  logger.error('Uncaught Exception - Shutting down gracefully', {
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack
    }
  });
  
  // Give time for logs to be written
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

// Handle unhandled promise rejections gracefully
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled Rejection - Shutting down gracefully', {
    reason: reason instanceof Error ? {
      name: reason.name,
      message: reason.message,
      stack: reason.stack
    } : reason,
    promise: promise.toString()
  });
  
  // Give time for logs to be written
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

// Start server
const PORT = config.port || 3000;

let server;
try {
  server = app.listen(PORT, () => {
    logger.info(`🚀 Server running on port ${PORT}`);
    logger.info(`📱 Environment: ${config.nodeEnv}`);
    logger.info(`🔥 Firebase initialized successfully`);
    
    if (!config.isProduction) {
      logger.info(`📊 API Documentation available at http://localhost:${PORT}/docs`);
      logger.info(`📋 API Info available at http://localhost:${PORT}/api`);
    }
    
    logger.info(`🔄 Health check available at /health`);
  });
} catch (error) {
  logger.error('Failed to start server', {
    error: {
      message: (error as Error)?.message,
      stack: (error as Error)?.stack
    }
  });
  process.exit(1);
}

// Handle server errors gracefully
server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.syscall !== 'listen') {
    throw error;
  }

  const port = config.port || 3000;
  const bind = typeof port === 'string' ? `Pipe ${port}` : `Port ${port}`;

  switch (error.code) {
    case 'EACCES':
      logger.error(`${bind} requires elevated privileges`);
      process.exit(1);
      break;
    case 'EADDRINUSE':
      logger.error(`${bind} is already in use`);
      process.exit(1);
      break;
    default:
      logger.error('Server error:', {
        code: error.code,
        message: error.message,
        stack: error.stack
      });
      throw error;
  }
});

// Graceful shutdown handler
const gracefulShutdown = (signal: string) => {
  logger.info(`${signal} received. Shutting down gracefully...`);
  
  // Stop accepting new connections
  server.close(() => {
    logger.info('HTTP server closed');
    
    // Close any other connections (database, cache, etc.)
    // Add cleanup for other services here if needed
    
    logger.info('Process terminated gracefully');
    process.exit(0);
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
};

// Handle termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default server;