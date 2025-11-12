export enum ErrorType {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  NOT_FOUND_ERROR = 'NOT_FOUND_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  BUSINESS_LOGIC_ERROR = 'BUSINESS_LOGIC_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR'
}
 
export enum ErrorCode {
  // Validation Errors
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  INVALID_FORMAT = 'INVALID_FORMAT',
  VALUE_OUT_OF_RANGE = 'VALUE_OUT_OF_RANGE',
  
  // Authentication Errors
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  ACCOUNT_DISABLED = 'ACCOUNT_DISABLED',
  
  // Authorization Errors
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  ROLE_NOT_ALLOWED = 'ROLE_NOT_ALLOWED',
  RESOURCE_ACCESS_DENIED = 'RESOURCE_ACCESS_DENIED',
  
  // Not Found Errors
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  ENDPOINT_NOT_FOUND = 'ENDPOINT_NOT_FOUND',
  
  // Database Errors
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  QUERY_FAILED = 'QUERY_FAILED',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  DUPLICATE_KEY = 'DUPLICATE_KEY',
  
  // External Service Errors
  FIREBASE_ERROR = 'FIREBASE_ERROR',
  REDIS_ERROR = 'REDIS_ERROR',
  EMAIL_SERVICE_ERROR = 'EMAIL_SERVICE_ERROR',
  
  // Business Logic Errors
  INVALID_OPERATION = 'INVALID_OPERATION',
  BUSINESS_RULE_VIOLATION = 'BUSINESS_RULE_VIOLATION',
  CONFLICTING_DATA = 'CONFLICTING_DATA',
  
  // Rate Limit Errors
  TOO_MANY_REQUESTS = 'TOO_MANY_REQUESTS',
  
  // Internal Server Errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE'
}

export interface ErrorContext {
  userId?: string;
  farmId?: string;
  resourceId?: string;
  operation?: string;
  timestamp?: string;
  requestId?: string;
  userAgent?: string;
  ip?: string;
  additionalData?: Record<string, any>;
}

export interface StructuredError {
  type: ErrorType;
  code: ErrorCode;
  message: string;
  context?: ErrorContext;
  stack?: string;
  originalError?: Error;
}

export class AppError extends Error {
  public readonly type: ErrorType;
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly context?: ErrorContext;
  public readonly timestamp: string;

  constructor(
    message: string,
    type: ErrorType,
    code: ErrorCode,
    statusCode: number = 500,
    context?: ErrorContext,
    originalError?: Error
  ) {
    super(message);
    
    this.type = type;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = true;
    this.context = context;
    this.timestamp = new Date().toISOString();
    
    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
    
    // Preserve original error stack if provided
    if (originalError) {
      this.stack = originalError.stack;
    }
  }

  public toJSON(): StructuredError {
    return {
      type: this.type,
      code: this.code,
      message: this.message,
      context: this.context,
      stack: this.stack
    };
  }

  public static fromError(error: Error, context?: ErrorContext): AppError {
    if (error instanceof AppError) {
      return error;
    }

    // Determine error type and code based on error properties
    let type = ErrorType.INTERNAL_SERVER_ERROR;
    let code = ErrorCode.UNKNOWN_ERROR;
    let statusCode = 500;

    if (error.name === 'ValidationError') {
      type = ErrorType.VALIDATION_ERROR;
      code = ErrorCode.INVALID_INPUT;
      statusCode = 400;
    } else if (error.name === 'JsonWebTokenError') {
      type = ErrorType.AUTHENTICATION_ERROR;
      code = ErrorCode.TOKEN_INVALID;
      statusCode = 401;
    } else if (error.name === 'TokenExpiredError') {
      type = ErrorType.AUTHENTICATION_ERROR;
      code = ErrorCode.TOKEN_EXPIRED;
      statusCode = 401;
    } else if ((error as any).code === 11000) {
      type = ErrorType.DATABASE_ERROR;
      code = ErrorCode.DUPLICATE_KEY;
      statusCode = 409;
    }

    return new AppError(
      error.message,
      type,
      code,
      statusCode,
      context,
      error
    );
  }
}

// Predefined error creators for common scenarios
export const ErrorFactory = {
  validation: (message: string, context?: ErrorContext) =>
    new AppError(message, ErrorType.VALIDATION_ERROR, ErrorCode.INVALID_INPUT, 400, context),
  
  authentication: (message: string, context?: ErrorContext) =>
    new AppError(message, ErrorType.AUTHENTICATION_ERROR, ErrorCode.INVALID_CREDENTIALS, 401, context),
  
  authorization: (message: string, context?: ErrorContext) =>
    new AppError(message, ErrorType.AUTHORIZATION_ERROR, ErrorCode.INSUFFICIENT_PERMISSIONS, 403, context),
  
  notFound: (message: string, context?: ErrorContext) =>
    new AppError(message, ErrorType.NOT_FOUND_ERROR, ErrorCode.RESOURCE_NOT_FOUND, 404, context),
  
  database: (message: string, context?: ErrorContext) =>
    new AppError(message, ErrorType.DATABASE_ERROR, ErrorCode.QUERY_FAILED, 500, context),
  
  businessLogic: (message: string, context?: ErrorContext) =>
    new AppError(message, ErrorType.BUSINESS_LOGIC_ERROR, ErrorCode.BUSINESS_RULE_VIOLATION, 422, context),
  
  rateLimit: (message: string, context?: ErrorContext) =>
    new AppError(message, ErrorType.RATE_LIMIT_ERROR, ErrorCode.TOO_MANY_REQUESTS, 429, context),
  
  internal: (message: string, context?: ErrorContext) =>
    new AppError(message, ErrorType.INTERNAL_SERVER_ERROR, ErrorCode.UNKNOWN_ERROR, 500, context)
};
