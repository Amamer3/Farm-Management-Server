import winston from 'winston';
import path from 'path';

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define log colors
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

// Tell winston that you want to link the colors
winston.addColors(colors);

// Define which logs to print based on environment
const level = () => {
  const env = process.env.NODE_ENV || 'development';
  const isDevelopment = env === 'development';
  return isDevelopment ? 'debug' : 'warn';
};

// Define log format
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// Define log format for files (without colors)
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Define transports
const transports = [
  // Console transport
  new winston.transports.Console({
    format,
  }),
  // Error log file
  new winston.transports.File({
    filename: path.join(process.cwd(), 'logs', 'error.log'),
    level: 'error',
    format: fileFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }),
  // Combined log file
  new winston.transports.File({
    filename: path.join(process.cwd(), 'logs', 'combined.log'),
    format: fileFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }),
];

// Create the logger
export const logger = winston.createLogger({
  level: level(),
  levels,
  format,
  transports,
  exitOnError: false,
});

// Create a stream object for Morgan HTTP logger
export const morganStream = {
  write: (message: string) => {
    logger.http(message.trim());
  },
};

// Helper functions for structured logging
export const loggers = {
  // Authentication events
  auth: {
    login: (userId: string, ip: string) => {
      logger.info({
        event: 'USER_LOGIN',
        userId,
        ip,
        timestamp: new Date().toISOString(),
      });
    },
    logout: (userId: string, ip: string) => {
      logger.info({
        event: 'USER_LOGOUT',
        userId,
        ip,
        timestamp: new Date().toISOString(),
      });
    },
    failed: (email: string, ip: string, reason: string) => {
      logger.warn({
        event: 'LOGIN_FAILED',
        email,
        ip,
        reason,
        timestamp: new Date().toISOString(),
      });
    },
  },

  // Database events
  db: {
    query: (collection: string, operation: string, duration: number) => {
      logger.debug({
        event: 'DB_QUERY',
        collection,
        operation,
        duration,
        timestamp: new Date().toISOString(),
      });
    },
    error: (collection: string, operation: string, error: string) => {
      logger.error({
        event: 'DB_ERROR',
        collection,
        operation,
        error,
        timestamp: new Date().toISOString(),
      });
    },
  },

  // Business events
  business: {
    eggCollection: (userId: string, quantity: number, date: string) => {
      logger.info({
        event: 'EGG_COLLECTION_RECORDED',
        userId,
        quantity,
        date,
        timestamp: new Date().toISOString(),
      });
    },
    feedUsage: (userId: string, feedType: string, quantity: number) => {
      logger.info({
        event: 'FEED_USAGE_RECORDED',
        userId,
        feedType,
        quantity,
        timestamp: new Date().toISOString(),
      });
    },
    medicineUsage: (userId: string, medicineId: string, birdId: string) => {
      logger.info({
        event: 'MEDICINE_USAGE_RECORDED',
        userId,
        medicineId,
        birdId,
        timestamp: new Date().toISOString(),
      });
    },
  },
};