import { Request, Response } from 'express';
import FirestoreService from '../services/firestoreService';
import { ApiResponse, Bird, CreateBirdRequest, UpdateBirdRequest, PaginatedResponse, UserRole } from '../models/types';
import { createSuccessResponse, createErrorResponse } from '../utils/responseHelper';
import { Timestamp as FirestoreTimestamp } from 'firebase-admin/firestore';

const firestoreService = FirestoreService;
 
export class BirdController {
  // Get all birds with pagination and filtering
  async getBirds(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { page = 1, limit = 10, farmId, breed, status, ageGroup } = req.query;
      
      if (!userId) {
        const response = createErrorResponse('User not authenticated');
        res.status(401).json(response);
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      if (!currentUser) {
        const response = createErrorResponse('User not found');
        res.status(404).json(response);
        return;
      }

      const filters: any = {};
      
      // Admins can view birds from any farm, others only their farm
      if (currentUser.role === UserRole.ADMIN) {
        if (farmId) filters.farmId = farmId as string;
      } else {
        filters.farmId = currentUser.farmId;
      }
      
      if (breed) filters.breed = breed as string;
      if (status) filters.status = status as string;
      if (ageGroup) filters.ageGroup = ageGroup as string;

      const birds = await firestoreService.getBirds(filters);

      const response = createSuccessResponse('Birds retrieved successfully', birds);

      res.status(200).json(response);
    } catch (error: any) {
      console.error('Get birds error:', error);
      const response = createErrorResponse('Failed to get birds', error.message);
      res.status(500).json(response);
    }
  }

  // Get bird by ID
  async getBirdById(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { id } = req.params;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      const bird = await firestoreService.getBirdById(id);
      
      if (!currentUser || !bird) {
        const response = createErrorResponse('Bird not found');
        res.status(404).json(response);
        return;
      }

      // Check if user can access this bird (same farm or admin)
      if (currentUser.role !== UserRole.ADMIN && currentUser.farmId !== bird.farmId) {
        const response = createErrorResponse('Access denied to view this bird');
        res.status(403).json(response);
        return;
      }

      const response = createSuccessResponse('Bird retrieved successfully', bird);

      res.status(200).json(response);
    } catch (error: any) {
      console.error('Get bird by ID error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to get bird'));
    }
  }

  // Create new bird
  async createBird(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const birdData: CreateBirdRequest = req.body;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      if (!currentUser) {
        res.status(404).json(createErrorResponse('User not found'));
        return;
      }

      // Set farmId based on user role (workers use their farmId, admins can specify)
      const farmId = currentUser.role === UserRole.ADMIN && birdData.farmId 
        ? birdData.farmId 
        : currentUser.farmId;

      const newBirdData: Omit<Bird, 'id'> = {
        ...birdData,
        farmId,
        lastCheckup: new Date().toISOString(),
        createdAt: FirestoreTimestamp.now(),
        updatedAt: FirestoreTimestamp.now()
      };

      const newBirdId = await firestoreService.createBird(newBirdData);

      res.status(201).json(createSuccessResponse('Bird created successfully', { id: newBirdId }));
    } catch (error: any) {
      console.error('Create bird error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to create bird'));
    }
  }

  // Update bird
  async updateBird(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { id } = req.params;
      const updateData: UpdateBirdRequest = req.body;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      const bird = await firestoreService.getBirdById(id);
      
      if (!currentUser || !bird) {
        res.status(404).json(createErrorResponse('Bird not found'));
        return;
      }

      // Check permissions
      const canUpdate = currentUser.role === UserRole.ADMIN ||
                       (currentUser.role === UserRole.MANAGER && currentUser.farmId === bird.farmId);

      if (!canUpdate) {
        res.status(403).json(createErrorResponse('Access denied to update this bird'));
        return;
      }

      // Update bird in Firestore
      const updatedBird = await firestoreService.updateBird(id, {
        ...updateData,
        updatedAt: FirestoreTimestamp.now()
      });

      res.status(200).json(createSuccessResponse('Bird updated successfully', updatedBird));
    } catch (error: any) {
      console.error('Update bird error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to update bird'));
    }
  }

  // Delete bird
  async deleteBird(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { id } = req.params;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      const bird = await firestoreService.getBirdById(id);
      
      if (!currentUser || !bird) {
        res.status(404).json(createErrorResponse('Bird not found'));
        return;
      }

      // Only managers and admins can delete birds
      if (currentUser.role !== UserRole.MANAGER && currentUser.role !== UserRole.ADMIN) {
        res.status(403).json(createErrorResponse('Insufficient permissions to delete birds'));
        return;
      }

      // Check if user can delete this bird (same farm or admin)
      if (currentUser.role !== UserRole.ADMIN && currentUser.farmId !== bird.farmId) {
        res.status(403).json(createErrorResponse('Access denied to delete this bird'));
        return;
      }

      await firestoreService.deleteBird(id);

      res.status(200).json(createSuccessResponse('Bird deleted successfully', null));
    } catch (error: any) {
      console.error('Delete bird error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to delete bird'));
    }
  }

  // Get bird statistics
  async getBirdStats(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { farmId } = req.query;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      if (!currentUser) {
        res.status(404).json(createErrorResponse('User not found'));
        return;
      }

      // Determine which farm to get stats for
      const targetFarmId = currentUser.role === UserRole.ADMIN && farmId 
        ? farmId as string 
        : currentUser.farmId;

      const stats = await firestoreService.getBirdStatistics(targetFarmId);

      res.status(200).json(createSuccessResponse('Bird statistics retrieved successfully', stats));
    } catch (error: any) {
      console.error('Get bird stats error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to get bird statistics'));
    }
  }

  // Bulk update birds
  async bulkUpdateBirds(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { birdIds, updateData } = req.body;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      if (!currentUser) {
        res.status(404).json(createErrorResponse('User not found'));
        return;
      }

      // Only managers and admins can bulk update birds
      if (currentUser.role !== UserRole.MANAGER && currentUser.role !== UserRole.ADMIN) {
        res.status(403).json(createErrorResponse('Insufficient permissions to bulk update birds'));
        return;
      }

      // Verify all birds belong to user's farm (unless admin)
      if (currentUser.role !== UserRole.ADMIN) {
        const birds = await Promise.all(
          birdIds.map((id: string) => firestoreService.getBirdById(id))
        );
        
        const invalidBirds = birds.filter(bird => 
          !bird || bird.farmId !== currentUser.farmId
        );
        
        if (invalidBirds.length > 0) {
          res.status(403).json(createErrorResponse('Some birds do not belong to your farm'));
          return;
        }
      }

      const updates = birdIds.map((id: string) => ({
        id,
        data: {
          ...updateData,
          updatedAt: FirestoreTimestamp.now()
        }
      }));

      await firestoreService.bulkUpdateBirds(updates);

      res.status(200).json(createSuccessResponse('Birds updated successfully', { updatedCount: birdIds.length }));
    } catch (error: any) {
      console.error('Bulk update birds error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to bulk update birds'));
    }
  }

  async getHealthAlerts(req: Request, res: Response): Promise<void> {
    // TODO: Implement health alerts functionality
    const response = createErrorResponse('Health alerts functionality not implemented yet');
    res.status(501).json(response);
  }

  async getProductionHistory(req: Request, res: Response): Promise<void> {
    // TODO: Implement production history functionality
    const response = createErrorResponse('Production history functionality not implemented yet');
    res.status(501).json(response);
  }

  async getProductionSummary(req: Request, res: Response): Promise<void> {
    // TODO: Implement production summary functionality
    const response = createErrorResponse('Production summary functionality not implemented yet');
    res.status(501).json(response);
  }

  async updateHealthStatus(req: Request, res: Response): Promise<void> {
    // TODO: Implement update health status functionality
    const response = createErrorResponse('Update health status functionality not implemented yet');
    res.status(501).json(response);
  }

  async getHealthHistory(req: Request, res: Response): Promise<void> {
    // TODO: Implement health history functionality
    const response = createErrorResponse('Health history functionality not implemented yet');
    res.status(501).json(response);
  }

  async bulkImportBirds(req: Request, res: Response): Promise<void> {
    // TODO: Implement bulk import birds functionality
    const response = createErrorResponse('Bulk import birds functionality not implemented yet');
    res.status(501).json(response);
  }

  // Pen management methods
  async getPens(req: Request, res: Response): Promise<void> {
    // TODO: Implement get pens functionality
    const response = createErrorResponse('Get pens functionality not implemented yet');
    res.status(501).json(response);
  }

  async createPen(req: Request, res: Response): Promise<void> {
    // TODO: Implement create pen functionality
    const response = createErrorResponse('Create pen functionality not implemented yet');
    res.status(501).json(response);
  }

  async updatePen(req: Request, res: Response): Promise<void> {
    // TODO: Implement update pen functionality
    const response = createErrorResponse('Update pen functionality not implemented yet');
    res.status(501).json(response);
  }

  // Health management methods
  async getHealthOverview(req: Request, res: Response): Promise<void> {
    // TODO: Implement get health overview functionality
    const response = createErrorResponse('Get health overview functionality not implemented yet');
    res.status(501).json(response);
  }

  async recordHealthCheck(req: Request, res: Response): Promise<void> {
    // TODO: Implement record health check functionality
    const response = createErrorResponse('Record health check functionality not implemented yet');
    res.status(501).json(response);
  }
}

export default BirdController;