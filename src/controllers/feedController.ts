import { Request, Response } from 'express';
import FirestoreService from '../services/firestoreService';
import { ApiResponse, FeedInventory, CreateFeedRequest, UpdateFeedRequest, PaginatedResponse, UserRole, FeedUsageRequest, FeedReorderRequest } from '../models/types';
import { logger } from '../utils/logger';
import { createSuccessResponse, createErrorResponse } from '../utils/responseHelper';
import { Timestamp as FirestoreTimestamp } from 'firebase-admin/firestore';

const firestoreService = FirestoreService;

// Helper function to calculate feed status based on stock levels
const calculateFeedStatus = (stock: number, maxCapacity?: number, minimumStock?: number): 'In Stock' | 'Low Stock' | 'Out of Stock' => {
  if (stock <= 0) {
    return 'Out of Stock';
  }
  
  const threshold = maxCapacity ? maxCapacity * 0.3 : (minimumStock ? minimumStock * 1.5 : 100);
  
  if (stock < threshold) {
    return 'Low Stock';
  }
  
  return 'In Stock';
};

export class FeedController {
  // Get all feed inventory with pagination and filtering
  async getFeedInventory(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { type, status, search, supplier, page = 1, limit = 100 } = req.query;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      if (!currentUser) {
        res.status(404).json(createErrorResponse('User not found'));
        return;
      }

      // Get all feed inventory for the farm
      const queryOptions: any = {
        page: parseInt(page as string),
        limit: parseInt(limit as string)
      };
      
      // Admins can view feed from any farm, others only their farm
      if (currentUser.role === UserRole.ADMIN) {
        // Admin can filter by farmId if provided
      } else {
        queryOptions.farmId = currentUser.farmId;
      }

      const feedInventory = await firestoreService.getFeedInventory(queryOptions);
      let feedItems = feedInventory.data || [];

      // Apply filters in memory
      if (type) {
        const typeLower = (type as string).toLowerCase();
        feedItems = feedItems.filter((item: any) => {
          const itemType = (item.type || item.feedType || '').toLowerCase();
          return itemType === typeLower;
        });
      }

      if (supplier) {
        const supplierLower = (supplier as string).toLowerCase();
        feedItems = feedItems.filter((item: any) => {
          const itemSupplier = (item.supplier || '').toLowerCase();
          return itemSupplier.includes(supplierLower);
        });
      }

      if (search) {
        const searchLower = (search as string).toLowerCase();
        feedItems = feedItems.filter((item: any) => {
          const itemName = (item.name || item.feedType || '').toLowerCase();
          const itemSupplier = (item.supplier || '').toLowerCase();
          return itemName.includes(searchLower) || itemSupplier.includes(searchLower);
        });
      }

      // Calculate status for each item and filter by status if needed
      feedItems = feedItems.map((item: any) => {
        const stock = item.stock || item.quantity || 0;
        const status = calculateFeedStatus(stock, item.maxCapacity, item.minimumStock);
        return {
          ...item,
          stock,
          status,
          // Map legacy fields
          name: item.name || item.feedType,
          type: item.type || item.feedType,
          quantity: item.quantity || item.stock
        };
      });

      if (status) {
        const statusValue = status as string;
        feedItems = feedItems.filter((item: any) => item.status === statusValue);
      }

      // Apply pagination
      const total = feedItems.length;
      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const offset = (pageNum - 1) * limitNum;
      const paginatedItems = feedItems.slice(offset, offset + limitNum);

      res.status(200).json(createSuccessResponse('Feed inventory retrieved successfully', {
        data: paginatedItems,
        total,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
          hasNext: offset + limitNum < total,
          hasPrev: pageNum > 1
        }
      }));
    } catch (error: any) {
      console.error('Get feed inventory error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to get feed inventory'));
    }
  }

  // Get feed item by ID
  async getFeedById(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { id } = req.params;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      const feedItem = await firestoreService.getFeedById(id);
      
      if (!currentUser || !feedItem) {
        res.status(404).json(createErrorResponse('Feed item not found'));
        return;
      }

      // Check if user can access this feed item (same farm or super admin)
      if (currentUser.role !== UserRole.ADMIN && currentUser.farmId !== feedItem.farmId) {
        res.status(403).json(createErrorResponse('Access denied to this farm'));
        return;
      }

      res.status(200).json(createSuccessResponse(feedItem, 'Feed item retrieved successfully'));
    } catch (error: any) {
      console.error('Get feed by ID error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to get feed item'));
    }
  }

  // Add new feed to inventory
  async addFeed(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const feedData: CreateFeedRequest = req.body;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      // Validate required fields
      if (!feedData.name || !feedData.type || !feedData.supplier || !feedData.quantity || !feedData.unit) {
        res.status(400).json(createErrorResponse('Missing required fields: name, type, supplier, quantity, unit'));
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      if (!currentUser) {
        res.status(404).json(createErrorResponse('User not found'));
        return;
      }

      // Set farmId based on user role (workers use their farmId, admins can specify)
      const farmId = currentUser.role === UserRole.ADMIN && feedData.farmId 
        ? feedData.farmId 
        : currentUser.farmId;

      const stock = feedData.quantity;
      const status = calculateFeedStatus(stock, feedData.maxCapacity);

      const newFeedData: Omit<FeedInventory, 'id'> = {
        name: feedData.name,
        type: feedData.type,
        supplier: feedData.supplier,
        stock: feedData.quantity,
        unit: feedData.unit,
        costPerUnit: feedData.costPerUnit,
        expiryDate: feedData.expiryDate,
        location: feedData.location,
        batchNumber: feedData.batchNumber,
        notes: feedData.notes,
        maxCapacity: feedData.maxCapacity,
        status,
        farmId,
        // Legacy fields for backward compatibility
        feedType: feedData.name,
        quantity: feedData.quantity,
        createdAt: FirestoreTimestamp.now(),
        updatedAt: FirestoreTimestamp.now()
      };

      const newFeedId = await firestoreService.addFeed(newFeedData);
      const createdFeed = await firestoreService.getFeedById(newFeedId);

      res.status(201).json(createSuccessResponse('Feed item created successfully', createdFeed));
    } catch (error: any) {
      console.error('Add feed error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to add feed'));
    }
  }

  // Update feed inventory
  async updateFeed(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { id } = req.params;
      const updateData: UpdateFeedRequest = req.body;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      const feedItem = await firestoreService.getFeedById(id);
      
      if (!currentUser || !feedItem) {
        res.status(404).json(createErrorResponse('Feed item not found'));
        return;
      }

      // Check permissions
      const canUpdate = currentUser.role === UserRole.ADMIN ||
                       (currentUser.role === UserRole.MANAGER && currentUser.farmId === feedItem.farmId);

      if (!canUpdate) {
        res.status(403).json(createErrorResponse('Access denied to update this feed item'));
        return;
      }

      // Prepare update data
      const updateFields: any = {};
      
      if (updateData.name !== undefined) updateFields.name = updateData.name;
      if (updateData.type !== undefined) updateFields.type = updateData.type;
      if (updateData.supplier !== undefined) updateFields.supplier = updateData.supplier;
      if (updateData.stock !== undefined) updateFields.stock = updateData.stock;
      if (updateData.quantity !== undefined) {
        updateFields.stock = updateData.quantity;
        updateFields.quantity = updateData.quantity; // Legacy
      }
      if (updateData.maxCapacity !== undefined) updateFields.maxCapacity = updateData.maxCapacity;
      if (updateData.unit !== undefined) updateFields.unit = updateData.unit;
      if (updateData.costPerUnit !== undefined) updateFields.costPerUnit = updateData.costPerUnit;
      if (updateData.expiryDate !== undefined) updateFields.expiryDate = updateData.expiryDate;
      if (updateData.location !== undefined) updateFields.location = updateData.location;
      if (updateData.notes !== undefined) updateFields.notes = updateData.notes;

      // Recalculate status if stock changed
      const finalStock = updateFields.stock !== undefined ? updateFields.stock : (feedItem.stock || feedItem.quantity || 0);
      const maxCapacity = updateFields.maxCapacity !== undefined ? updateFields.maxCapacity : feedItem.maxCapacity;
      const minimumStock = feedItem.minimumStock;
      updateFields.status = calculateFeedStatus(finalStock, maxCapacity, minimumStock);

      // Update feed in Firestore
      await firestoreService.updateFeed(id, {
        ...updateFields,
        updatedAt: FirestoreTimestamp.now()
      });

      // Get the updated feed data
      const updatedFeed = await firestoreService.getFeedById(id);

      res.status(200).json(createSuccessResponse('Feed inventory updated successfully', updatedFeed));
    } catch (error: any) {
      console.error('Update feed error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to update feed'));
    }
  }

  // Delete feed from inventory
  async deleteFeed(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { id } = req.params;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      const feedItem = await firestoreService.getFeedById(id);
      
      if (!currentUser || !feedItem) {
        res.status(404).json(createErrorResponse('Feed item not found'));
        return;
      }

      // Only farm managers and super admins can delete feed
      if (currentUser.role !== UserRole.MANAGER && currentUser.role !== UserRole.ADMIN) {
        res.status(403).json(createErrorResponse('Insufficient permissions to delete feed'));
        return;
      }

      // Check if user can delete this feed item (same farm or super admin)
      if (currentUser.role !== UserRole.ADMIN && currentUser.farmId !== feedItem.farmId) {
        res.status(403).json(createErrorResponse('Access denied to delete this feed item'));
        return;
      }

      await firestoreService.deleteFeed(id);

      res.status(200).json(createSuccessResponse('Feed deleted from inventory successfully'));
    } catch (error: any) {
      console.error('Delete feed error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to delete feed'));
    }
  }

  // Get low stock alerts
  async getLowStockAlerts(req: Request, res: Response): Promise<void> {
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

      // Determine which farm to get alerts for
      const targetFarmId = currentUser.role === UserRole.ADMIN && farmId 
        ? farmId as string 
        : currentUser.farmId;

      const lowStockItems = await firestoreService.getLowStockFeed(targetFarmId);

      res.status(200).json(createSuccessResponse('Low stock alerts retrieved successfully', lowStockItems));
    } catch (error: any) {
      console.error('Get low stock alerts error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to get low stock alerts'));
    }
  }

  // Record feed consumption (legacy endpoint)
  async recordFeedConsumption(req: Request, res: Response): Promise<void> {
    await this.recordFeedUsage(req, res);
  }

  // Record feed usage (new endpoint)
  async recordFeedUsage(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const usageData: FeedUsageRequest = req.body;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      // Validate required fields
      if (!usageData.feedId || !usageData.quantity || !usageData.pen || !usageData.date) {
        res.status(400).json(createErrorResponse('Missing required fields: feedId, quantity, pen, date'));
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      const feedItem = await firestoreService.getFeedById(usageData.feedId);
      
      if (!currentUser || !feedItem) {
        res.status(404).json(createErrorResponse('Feed item not found'));
        return;
      }

      // Check if user can record usage for this feed (same farm or super admin)
      if (currentUser.role !== UserRole.ADMIN && currentUser.farmId !== feedItem.farmId) {
        res.status(403).json(createErrorResponse('Access denied to record usage for this feed'));
        return;
      }

      // Check if there's enough stock
      const currentStock = feedItem.stock || feedItem.quantity || 0;
      if (currentStock < usageData.quantity) {
        res.status(400).json(createErrorResponse('Insufficient stock for this usage'));
        return;
      }

      // Record usage
      await firestoreService.recordFeedConsumption({
        feedId: usageData.feedId,
        quantityUsed: usageData.quantity,
        quantity: usageData.quantity, // For compatibility
        pen: usageData.pen,
        consumedBy: usageData.usedBy || userId,
        usedBy: usageData.usedBy || userId,
        date: usageData.date,
        consumedAt: FirestoreTimestamp.fromDate(new Date(usageData.date)),
        notes: usageData.notes,
        farmId: feedItem.farmId
      });

      // Update feed stock
      const newStock = currentStock - usageData.quantity;
      const newStatus = calculateFeedStatus(newStock, feedItem.maxCapacity, feedItem.minimumStock);
      
      await firestoreService.updateFeed(usageData.feedId, {
        stock: newStock,
        quantity: newStock, // Legacy field
        status: newStatus,
        updatedAt: FirestoreTimestamp.now()
      });

      const updatedFeed = await firestoreService.getFeedById(usageData.feedId);

      res.status(200).json(createSuccessResponse('Feed usage recorded successfully', updatedFeed));
    } catch (error: any) {
      console.error('Record feed usage error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to record feed usage'));
    }
  }

  // Get feed consumption history (legacy endpoint)
  async getFeedConsumptionHistory(req: Request, res: Response): Promise<void> {
    await this.getFeedUsageHistory(req, res);
  }

  // Get feed usage history (new endpoint)
  async getFeedUsageHistory(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { feedId, dateFrom, dateTo } = req.query;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      if (!currentUser) {
        res.status(404).json(createErrorResponse('User not found'));
        return;
      }

      // Determine which farm to get history for
      const targetFarmId = currentUser.farmId;

      const filters: any = { farmId: targetFarmId };
      if (feedId) filters.feedId = feedId as string;
      if (dateFrom) filters.dateFrom = new Date(dateFrom as string);
      if (dateTo) filters.dateTo = new Date(dateTo as string);

      const usageHistory = await firestoreService.getFeedUsageHistory(filters);

      res.status(200).json(createSuccessResponse('Feed usage history retrieved successfully', usageHistory));
    } catch (error: any) {
      console.error('Get feed usage history error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to get feed usage history'));
     }
   }

  async getFeedEfficiencyMetrics(req: Request, res: Response): Promise<void> {
    // TODO: Implement feed efficiency metrics functionality
    const response = createErrorResponse('Feed efficiency metrics functionality not implemented yet');
    res.status(501).json(response);
  }

  async getFeedUsageTrends(req: Request, res: Response): Promise<void> {
    // TODO: Implement feed usage trends functionality
    const response = createErrorResponse('Feed usage trends functionality not implemented yet');
    res.status(501).json(response);
  }

  async getFeedCostAnalysis(req: Request, res: Response): Promise<void> {
    // TODO: Implement feed cost analysis functionality
    const response = createErrorResponse('Feed cost analysis functionality not implemented yet');
    res.status(501).json(response);
  }

  async getFeedSuppliers(req: Request, res: Response): Promise<void> {
    // TODO: Implement feed suppliers functionality
    const response = createErrorResponse('Feed suppliers functionality not implemented yet');
    res.status(501).json(response);
  }

  async getFeedStats(req: Request, res: Response): Promise<void> {
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

      const stats = await firestoreService.getFeedInventoryStats(targetFarmId);

      res.status(200).json(createSuccessResponse('Feed statistics retrieved successfully', stats));
    } catch (error: any) {
      console.error('Get feed stats error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to get feed statistics'));
    }
  }

  // Create reorder request
  async createFeedReorder(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { id } = req.params;
      const reorderData: FeedReorderRequest = req.body;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      // Validate required fields
      if (!reorderData.quantity) {
        res.status(400).json(createErrorResponse('Missing required field: quantity'));
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      const feedItem = await firestoreService.getFeedById(id);
      
      if (!currentUser || !feedItem) {
        res.status(404).json(createErrorResponse('Feed item not found'));
        return;
      }

      // Check if user can create reorder for this feed (same farm or super admin)
      if (currentUser.role !== UserRole.ADMIN && currentUser.farmId !== feedItem.farmId) {
        res.status(403).json(createErrorResponse('Access denied to create reorder for this feed'));
        return;
      }

      const reorderId = await firestoreService.createFeedReorder(id, {
        quantity: reorderData.quantity,
        priority: reorderData.priority || 'medium',
        notes: reorderData.notes,
        farmId: feedItem.farmId
      });

      res.status(201).json(createSuccessResponse('Reorder request created successfully', { id: reorderId }));
    } catch (error: any) {
      console.error('Create feed reorder error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to create reorder request'));
    }
  }
 }

 export default FeedController;