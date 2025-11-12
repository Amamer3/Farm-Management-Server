import { Request, Response } from 'express';
import { BirdController } from '../../../src/controllers/birdController';
import { UserRole } from '../../../src/models/types';

// Mock dependencies
jest.mock('../../../src/services/firestoreService');

describe('BirdController', () => {
  let birdController: BirdController; 
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    birdController = new BirdController();
    mockRequest = {};
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('getBirds', () => {
    it('should get birds successfully', async () => {
      // Arrange
      mockRequest.user = { uid: 'user-123', email: 'user@test.com', role: UserRole.FARM_WORKER, name: 'User' };
      mockRequest.query = { page: '1', limit: '10' };

      const mockFirestoreService = require('../../../src/services/firestoreService');
      mockFirestoreService.default.getUserById.mockResolvedValue({
        id: 'user-123',
        farmId: 'farm-123',
        role: UserRole.FARM_WORKER
      });
      mockFirestoreService.default.getBirds.mockResolvedValue([
        {
          id: 'bird-1',
          penId: 'pen-1',
          breed: 'Rhode Island Red',
          age: 6,
          quantity: 50,
          farmId: 'farm-123'
        }
      ]);

      // Act
      await birdController.getBirds(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Birds retrieved successfully'
        })
      );
    });

    it('should reject request if user not authenticated', async () => {
      // Arrange
      mockRequest.user = undefined;

      // Act
      await birdController.getBirds(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'User not authenticated'
        })
      );
    });
  });

  describe('createBird', () => {
    it('should create bird successfully', async () => {
      // Arrange
      const birdData = {
        penId: 'pen-1',
        breed: 'Rhode Island Red',
        age: 6,
        quantity: 50,
        farmId: 'farm-123'
      };
      
      mockRequest.body = birdData;
      mockRequest.user = { uid: 'user-123', email: 'user@test.com', role: UserRole.FARM_MANAGER, name: 'Manager' };

      const mockFirestoreService = require('../../../src/services/firestoreService');
      mockFirestoreService.default.getUserById.mockResolvedValue({
        id: 'user-123',
        farmId: 'farm-123',
        role: UserRole.FARM_MANAGER
      });
      mockFirestoreService.default.createBird.mockResolvedValue({
        id: 'bird-1',
        ...birdData
      });

      // Act
      await birdController.createBird(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Bird created successfully'
        })
      );
    });

    it('should reject creation if user lacks permission', async () => {
      // Arrange
      const birdData = {
        penId: 'pen-1',
        breed: 'Rhode Island Red',
        age: 6,
        quantity: 50,
        farmId: 'farm-123'
      };
      
      mockRequest.body = birdData;
      mockRequest.user = { uid: 'user-123', email: 'user@test.com', role: UserRole.FARM_WORKER, name: 'Worker' };

      const mockFirestoreService = require('../../../src/services/firestoreService');
      mockFirestoreService.default.getUserById.mockResolvedValue({
        id: 'user-123',
        farmId: 'farm-123',
        role: UserRole.FARM_WORKER
      });

      // Act
      await birdController.createBird(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Insufficient permissions to create birds'
        })
      );
    });
  });
});
