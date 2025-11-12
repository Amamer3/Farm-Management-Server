import { Request, Response } from 'express';
import FirestoreService from '../services/firestoreService';
import { ApiResponse, UserRole } from '../models/types';
import { createSuccessResponse, createErrorResponse } from '../utils/responseHelper';

const firestoreService = FirestoreService;

export class DashboardController {
  // Get dashboard overview data
  async getOverview(req: Request, res: Response): Promise<void> {
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

      const targetFarmId = currentUser.role === UserRole.ADMIN && farmId 
        ? farmId as string 
        : currentUser.farmId;

      // Get overview data
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

      const [todayCollectionsResponse, birdsResponse, feedInventoryResponse, medicineInventoryResponse] = await Promise.all([
        firestoreService.getEggCollections({ 
          startDate: startOfDay.toISOString().split('T')[0], 
          endDate: endOfDay.toISOString().split('T')[0],
          sortBy: 'date',
          limit: 1000
        }),
        firestoreService.getBirds(),
        firestoreService.getFeedInventory(),
        firestoreService.getMedicineInventory()
      ]);
      const todayCollections = { data: (todayCollectionsResponse?.data || []).filter((collection: any) => collection.farmId === targetFarmId) };

      const allBirds = birdsResponse?.data || [];
      const farmBirds = allBirds.filter((bird: any) => bird.farmId === targetFarmId);
      const feedInventory = (feedInventoryResponse?.data || []).filter((item: any) => item.farmId === targetFarmId);
      const medicineInventory = (medicineInventoryResponse?.data || []).filter((item: any) => item.farmId === targetFarmId);

      const overview = {
        todayEggCount: todayCollections.data?.reduce((sum: number, collection: any) => sum + (collection.quantity || 0), 0) || 0,
        totalBirds: farmBirds.length,
        activeBirds: farmBirds.filter((bird: any) => bird.status === 'active').length,
        feedItems: feedInventory.length,
        lowStockFeed: feedInventory.filter((feed: any) => feed.quantity < feed.minimumStock).length,
        medicineItems: medicineInventory.length,
        expiredMedicine: medicineInventory.filter((medicine: any) => new Date(medicine.expiryDate) < new Date()).length
      };

      res.status(200).json(createSuccessResponse('Dashboard overview retrieved successfully', overview));
    } catch (error: any) {
      console.error('Get dashboard overview error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to get dashboard overview'));
    }
  }

  // Get recent activity feed
  async getRecentActivity(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { limit = 10 } = req.query;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      if (!currentUser) {
        res.status(404).json(createErrorResponse('User not found'));
        return;
      }

      // Get recent collections as activity
      const recentCollectionsResponse = await firestoreService.getEggCollections({
        limit: parseInt(limit as string)
      });
      const recentCollections = (recentCollectionsResponse?.data || []).filter((collection: any) => collection.farmId === currentUser.farmId);

      const activities = recentCollections.map((collection: any) => ({
        id: collection.id,
        type: 'egg_collection',
        description: `${collection.quantity} eggs collected`,
        timestamp: collection.createdAt,
        user: collection.collectedBy
      }));

      res.status(200).json(createSuccessResponse('Recent activity retrieved successfully', activities));
    } catch (error: any) {
      console.error('Get recent activity error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to get recent activity'));
    }
  }

  // Get system alerts
  async getAlerts(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      if (!currentUser) {
        res.status(404).json(createErrorResponse('User not found'));
        return;
      }

      const alerts: any[] = [];

      // Check for low stock feed
      const feedInventoryResponse = await firestoreService.getFeedInventory();
      const feedInventory = (feedInventoryResponse?.data || []).filter((item: any) => item.farmId === currentUser.farmId);
      const lowStockFeed = feedInventory.filter((feed: any) => feed.quantity < feed.minimumStock);
      
      if (lowStockFeed.length > 0) {
        alerts.push({
          id: 'low-stock-feed',
          type: 'warning',
          title: 'Low Stock Alert',
          message: `${lowStockFeed.length} feed items are running low`,
          timestamp: new Date()
        });
      }

      // Check for expired medicine
      const medicineInventoryResponse = await firestoreService.getMedicineInventory();
      const medicineInventory = (medicineInventoryResponse?.data || []).filter((item: any) => item.farmId === currentUser.farmId);
      const expiredMedicine = medicineInventory.filter((medicine: any) => new Date(medicine.expiryDate) < new Date());
      
      if (expiredMedicine.length > 0) {
        alerts.push({
          id: 'expired-medicine',
          type: 'error',
          title: 'Expired Medicine',
          message: `${expiredMedicine.length} medicine items have expired`,
          timestamp: new Date()
        });
      }

      res.status(200).json(createSuccessResponse('System alerts retrieved successfully', alerts));
    } catch (error: any) {
      console.error('Get system alerts error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to get system alerts'));
    }
  }

  // Get performance metrics
  async getPerformance(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { farmId, period = '30d' } = req.query;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      if (!currentUser) {
        res.status(404).json(createErrorResponse('User not found'));
        return;
      }

      const targetFarmId = currentUser.role === UserRole.ADMIN && farmId 
        ? farmId as string 
        : currentUser.farmId;

      // Calculate date range based on period
      const endDate = new Date();
      const startDate = new Date();
      
      switch (period) {
        case '7d':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(endDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(endDate.getDate() - 90);
          break;
        case '1y':
          startDate.setFullYear(endDate.getFullYear() - 1);
          break;
        default:
          startDate.setDate(endDate.getDate() - 30);
      }

      // Get data for performance metrics
      const [collectionsResponse, birdsResponse, feedInventoryResponse] = await Promise.all([
        firestoreService.getEggCollections({ 
          startDate: startDate.toISOString().split('T')[0], 
          endDate: endDate.toISOString().split('T')[0],
          sortBy: 'date',
          limit: 10000
        }),
        firestoreService.getBirds(),
        firestoreService.getFeedInventory()
      ]);

      const collections = Array.isArray(collectionsResponse?.data) 
        ? (collectionsResponse.data || []).filter((c: any) => c && c.farmId === targetFarmId)
        : [];
      const allBirds = Array.isArray(birdsResponse?.data) ? (birdsResponse.data || []) : [];
      const farmBirds = allBirds.filter((bird: any) => bird && bird.farmId === targetFarmId);
      const feedInventory = Array.isArray(feedInventoryResponse?.data) 
        ? (feedInventoryResponse.data || []).filter((item: any) => item && item.farmId === targetFarmId)
        : [];

      // Calculate total eggs collected
      const totalEggs = collections.reduce((sum: number, c: any) => sum + (c?.quantity || 0), 0);
      const daysInPeriod = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const avgDailyProduction = daysInPeriod > 0 ? totalEggs / daysInPeriod : 0;

      // Calculate production rate (eggs per bird per day)
      const activeBirds = farmBirds.filter((bird: any) => bird.status === 'active').length;
      const productionRate = activeBirds > 0 ? avgDailyProduction / activeBirds : 0;

      // Calculate feed efficiency (eggs per kg of feed)
      const totalFeedConsumed = feedInventory.reduce((sum: number, feed: any) => {
        // This is a simplified calculation - in reality, you'd track actual consumption
        return sum + (feed.quantity || 0);
      }, 0);
      const feedEfficiency = totalFeedConsumed > 0 ? totalEggs / totalFeedConsumed : 0;

      // Calculate mortality rate
      const totalBirds = farmBirds.length;
      const inactiveBirds = farmBirds.filter((bird: any) => bird.status !== 'active').length;
      const mortalityRate = totalBirds > 0 ? (inactiveBirds / totalBirds) * 100 : 0;

      const performance = {
        period,
        dateRange: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        },
        metrics: {
          productionRate: parseFloat(productionRate.toFixed(2)),
          feedEfficiency: parseFloat(feedEfficiency.toFixed(2)),
          mortalityRate: parseFloat(mortalityRate.toFixed(2)),
          avgDailyProduction: parseFloat(avgDailyProduction.toFixed(2))
        },
        totals: {
          totalEggs: totalEggs,
          totalBirds,
          activeBirds,
          totalFeedConsumed: parseFloat(totalFeedConsumed.toFixed(2))
        }
      };

      res.status(200).json(createSuccessResponse('Performance metrics retrieved successfully', performance));
    } catch (error: any) {
      console.error('Get performance metrics error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to get performance metrics'));
    }
  }

  // Get user notifications
  async getNotifications(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      // For now, return empty notifications as this would require a separate notifications system
      const notifications: any[] = [];

      res.status(200).json(createSuccessResponse('Notifications retrieved successfully', notifications));
    } catch (error: any) {
      console.error('Get notifications error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to get notifications'));
    }
  }

  // Mark notification as read
  async markNotificationAsRead(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { id } = req.params;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      // For now, just return success as this would require a separate notifications system
      res.status(200).json(createSuccessResponse('Notification marked as read', { id }));
    } catch (error: any) {
      console.error('Mark notification as read error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to mark notification as read'));
    }
  }
}

export default DashboardController;