import { Request, Response } from 'express';
import { AuthController } from '../../../src/controllers/authController';
import { createSuccessResponse, createErrorResponse } from '../../../src/utils/responseHelper';
import { UserRole } from '../../../src/models/types';

// Mock dependencies
jest.mock('../../../src/services/firebaseService');
jest.mock('../../../src/services/firestoreService');

describe('AuthController', () => {
  let authController: AuthController;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: jest.Mock; 

  beforeEach(() => {
    authController = new AuthController();
    mockRequest = {};
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    mockNext = jest.fn();
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      // Arrange
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
        role: UserRole.FARM_WORKER,
        farmId: 'farm-123'
      };
      
      mockRequest.body = userData;
      mockRequest.user = { uid: 'admin-123', email: 'admin@test.com', role: UserRole.SUPER_ADMIN, name: 'Admin' };

      // Mock Firebase service responses
      const mockFirebaseService = require('../../../src/services/firebaseService');
      const mockFirestoreService = require('../../../src/services/firestoreService');
      
      mockFirebaseService.default.createUser.mockResolvedValue({ uid: 'new-user-123' });
      mockFirestoreService.default.createUser.mockResolvedValue({ id: 'new-user-123', ...userData });
      mockFirestoreService.default.getUserById.mockResolvedValue({ 
        id: 'admin-123', 
        role: UserRole.SUPER_ADMIN 
      });

      // Act
      await authController.register(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'User registered successfully'
        })
      );
    });

    it('should reject registration if user is not super admin', async () => {
      // Arrange
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
        role: UserRole.FARM_WORKER
      };
      
      mockRequest.body = userData;
      mockRequest.user = { uid: 'worker-123', email: 'worker@test.com', role: UserRole.FARM_WORKER, name: 'Worker' };

      const mockFirestoreService = require('../../src/services/firestoreService');
      mockFirestoreService.default.getUserById.mockResolvedValue({ 
        id: 'worker-123', 
        role: UserRole.FARM_WORKER 
      });

      // Act
      await authController.register(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Only super administrators can register new users'
        })
      );
    });

    it('should reject registration with missing required fields', async () => {
      // Arrange
      mockRequest.body = {
        email: 'test@example.com'
        // Missing password, name, role
      };
      mockRequest.user = { uid: 'admin-123', email: 'admin@test.com', role: UserRole.SUPER_ADMIN, name: 'Admin' };

      // Act
      await authController.register(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Missing required fields: email, password, name, and role are required'
        })
      );
    });
  });

  describe('login', () => {
    it('should login user successfully', async () => {
      // Arrange
      mockRequest.body = {
        email: 'test@example.com',
        password: 'password123'
      };

      const mockFirebaseService = require('../../../src/services/firebaseService');
      const mockFirestoreService = require('../../../src/services/firestoreService');
      
      mockFirebaseService.default.signInWithEmailAndPassword.mockResolvedValue({
        user: { uid: 'user-123', getIdToken: jest.fn().mockResolvedValue('mock-token') }
      });
      mockFirestoreService.default.getUserById.mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: UserRole.FARM_WORKER,
        isActive: true
      });

      // Act
      await authController.login(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Login successful',
          data: expect.objectContaining({
            token: 'mock-token',
            user: expect.objectContaining({
              id: 'user-123',
              email: 'test@example.com'
            })
          })
        })
      );
    });

    it('should reject login with invalid credentials', async () => {
      // Arrange
      mockRequest.body = {
        email: 'test@example.com',
        password: 'wrongpassword'
      };

      const mockFirebaseService = require('../../src/services/firebaseService');
      mockFirebaseService.default.signInWithEmailAndPassword.mockRejectedValue(
        new Error('Invalid credentials')
      );

      // Act
      await authController.login(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Invalid credentials'
        })
      );
    });
  });
});
