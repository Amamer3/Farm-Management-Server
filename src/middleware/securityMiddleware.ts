import { Request, Response, NextFunction } from 'express';
import DOMPurify from 'isomorphic-dompurify';
import { logger, securityLogger } from '../utils/enhancedLogger';
import { ErrorFactory } from '../models/errors';

// Input sanitization middleware
export const sanitizeInput = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // Sanitize request body
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body);
    }

    // Sanitize query parameters
    if (req.query && typeof req.query === 'object') { 
      req.query = sanitizeObject(req.query);
    }

    // Sanitize URL parameters
    if (req.params && typeof req.params === 'object') {
      req.params = sanitizeObject(req.params);
    }

    next();
  } catch (error) {
    logger.error('Input sanitization error', { error: (error as Error).message });
    next(ErrorFactory.validation('Invalid input data'));
  }
};

// Recursively sanitize objects
const sanitizeObject = (obj: any): any => {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        sanitized[key] = sanitizeObject(obj[key]);
      }
    }
    return sanitized;
  }

  return obj;
};

// Sanitize string input
const sanitizeString = (input: string): string => {
  if (typeof input !== 'string') {
    return input;
  }

  // Remove potential XSS attacks
  let sanitized = DOMPurify.sanitize(input, { 
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: []
  });

  // Remove SQL injection patterns
  sanitized = sanitized.replace(/['";\\]/g, '');
  
  // Remove script tags and javascript: protocols
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  sanitized = sanitized.replace(/javascript:/gi, '');
  
  // Remove potential command injection patterns
  sanitized = sanitized.replace(/[;&|`$()]/g, '');
  
  return sanitized.trim();
};

// Request size limiter
export const requestSizeLimiter = (maxSize: string = '10mb') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = parseInt(req.get('content-length') || '0');
    const maxSizeBytes = parseSize(maxSize);

    if (contentLength > maxSizeBytes) {
      securityLogger.logSuspiciousActivity(req, 'Oversized request', {
        contentLength,
        maxSizeBytes,
        url: req.url
      });

      res.status(413).json({
        success: false,
        error: {
          type: 'VALIDATION_ERROR',
          code: 'REQUEST_TOO_LARGE',
          message: 'Request size exceeds maximum allowed limit'
        }
      });
      return;
    }

    next();
  };
};

// Parse size string to bytes
const parseSize = (size: string): number => {
  const units: { [key: string]: number } = {
    'b': 1,
    'kb': 1024,
    'mb': 1024 * 1024,
    'gb': 1024 * 1024 * 1024
  };

  const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/);
  if (!match) {
    return 10 * 1024 * 1024; // Default 10MB
  }

  const value = parseFloat(match[1]);
  const unit = match[2] || 'b';
  
  return Math.floor(value * (units[unit] || 1));
};

// API key validation middleware
export const validateApiKey = (req: Request, res: Response, next: NextFunction): void => {
  const apiKey = req.get('X-API-Key');
  
  if (!apiKey) {
    securityLogger.logSuspiciousActivity(req, 'Missing API key');
    res.status(401).json({
      success: false,
      error: {
        type: 'AUTHENTICATION_ERROR',
        code: 'MISSING_API_KEY',
        message: 'API key is required'
      }
    });
    return;
  }

  // Validate API key format (basic validation)
  if (!isValidApiKeyFormat(apiKey)) {
    securityLogger.logSuspiciousActivity(req, 'Invalid API key format', { apiKey });
    res.status(401).json({
      success: false,
      error: {
        type: 'AUTHENTICATION_ERROR',
        code: 'INVALID_API_KEY',
        message: 'Invalid API key format'
      }
    });
    return;
  }

  // TODO: Implement actual API key validation against database
  // For now, we'll just validate the format
  next();
};

// Validate API key format
const isValidApiKeyFormat = (apiKey: string): boolean => {
  // API key should be at least 32 characters and contain only alphanumeric characters
  return /^[a-zA-Z0-9]{32,}$/.test(apiKey);
};

// CSRF protection middleware
export const csrfProtection = (req: Request, res: Response, next: NextFunction): void => {
  // Skip CSRF for GET requests and API endpoints
  if (req.method === 'GET' || req.path.startsWith('/api/')) {
    return next();
  }

  const csrfToken = req.get('X-CSRF-Token');
  const sessionToken = (req as any).session?.csrfToken;

  if (!csrfToken || !sessionToken || csrfToken !== sessionToken) {
    securityLogger.logSuspiciousActivity(req, 'CSRF token validation failed', {
      providedToken: csrfToken,
      sessionToken: sessionToken
    });

    res.status(403).json({
      success: false,
      error: {
        type: 'AUTHORIZATION_ERROR',
        code: 'CSRF_TOKEN_INVALID',
        message: 'Invalid CSRF token'
      }
    });
    return;
  }

  next();
};

// Rate limiting per user (more granular than IP-based)
export const userRateLimit = (maxRequests: number = 100, windowMs: number = 15 * 60 * 1000) => {
  const userRequests = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const userId = (req as any).user?.uid;
    
    if (!userId) {
      return next(); // Skip if no user
    }

    const now = Date.now();
    const userLimit = userRequests.get(userId);

    if (!userLimit || now > userLimit.resetTime) {
      // Reset or initialize user limit
      userRequests.set(userId, {
        count: 1,
        resetTime: now + windowMs
      });
      return next();
    }

    if (userLimit.count >= maxRequests) {
      securityLogger.logRateLimitExceeded(req);
      
      res.status(429).json({
        success: false,
        error: {
          type: 'RATE_LIMIT_ERROR',
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many requests from this user, please try again later',
          retryAfter: Math.ceil((userLimit.resetTime - now) / 1000)
        }
      });
      return;
    }

    userLimit.count++;
    next();
  };
};

// Security headers middleware
export const securityHeaders = (req: Request, res: Response, next: NextFunction): void => {
  // Add security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  // Add HSTS header for HTTPS
  if (req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
};

// Request validation middleware
export const validateRequest = (req: Request, res: Response, next: NextFunction): void => {
  // Check for suspicious patterns in URL
  const suspiciousPatterns = [
    /\.\./,  // Directory traversal
    /<script/i,  // Script injection
    /javascript:/i,  // JavaScript protocol
    /data:text\/html/i,  // Data URI
    /vbscript:/i,  // VBScript
    /onload=/i,  // Event handlers
    /onerror=/i
  ];

  const url = req.url.toLowerCase();
  const userAgent = req.get('User-Agent')?.toLowerCase() || '';

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(url) || pattern.test(userAgent)) {
      securityLogger.logSuspiciousActivity(req, 'Suspicious request pattern detected', {
        pattern: pattern.toString(),
        url,
        userAgent
      });

      res.status(400).json({
        success: false,
        error: {
          type: 'VALIDATION_ERROR',
          code: 'SUSPICIOUS_REQUEST',
          message: 'Request contains suspicious patterns'
        }
      });
      return;
    }
  }

  next();
};

// IP whitelist middleware
export const ipWhitelist = (allowedIPs: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIP = req.ip || req.connection.remoteAddress || '';
    
    if (allowedIPs.length > 0 && !allowedIPs.includes(clientIP)) {
      securityLogger.logSuspiciousActivity(req, 'IP not in whitelist', { clientIP });
      
      res.status(403).json({
        success: false,
        error: {
          type: 'AUTHORIZATION_ERROR',
          code: 'IP_NOT_ALLOWED',
          message: 'Your IP address is not allowed to access this resource'
        }
      });
      return;
    }

    next();
  };
};

// Audit logging middleware
export const auditLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const userId = (req as any).user?.uid;
    
    logger.info('API Request Audit', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userId,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });
  });

  next();
};

export default {
  sanitizeInput,
  requestSizeLimiter,
  validateApiKey,
  csrfProtection,
  userRateLimit,
  securityHeaders,
  validateRequest,
  ipWhitelist,
  auditLogger
};
