import winston from 'winston';
import path from 'path';

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      log += `\n${JSON.stringify(meta, null, 2)}`;
    }
    
    return log;
  })
);

// Create logger instance
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: {
    service: 'farm-management-api',
    version: '1.0.0'
  },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'development' ? consoleFormat : logFormat
    }),
    
    // File transports
    new winston.transports.File({
      filename: path.join('logs', 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: logFormat
    }),
    
    new winston.transports.File({
      filename: path.join('logs', 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: logFormat
    })
  ],
  
  // Handle exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join('logs', 'exceptions.log'),
      format: logFormat
    })
  ],
  
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join('logs', 'rejections.log'),
      format: logFormat
    })
  ]
});

// Add request ID to logs
export const addRequestId = (req: any, res: any, next: any) => {
  const requestId = req.headers['x-request-id'] || 
                   req.headers['x-correlation-id'] || 
                   `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  
  // Add request ID to logger context
  logger.defaultMeta = {
    ...logger.defaultMeta,
    requestId
  };
  
  next();
};

// Performance logging
export const logPerformance = (req: any, res: any, next: any) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      requestId: req.requestId
    };
    
    if (duration > 1000) {
      logger.warn('Slow request detected', logData);
    } else {
      logger.info('Request completed', logData);
    }
  });
  
  next();
};

// Security logging
export const securityLogger = {
  logAuthenticationAttempt: (req: any, success: boolean, reason?: string) => {
    logger.info('Authentication attempt', {
      success,
      reason,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      email: req.body?.email,
      requestId: req.requestId
    });
  },
  
  logAuthorizationFailure: (req: any, userId: string, resource: string, action: string) => {
    logger.warn('Authorization failure', {
      userId,
      resource,
      action,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      requestId: req.requestId
    });
  },
  
  logRateLimitExceeded: (req: any) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.url,
      method: req.method,
      requestId: req.requestId
    });
  },
  
  logSuspiciousActivity: (req: any, activity: string, details?: any) => {
    logger.warn('Suspicious activity detected', {
      activity,
      details,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.url,
      method: req.method,
      requestId: req.requestId
    });
  }
};

// Business logic logging
export const businessLogger = {
  logUserAction: (userId: string, action: string, resource: string, details?: any) => {
    logger.info('User action', {
      userId,
      action,
      resource,
      details,
      timestamp: new Date().toISOString()
    });
  },
  
  logDataChange: (userId: string, operation: string, resource: string, before?: any, after?: any) => {
    logger.info('Data change', {
      userId,
      operation,
      resource,
      before,
      after,
      timestamp: new Date().toISOString()
    });
  },
  
  logSystemEvent: (event: string, details?: any) => {
    logger.info('System event', {
      event,
      details,
      timestamp: new Date().toISOString()
    });
  }
};

// Error tracking
export const errorTracker = {
  trackError: (error: Error, context?: any) => {
    logger.error('Error tracked', {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      context,
      timestamp: new Date().toISOString()
    });
  },
  
  trackValidationError: (errors: any[], context?: any) => {
    logger.warn('Validation error', {
      errors,
      context,
      timestamp: new Date().toISOString()
    });
  }
};

export default logger;
