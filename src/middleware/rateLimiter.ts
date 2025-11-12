import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { securityLogger } from './requestLogger';

// Check if we're in development mode
const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production';

// Default rate limit configuration
// More lenient in development to allow for rapid API testing
export const rateLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 1000 : 100, // Limit each IP to 1000 requests in dev, 100 in production per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes',
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req: Request, res: Response) => {
    securityLogger.logRateLimitExceeded(req);
    res.status(429).json({
      success: false,
      error: {
        message: 'Too many requests from this IP, please try again later.',
        retryAfter: '15 minutes',
      },
    });
  },
};

// Strict rate limiting for authentication endpoints
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 auth requests per windowMs
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: '15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    securityLogger.logRateLimitExceeded(req);
    res.status(429).json({
      success: false,
      error: {
        message: 'Too many authentication attempts, please try again later.',
        retryAfter: '15 minutes',
      },
    });
  },
});

// API rate limiting for general endpoints
export const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 2000 : 200, // Limit each IP to 2000 requests in dev, 200 in production per windowMs
  message: {
    error: 'API rate limit exceeded, please try again later.',
    retryAfter: '15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    securityLogger.logRateLimitExceeded(req);
    res.status(429).json({
      success: false,
      error: {
        message: 'API rate limit exceeded, please try again later.',
        retryAfter: '15 minutes',
      },
    });
  },
});

// Upload rate limiting
export const uploadRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 uploads per hour
  message: {
    error: 'Upload rate limit exceeded, please try again later.',
    retryAfter: '1 hour',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    securityLogger.logRateLimitExceeded(req);
    res.status(429).json({
      success: false,
      error: {
        message: 'Upload rate limit exceeded, please try again later.',
        retryAfter: '1 hour',
      },
    });
  },
});

// Admin operations rate limiting
export const adminRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50, // Limit each IP to 50 admin requests per 5 minutes
  message: {
    error: 'Admin operation rate limit exceeded, please try again later.',
    retryAfter: '5 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    securityLogger.logRateLimitExceeded(req);
    res.status(429).json({
      success: false,
      error: {
        message: 'Admin operation rate limit exceeded, please try again later.',
        retryAfter: '5 minutes',
      },
    });
  },
});