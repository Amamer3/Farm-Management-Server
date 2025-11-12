import { Request, Response } from 'express';
import { errorHandler, AppError, notFoundHandler } from '../../../src/middleware/errorHandler';
import { ErrorType, ErrorCode } from '../../../src/models/errors';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    error: jest.fn()
  }
}));

describe('Error Handler Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: jest.Mock;

  beforeEach(() => { 
    mockRequest = {
      url: '/test',
      method: 'GET',
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('test-agent')
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    mockNext = jest.fn();
  });

  describe('errorHandler', () => {
    it('should handle AppError correctly', () => {
      // Arrange
      const error = new AppError('Test error', ErrorType.VALIDATION_ERROR, ErrorCode.INVALID_INPUT, 400);

      // Act
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Test error'
        }
      });
    });

    it('should handle JWT errors', () => {
      // Arrange
      const error = new Error('Invalid token');
      error.name = 'JsonWebTokenError';

      // Act
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Invalid token. Please log in again'
        }
      });
    });

    it('should handle Firebase auth errors', () => {
      // Arrange
      const error = new Error('Auth error');
      (error as any).code = 'auth/user-not-found';

      // Act
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Authentication failed'
        }
      });
    });

    it('should handle unknown errors with 500 status', () => {
      // Arrange
      const error = new Error('Unknown error');

      // Act
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Server Error'
        }
      });
    });
  });

  describe('notFoundHandler', () => {
    it('should create 404 error for unknown routes', () => {
      // Arrange
      mockRequest.originalUrl = '/unknown-route';

      // Act
      notFoundHandler(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Not found - /unknown-route',
          statusCode: 404
        })
      );
    });
  });

  describe('AppError', () => {
    it('should create error with correct properties', () => {
      // Arrange & Act
      const error = new AppError('Test message', ErrorType.VALIDATION_ERROR, ErrorCode.INVALID_INPUT, 400);

      // Assert
      expect(error.message).toBe('Test message');
      expect(error.statusCode).toBe(400);
      expect(error.isOperational).toBe(true);
      expect(error).toBeInstanceOf(Error);
    });
  });
});
