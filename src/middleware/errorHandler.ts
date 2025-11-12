import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { AppError, ErrorFactory, ErrorType, ErrorCode } from '../models/errors';

export { AppError };

// Error handler middleware
export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Don't send response if headers already sent
  if (res.headersSent) {
    return next(err);
  }

  let error: AppError;

  // If it's already an AppError, use it directly
  if (err instanceof AppError) {
    error = err;
  } else {
    // Convert other errors to AppError
    error = AppError.fromError(err, {
      userId: (req as any).user?.uid,
      farmId: (req as any).user?.farmId,
      requestId: req.headers['x-request-id'] as string,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      operation: `${req.method} ${req.path}`,
      timestamp: new Date().toISOString()
    });
  }

  // Handle specific error types and convert to appropriate AppError
  if (err.name === 'CastError' || err.name === 'ObjectIdError') {
    error = ErrorFactory.notFound('Resource not found');
  }

  if (err.code === 11000 || err.code === 'P2002') {
    error = ErrorFactory.database('Duplicate field value entered');
  }

  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map((val: any) => val.message).join(', ');
    error = ErrorFactory.validation(message);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error = ErrorFactory.authentication('Invalid token. Please log in again');
  }

  if (err.name === 'TokenExpiredError') {
    error = ErrorFactory.authentication('Your token has expired. Please log in again');
  }

  // Firebase errors - check both err.code and err.message for error codes
  let firebaseErrorCode: string | null = null;
  if (err.code && typeof err.code === 'string' && err.code.startsWith('auth/')) {
    firebaseErrorCode = err.code;
  } else if (err.message && typeof err.message === 'string') {
    // Handle format like "Firebase: Error (auth/invalid-credential)."
    const match = err.message.match(/auth\/([a-z-]+)/i);
    if (match) {
      firebaseErrorCode = `auth/${match[1]}`;
    }
  }

  if (firebaseErrorCode) {
    const authMessages: Record<string, string> = {
      'auth/user-not-found': 'Invalid email or password',
      'auth/wrong-password': 'Invalid email or password',
      'auth/invalid-credential': 'Invalid email or password',
      'auth/email-already-exists': 'Email already exists',
      'auth/invalid-email': 'Invalid email address',
      'auth/weak-password': 'Password is too weak',
      'auth/too-many-requests': 'Too many requests. Please try again later',
      'auth/user-disabled': 'User account has been disabled'
    };
    const message = authMessages[firebaseErrorCode] || 'Authentication failed';
    error = ErrorFactory.authentication(message);
  } else if (err.code && typeof err.code === 'string') {
    if (err.code.startsWith('permission-denied')) {
      error = ErrorFactory.authorization('Permission denied');
    } else if (err.code.startsWith('not-found')) {
      error = ErrorFactory.notFound('Resource not found');
    } else if (err.code.startsWith('already-exists')) {
      error = ErrorFactory.database('Resource already exists');
    }
  }

  // Firebase service account permission errors (check before generic PERMISSION_DENIED)
  if (err.message && typeof err.message === 'string' && 
      (err.message.includes('serviceusage') || err.message.includes('Service Usage Consumer'))) {
    // Preserve the detailed error message with instructions
    error = ErrorFactory.internal(err.message);
  }

  // Firestore errors
  if (err.code === 3 || err.code === 'NOT_FOUND') {
    error = ErrorFactory.notFound('Resource not found');
  }

  if (err.code === 7 || err.code === 'PERMISSION_DENIED') {
    error = ErrorFactory.authorization('Permission denied');
  }

  if (err.code === 6 || err.code === 'ALREADY_EXISTS') {
    error = ErrorFactory.database('Resource already exists');
  }

  // Rate limiting errors
  if (err.statusCode === 429 || err.status === 429) {
    error = ErrorFactory.rateLimit('Too many requests from this IP, please try again later');
  }

  // CORS errors
  if (err.message && err.message.includes('CORS')) {
    error = ErrorFactory.authorization('CORS policy violation');
  }

  // Network/connection errors
  if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') {
    error = ErrorFactory.database('Database connection failed. Please try again later');
  }

  // Log error with structured information (only log non-operational errors in production)
  if (!error.isOperational || process.env.NODE_ENV === 'development') {
    logger.error('Application Error', {
      error: error.toJSON(),
      request: {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: req.body,
        query: req.query,
        params: req.params
      },
      user: (req as any).user,
      timestamp: error.timestamp
    });
  } else {
    // Log operational errors with less detail
    logger.warn('Operational Error', {
      type: error.type,
      code: error.code,
      message: error.message,
      operation: `${req.method} ${req.path}`,
      userId: (req as any).user?.uid
    });
  }

  // Send error response
  const errorResponse = {
    success: false,
    error: {
      type: error.type,
      code: error.code,
      message: error.message,
      timestamp: error.timestamp,
      ...(process.env.NODE_ENV === 'development' && { 
        stack: error.stack,
        context: error.context 
      })
    }
  };

  res.status(error.statusCode).json(errorResponse);
};

// 404 handler
export const notFoundHandler = (req: Request, res: Response, next: NextFunction): void => {
  const error = ErrorFactory.notFound(`Not found - ${req.originalUrl}`);
  next(error);
};

// Async error wrapper
export const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};