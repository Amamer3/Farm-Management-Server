import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// Request logging middleware
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  const { method, url, ip } = req;
  const userAgent = req.get('User-Agent') || 'Unknown';
  const userId = (req as any).user?.uid || 'Anonymous';

  // Log request start
  logger.info({
    type: 'REQUEST_START',
    method,
    url,
    ip,
    userAgent,
    userId,
    timestamp: new Date().toISOString(),
  });

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any): any {
    const duration = Date.now() - startTime;
    const { statusCode } = res;
    const contentLength = res.get('Content-Length') || '0';

    // Log response
    logger.info({
      type: 'REQUEST_END',
      method,
      url,
      ip,
      userAgent,
      userId,
      statusCode,
      duration,
      contentLength,
      timestamp: new Date().toISOString(),
    });

    // Call original end method
    originalEnd.call(this, chunk, encoding);
  };

  next();
};

// API usage tracking middleware
export const apiUsageTracker = (req: Request, res: Response, next: NextFunction): void => {
  const endpoint = req.route?.path || req.path;
  const method = req.method;
  const userId = (req as any).user?.uid;

  // Track API usage (could be stored in database for analytics)
  logger.info({
    type: 'API_USAGE',
    endpoint,
    method,
    userId,
    timestamp: new Date().toISOString(),
  });

  next();
};

// Security event logger
export const securityLogger = {
  logFailedAuth: (req: Request, reason: string) => {
    logger.warn({
      type: 'SECURITY_AUTH_FAILED',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.url,
      reason,
      timestamp: new Date().toISOString(),
    });
  },

  logSuspiciousActivity: (req: Request, activity: string, details?: any) => {
    logger.warn({
      type: 'SECURITY_SUSPICIOUS',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.url,
      activity,
      details,
      timestamp: new Date().toISOString(),
    });
  },

  logRateLimitExceeded: (req: Request) => {
    logger.warn({
      type: 'SECURITY_RATE_LIMIT',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.url,
      timestamp: new Date().toISOString(),
    });
  },
};