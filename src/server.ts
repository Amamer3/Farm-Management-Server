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

// Wrap startup in async function to handle dynamic imports
async function startServer() {
  // Use console as fallback since logger might not be ready
  console.log('Starting server initialization...');

  try {
    // Initialize all services BEFORE importing the app
    console.log('Initializing services...');
    try {
      logger.info('Initializing services...');
    } catch (e) {
      // Logger might not be ready yet
    }
    
    initializeServices();
    console.log('Services initialized successfully');
    try {
      logger.info('Services initialized successfully');
    } catch (e) {
      // Logger might not be ready yet
    }
  } catch (error: any) {
    console.error('Failed to initialize services:', error);
    console.error('Error details:', {
      message: error?.message,
      stack: error?.stack,
      name: error?.name
    });
    try {
      logger.error('Failed to initialize services', { error });
    } catch (e) {
      // Logger might not be ready yet
    }
    process.exit(1);
  }

  // Import app - use dynamic import to catch errors
  console.log('Importing app...');
  try {
    logger.info('Importing app...');
  } catch (e) {
    // Logger might not be ready yet
  }

  // Use dynamic import to catch module loading errors
  let app;
  try {
    const appModule = await import('./app');
    app = appModule.default;
    console.log('App imported successfully');
    try {
      logger.info('App imported successfully');
    } catch (e) {
      // Logger might not be ready yet
    }
  } catch (error: any) {
    console.error('❌ Failed to import app module:', error);
    console.error('Error details:', {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
      code: error?.code
    });
    try {
      logger.error('Failed to import app module', { error });
    } catch (e) {
      // Logger might not be ready yet
    }
    process.exit(1);
  }

  // Start metrics collection
  try {
    console.log('Starting metrics collection...');
    try {
      logger.info('Starting metrics collection...');
    } catch (e) {
      // Logger might not be ready yet
    }
    startMetricsCollection();
    console.log('Metrics collection started');
    try {
      logger.info('Metrics collection started');
    } catch (e) {
      // Logger might not be ready yet
    }
  } catch (error) {
    console.warn('Failed to start metrics collection:', error);
    try {
      logger.warn('Failed to start metrics collection', { error });
    } catch (e) {
      // Logger might not be ready yet
    }
    // Don't exit - metrics is optional
  }

  // Start server
  const PORT = config.port || 3000;
  console.log(`Starting server on port ${PORT}...`);

  let server;
  try {
    server = app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📱 Environment: ${config.nodeEnv}`);
      try {
        logger.info(`🚀 Server running on port ${PORT}`);
        logger.info(`📱 Environment: ${config.nodeEnv}`);
        logger.info(`🔥 Firebase initialized successfully`);
        
        if (!config.isProduction) {
          logger.info(`📊 API Documentation available at http://localhost:${PORT}/docs`);
          logger.info(`📋 API Info available at http://localhost:${PORT}/api`);
        }
        
        logger.info(`🔄 Health check available at /health`);
      } catch (e) {
        // Logger might not be ready yet
      }
    });
    console.log('Server listen() called successfully');
  } catch (error) {
    console.error('Failed to start server:', error);
    try {
      logger.error('Failed to start server', {
        error: {
          message: (error as Error)?.message,
          stack: (error as Error)?.stack
        }
      });
    } catch (e) {
      // Logger might not be ready yet
    }
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
        console.error(`${bind} requires elevated privileges`);
        try {
          logger.error(`${bind} requires elevated privileges`);
        } catch (e) {}
        process.exit(1);
        break;
      case 'EADDRINUSE':
        console.error(`${bind} is already in use`);
        try {
          logger.error(`${bind} is already in use`);
        } catch (e) {}
        process.exit(1);
        break;
      default:
        console.error('Server error:', error);
        try {
          logger.error('Server error:', {
            code: error.code,
            message: error.message,
            stack: error.stack
          });
        } catch (e) {}
        throw error;
    }
  });

  // Graceful shutdown handler
  const gracefulShutdown = (signal: string) => {
    console.log(`${signal} received. Shutting down gracefully...`);
    try {
      logger.info(`${signal} received. Shutting down gracefully...`);
    } catch (e) {}
    
    // Stop accepting new connections
    server.close(() => {
      console.log('HTTP server closed');
      try {
        logger.info('HTTP server closed');
        logger.info('Process terminated gracefully');
      } catch (e) {}
      
      // Close any other connections (database, cache, etc.)
      // Add cleanup for other services here if needed
      
      process.exit(0);
    });

    // Force shutdown after 30 seconds
    setTimeout(() => {
      console.error('Could not close connections in time, forcefully shutting down');
      try {
        logger.error('Could not close connections in time, forcefully shutting down');
      } catch (e) {}
      process.exit(1);
    }, 30000);
  };

  // Handle termination signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  return server;
}

// Handle uncaught exceptions gracefully (set up before async operations)
process.on('uncaughtException', (err: Error) => {
  console.error('Uncaught Exception - Shutting down gracefully', {
    name: err.name,
    message: err.message,
    stack: err.stack
  });
  try {
    logger.error('Uncaught Exception - Shutting down gracefully', {
      error: {
        name: err.name,
        message: err.message,
        stack: err.stack
      }
    });
  } catch (e) {
    // Logger might not be ready yet
  }
  
  // Give time for logs to be written
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

// Handle unhandled promise rejections gracefully
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('Unhandled Rejection - Shutting down gracefully', {
    reason: reason instanceof Error ? {
      name: reason.name,
      message: reason.message,
      stack: reason.stack
    } : reason,
    promise: promise.toString()
  });
  try {
    logger.error('Unhandled Rejection - Shutting down gracefully', {
      reason: reason instanceof Error ? {
        name: reason.name,
        message: reason.message,
        stack: reason.stack
      } : reason,
      promise: promise.toString()
    });
  } catch (e) {
    // Logger might not be ready yet
  }
  
  // Give time for logs to be written
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

// Start the server
startServer().catch((error) => {
  console.error('Fatal error during server startup:', error);
  process.exit(1);
});