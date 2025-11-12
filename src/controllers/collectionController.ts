import { Request, Response } from 'express';
import FirestoreService from '../services/firestoreService';
import { ApiResponse, EggCollection, CreateEggCollectionRequest, UpdateEggCollectionRequest, PaginatedResponse, UserRole } from '../models/types';
import { createSuccessResponse, createErrorResponse } from '../utils/responseHelper';
import { Timestamp as FirestoreTimestamp } from 'firebase-admin/firestore';

const firestoreService = FirestoreService;

export class CollectionController {
  // Create new egg collection
  async createCollection(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const collectionData: CreateEggCollectionRequest = req.body;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      // Validate required fields
      if (!collectionData.date || !collectionData.shift || !collectionData.pen) {
        res.status(400).json(createErrorResponse('Missing required fields: date, shift, pen'));
        return;
      }

      // Handle both new and legacy request formats
      const quantity = collectionData.quantity || collectionData.collected || collectionData.gradeA || 0;
      const grade = collectionData.grade || collectionData.quality || 'A';
      const collector = collectionData.collector || collectionData.collectedBy || '';
      const avgWeight = collectionData.avgWeight || collectionData.weight;

      if (quantity <= 0) {
        res.status(400).json(createErrorResponse('Quantity must be greater than 0'));
        return;
      }

      // Verify user has access to the farm
      const user = await firestoreService.getUserById(userId);
      if (!user) {
        res.status(404).json(createErrorResponse('User not found'));
        return;
      }

      const targetFarmId = collectionData.farmId || user.farmId;
      
      if (user.farmId !== targetFarmId && user.role !== UserRole.ADMIN) {
        res.status(403).json(createErrorResponse('Access denied to this farm'));
        return;
      }

      const newCollection: Omit<EggCollection, 'id'> = {
        date: collectionData.date,
        shift: collectionData.shift,
        pen: collectionData.pen,
        quantity,
        grade: grade as any,
        collector: collector || user.name,
        avgWeight,
        notes: collectionData.notes,
        farmId: targetFarmId,
        // Legacy fields for backward compatibility
        collected: quantity,
        quality: grade as any,
        weight: avgWeight,
        collectedBy: collector || user.name,
        broken: collectionData.cracked || 0,
        createdAt: FirestoreTimestamp.now(),
        updatedAt: FirestoreTimestamp.now()
      };

      const createdCollection = await firestoreService.createEggCollection(newCollection);
      const collectionWithId = await firestoreService.getEggCollectionById(createdCollection.id);

      res.status(201).json(createSuccessResponse('Egg collection recorded successfully', collectionWithId));
    } catch (error: any) {
      console.error('Create collection error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to create collection'));
    }
  }

  // Get all collections with pagination and filtering
  async getCollections(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { date, shift, pen, grade, search, page = 1, limit = 100, farmId, startDate, endDate } = req.query;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      // Get user to check farm access
      const user = await firestoreService.getUserById(userId);
      if (!user) {
        res.status(404).json(createErrorResponse('User not found'));
        return;
      }

      const targetFarmId = (farmId as string) || user.farmId;
      
      // Check farm access
      if (user.farmId !== targetFarmId && user.role !== UserRole.ADMIN) {
        res.status(403).json(createErrorResponse('Access denied to this farm'));
        return;
      }

      // Build query options
      const queryOptions: any = {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        farmId: targetFarmId
      };

      // Date filtering
      if (date) {
        queryOptions.startDate = date as string;
        queryOptions.endDate = date as string;
      } else {
        if (startDate) queryOptions.startDate = startDate as string;
        if (endDate) queryOptions.endDate = endDate as string;
      }

      // Other filters
      if (shift) queryOptions.shift = shift as string;
      if (pen) queryOptions.pen = pen as string;
      if (grade) queryOptions.grade = grade as string;
      if (search) queryOptions.search = search as string;

      const collections = await firestoreService.getEggCollections(queryOptions);
      let collectionsData = collections.data || [];

      // Apply search filter in memory if provided (searches collector and pen)
      if (search) {
        const searchLower = (search as string).toLowerCase();
        collectionsData = collectionsData.map((item: any) => {
          // Map legacy fields for display
          return {
            ...item,
            quantity: item.quantity || item.collected || 0,
            grade: item.grade || item.quality || 'A',
            collector: item.collector || item.collectedBy || '',
            avgWeight: item.avgWeight || item.weight || undefined,
            collected: item.collected || item.quantity || 0,
            quality: item.quality || item.grade || 'A',
            weight: item.weight || item.avgWeight || undefined,
            collectedBy: item.collectedBy || item.collector || ''
          };
        }).filter((item: any) => {
          const collectorMatch = (item.collector || item.collectedBy || '').toLowerCase().includes(searchLower);
          const penMatch = (item.pen || '').toLowerCase().includes(searchLower);
          return collectorMatch || penMatch;
        });
      } else {
        // Just map legacy fields without filtering
        collectionsData = collectionsData.map((item: any) => ({
          ...item,
          quantity: item.quantity || item.collected || 0,
          grade: item.grade || item.quality || 'A',
          collector: item.collector || item.collectedBy || '',
          avgWeight: item.avgWeight || item.weight || undefined,
          collected: item.collected || item.quantity || 0,
          quality: item.quality || item.grade || 'A',
          weight: item.weight || item.avgWeight || undefined,
          collectedBy: item.collectedBy || item.collector || ''
        }));
      }

      // Apply pagination
      const total = collectionsData.length;
      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const offset = (pageNum - 1) * limitNum;
      const paginatedData = collectionsData.slice(offset, offset + limitNum);

      res.status(200).json(createSuccessResponse('Egg collections retrieved successfully', {
        data: paginatedData,
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
      console.error('Get collections error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to get collections'));
    }
  }

  // Get collection by ID
  async getCollectionById(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { id } = req.params;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      const collection = await firestoreService.getEggCollectionById(id);
      
      if (!collection) {
        res.status(404).json(createErrorResponse('Collection not found'));
        return;
      }

      // Check farm access
      const user = await firestoreService.getUserById(userId);
      if (!user || (user.farmId !== collection.farmId && user.role !== UserRole.ADMIN)) {
        res.status(403).json(createErrorResponse('Access denied to this collection'));
        return;
      }

      res.status(200).json(createSuccessResponse('Collection retrieved successfully', collection));
    } catch (error: any) {
      console.error('Get collection by ID error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to get collection'));
    }
  }

  // Update collection
  async updateCollection(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { id } = req.params;
      const updateData: UpdateEggCollectionRequest = req.body;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      // Get existing collection
      const existingCollection = await firestoreService.getEggCollectionById(id);
      
      if (!existingCollection) {
        res.status(404).json(createErrorResponse('Collection not found'));
        return;
      }

      // Check farm access
      const user = await firestoreService.getUserById(userId);
      if (!user || (user.farmId !== existingCollection.farmId && user.role !== UserRole.ADMIN)) {
        res.status(403).json(createErrorResponse('Access denied to this collection'));
        return;
      }

      const updatedCollection = await firestoreService.updateEggCollection(id, {
        ...updateData,
        updatedAt: FirestoreTimestamp.now()
      });

      res.status(200).json(createSuccessResponse('Collection updated successfully', updatedCollection));
    } catch (error: any) {
      console.error('Update collection error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to update collection'));
    }
  }

  // Delete collection
  async deleteCollection(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { id } = req.params;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      // Get existing collection
      const existingCollection = await firestoreService.getEggCollectionById(id);
      
      if (!existingCollection) {
        res.status(404).json(createErrorResponse('Collection not found'));
        return;
      }

      // Check farm access and permissions
      const user = await firestoreService.getUserById(userId);
      if (!user || (user.farmId !== existingCollection.farmId && user.role !== UserRole.ADMIN)) {
        res.status(403).json(createErrorResponse('Access denied to this collection'));
        return;
      }

      // Only allow deletion by managers or admins
      if (user.role !== UserRole.MANAGER && user.role !== UserRole.ADMIN) {
        res.status(403).json(createErrorResponse('Insufficient permissions to delete collection'));
        return;
      }

      await firestoreService.deleteEggCollection(id);

      res.status(200).json(createSuccessResponse('Collection deleted successfully'));
    } catch (error: any) {
      console.error('Delete collection error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to delete collection'));
    }
  }

  // Get daily collection summary
  async getDailyCollectionSummary(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { farmId, date } = req.query;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      const user = await firestoreService.getUserById(userId);
      if (!user) {
        res.status(404).json(createErrorResponse('User not found'));
        return;
      }

      const targetFarmId = farmId as string || user.farmId;
      const targetDate = date ? new Date(date as string) : new Date();
      
      // Check farm access
      if (user.farmId !== targetFarmId && user.role !== UserRole.ADMIN) {
        res.status(403).json(createErrorResponse('Access denied to this farm'));
        return;
      }

      const summary = await firestoreService.getDailyCollectionSummary(targetFarmId, targetDate);

      res.status(200).json(createSuccessResponse('Daily collection summary retrieved successfully', summary));
    } catch (error: any) {
      console.error('Get daily collection summary error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to get daily collection summary'));
    }
  }

  async getPerformanceMetrics(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { farmId, period = '30d' } = req.query;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      const user = await firestoreService.getUserById(userId);
      if (!user) {
        res.status(404).json(createErrorResponse('User not found'));
        return;
      }

      // Determine target farm
      const targetFarmId = user.role === UserRole.ADMIN && farmId 
        ? farmId as string 
        : user.farmId;

      // Calculate date range
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

      // Get collections for the period
      const collectionsResponse = await firestoreService.getEggCollections({
        farmId: targetFarmId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      });

      const collections = collectionsResponse.data || [];

      // Calculate performance metrics
      const totalEggs = collections.reduce((sum: number, collection: EggCollection) => sum + collection.quantity, 0);
      const daysInPeriod = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const avgDailyProduction = totalEggs / daysInPeriod;

      // Grade distribution
      const gradeDistribution = collections.reduce((acc: Record<string, number>, collection: EggCollection) => {
        acc[collection.grade] = (acc[collection.grade] || 0) + collection.quantity;
        return acc;
      }, {} as Record<string, number>);

      // Shift performance
      const shiftPerformance = collections.reduce((acc: Record<string, number>, collection: EggCollection) => {
        acc[collection.shift] = (acc[collection.shift] || 0) + collection.quantity;
        return acc;
      }, {} as Record<string, number>);

      // Pen performance
      const penPerformance = collections.reduce((acc: Record<string, number>, collection: EggCollection) => {
        acc[collection.pen] = (acc[collection.pen] || 0) + collection.quantity;
        return acc;
      }, {} as Record<string, number>);

      // Top performing pens
      const topPens = Object.entries(penPerformance)
        .sort(([,a], [,b]) => (b as number) - (a as number))
        .slice(0, 5)
        .map(([pen, total]) => ({ pen, total }));

      // Production trends (daily)
      const dailyTrends = collections.reduce((acc: Record<string, number>, collection: EggCollection) => {
        const date = collection.date.split('T')[0];
        acc[date] = (acc[date] || 0) + collection.quantity;
        return acc;
      }, {} as Record<string, number>);

      const performanceMetrics = {
        period,
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString()
        },
        summary: {
          totalEggs,
          avgDailyProduction: Math.round(avgDailyProduction * 100) / 100,
          totalCollections: collections.length,
          daysInPeriod
        },
        gradeDistribution,
        shiftPerformance,
        penPerformance: {
          topPens,
          totalPens: Object.keys(penPerformance).length
        },
        trends: {
          daily: dailyTrends,
          weekly: this.calculateWeeklyTrends(collections),
          monthly: this.calculateMonthlyTrends(collections)
        },
        efficiency: {
          productionConsistency: this.calculateConsistency(collections),
          peakProductionDay: this.findPeakProductionDay(collections),
          lowProductionDays: this.findLowProductionDays(collections)
        }
      };

      res.status(200).json(createSuccessResponse('Performance metrics retrieved successfully', performanceMetrics));
    } catch (error: any) {
      console.error('Get performance metrics error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to get performance metrics'));
    }
  }

  private calculateWeeklyTrends(collections: EggCollection[]): Record<string, number> {
    const weeklyTrends: Record<string, number> = {};
    
    collections.forEach(collection => {
      const date = new Date(collection.date);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      const weekKey = weekStart.toISOString().split('T')[0];
      
      weeklyTrends[weekKey] = (weeklyTrends[weekKey] || 0) + collection.quantity;
    });
    
    return weeklyTrends;
  }

  private calculateMonthlyTrends(collections: EggCollection[]): Record<string, number> {
    const monthlyTrends: Record<string, number> = {};
    
    collections.forEach(collection => {
      const date = new Date(collection.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      monthlyTrends[monthKey] = (monthlyTrends[monthKey] || 0) + collection.quantity;
    });
    
    return monthlyTrends;
  }

  private calculateConsistency(collections: EggCollection[]): number {
    if (collections.length === 0) return 0;
    
    const dailyTotals = collections.reduce((acc, collection) => {
      const date = collection.date.split('T')[0];
      acc[date] = (acc[date] || 0) + collection.quantity;
      return acc;
    }, {} as Record<string, number>);
    
    const values = Object.values(dailyTotals);
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const standardDeviation = Math.sqrt(variance);
    
    // Consistency score (lower standard deviation = higher consistency)
    return Math.max(0, 100 - (standardDeviation / mean) * 100);
  }

  private findPeakProductionDay(collections: EggCollection[]): { date: string; quantity: number } | null {
    const dailyTotals = collections.reduce((acc, collection) => {
      const date = collection.date.split('T')[0];
      acc[date] = (acc[date] || 0) + collection.quantity;
      return acc;
    }, {} as Record<string, number>);
    
    const entries = Object.entries(dailyTotals);
    if (entries.length === 0) return null;
    
    const peak = entries.reduce((max, [date, quantity]) => 
      quantity > max.quantity ? { date, quantity } : max, 
      { date: entries[0][0], quantity: entries[0][1] }
    );
    
    return peak;
  }

  private findLowProductionDays(collections: EggCollection[]): Array<{ date: string; quantity: number }> {
    const dailyTotals = collections.reduce((acc, collection) => {
      const date = collection.date.split('T')[0];
      acc[date] = (acc[date] || 0) + collection.quantity;
      return acc;
    }, {} as Record<string, number>);
    
    const values = Object.values(dailyTotals);
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const threshold = mean * 0.7; // 70% of average
    
    return Object.entries(dailyTotals)
      .filter(([, quantity]) => quantity < threshold)
      .map(([date, quantity]) => ({ date, quantity }))
      .sort((a, b) => a.quantity - b.quantity)
      .slice(0, 5); // Top 5 lowest production days
  }

  async getCollectionSummary(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { farmId, period = '30d', startDate, endDate } = req.query;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      const user = await firestoreService.getUserById(userId);
      if (!user) {
        res.status(404).json(createErrorResponse('User not found'));
        return;
      }

      // Determine target farm
      const targetFarmId = user.role === UserRole.ADMIN && farmId 
        ? farmId as string 
        : user.farmId;

      // Calculate date range
      let dateRange: { start: Date; end: Date };
      
      if (startDate && endDate) {
        dateRange = {
          start: new Date(startDate as string),
          end: new Date(endDate as string)
        };
      } else {
        const end = new Date();
        const start = new Date();
        
        switch (period) {
          case '7d':
            start.setDate(end.getDate() - 7);
            break;
          case '30d':
            start.setDate(end.getDate() - 30);
            break;
          case '90d':
            start.setDate(end.getDate() - 90);
            break;
          case '1y':
            start.setFullYear(end.getFullYear() - 1);
            break;
          default:
            start.setDate(end.getDate() - 30);
        }
        
        dateRange = { start, end };
      }

      // Get collections for the period
      const collectionsResponse = await firestoreService.getEggCollections({
        farmId: targetFarmId,
        startDate: dateRange.start.toISOString(),
        endDate: dateRange.end.toISOString()
      });

      const collections = collectionsResponse.data || [];

      // Calculate summary statistics
      const totalEggs = collections.reduce((sum: number, collection: EggCollection) => sum + collection.quantity, 0);
      const totalCollections = collections.length;
      const daysInPeriod = Math.ceil((dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24));
      const avgDailyProduction = totalEggs / daysInPeriod;

      // Grade analysis
      const gradeAnalysis = collections.reduce((acc: Record<string, { count: number; quantity: number; percentage: number }>, collection: EggCollection) => {
        if (!acc[collection.grade]) {
          acc[collection.grade] = { count: 0, quantity: 0, percentage: 0 };
        }
        acc[collection.grade].count++;
        acc[collection.grade].quantity += collection.quantity;
        return acc;
      }, {} as Record<string, { count: number; quantity: number; percentage: number }>);

      // Calculate percentages
      Object.keys(gradeAnalysis).forEach(grade => {
        gradeAnalysis[grade].percentage = (gradeAnalysis[grade].quantity / totalEggs) * 100;
      });

      // Shift analysis
      const shiftAnalysis = collections.reduce((acc: Record<string, { count: number; quantity: number; avgPerCollection: number }>, collection: EggCollection) => {
        if (!acc[collection.shift]) {
          acc[collection.shift] = { count: 0, quantity: 0, avgPerCollection: 0 };
        }
        acc[collection.shift].count++;
        acc[collection.shift].quantity += collection.quantity;
        return acc;
      }, {} as Record<string, { count: number; quantity: number; avgPerCollection: number }>);

      // Calculate averages
      Object.keys(shiftAnalysis).forEach(shift => {
        shiftAnalysis[shift].avgPerCollection = shiftAnalysis[shift].quantity / shiftAnalysis[shift].count;
      });

      // Pen analysis
      const penAnalysis = collections.reduce((acc: Record<string, { count: number; quantity: number; avgPerCollection: number }>, collection: EggCollection) => {
        if (!acc[collection.pen]) {
          acc[collection.pen] = { count: 0, quantity: 0, avgPerCollection: 0 };
        }
        acc[collection.pen].count++;
        acc[collection.pen].quantity += collection.quantity;
        return acc;
      }, {} as Record<string, { count: number; quantity: number; avgPerCollection: number }>);

      // Calculate averages
      Object.keys(penAnalysis).forEach(pen => {
        penAnalysis[pen].avgPerCollection = penAnalysis[pen].quantity / penAnalysis[pen].count;
      });

      // Top performers
      const topPens = Object.entries(penAnalysis)
        .sort(([,a], [,b]) => (b as any).quantity - (a as any).quantity)
        .slice(0, 5)
        .map(([pen, data]) => ({ pen, ...(data as any) }));

      const topShifts = Object.entries(shiftAnalysis)
        .sort(([,a], [,b]) => (b as any).quantity - (a as any).quantity)
        .map(([shift, data]) => ({ shift, ...(data as any) }));

      // Quality trends
      const qualityTrends = collections.reduce((acc: Record<string, { total: number; gradeA: number; gradeB: number; gradeC: number }>, collection: EggCollection) => {
        const date = collection.date.split('T')[0];
        if (!acc[date]) {
          acc[date] = { total: 0, gradeA: 0, gradeB: 0, gradeC: 0 };
        }
        acc[date].total += collection.quantity;
        if (collection.grade === 'A') acc[date].gradeA += collection.quantity;
        else if (collection.grade === 'B') acc[date].gradeB += collection.quantity;
        else if (collection.grade === 'C') acc[date].gradeC += collection.quantity;
        return acc;
      }, {} as Record<string, { total: number; gradeA: number; gradeB: number; gradeC: number }>);

      // Calculate quality percentages
      Object.keys(qualityTrends).forEach(date => {
        const trend = qualityTrends[date];
        trend.gradeA = (trend.gradeA / trend.total) * 100;
        trend.gradeB = (trend.gradeB / trend.total) * 100;
        trend.gradeC = (trend.gradeC / trend.total) * 100;
      });

      const summary = {
        period,
        dateRange: {
          start: dateRange.start.toISOString(),
          end: dateRange.end.toISOString()
        },
        overview: {
          totalEggs,
          totalCollections,
          daysInPeriod,
          avgDailyProduction: Math.round(avgDailyProduction * 100) / 100,
          avgPerCollection: totalCollections > 0 ? Math.round((totalEggs / totalCollections) * 100) / 100 : 0
        },
        gradeAnalysis,
        shiftAnalysis,
        penAnalysis: {
          totalPens: Object.keys(penAnalysis).length,
          topPens,
          allPens: penAnalysis
        },
        shiftPerformance: {
          topShifts,
          allShifts: shiftAnalysis
        },
        qualityTrends,
        insights: {
          bestPerformingPen: topPens[0]?.pen || 'N/A',
          bestPerformingShift: topShifts[0]?.shift || 'N/A',
          mostCommonGrade: Object.keys(gradeAnalysis).reduce((a, b) => 
            gradeAnalysis[a].quantity > gradeAnalysis[b].quantity ? a : b, 'N/A'
          ),
          productionConsistency: this.calculateConsistency(collections)
        }
      };

      res.status(200).json(createSuccessResponse('Collection summary retrieved successfully', summary));
    } catch (error: any) {
      console.error('Get collection summary error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to get collection summary'));
    }
  }

  async getDailySummary(req: Request, res: Response): Promise<void> {
    // TODO: Implement daily summary functionality
    const response = createErrorResponse('Daily summary functionality not implemented yet');
    res.status(501).json(response);
  }

  // Get egg collection statistics
  async getEggStats(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { farmId } = req.query;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      const user = await firestoreService.getUserById(userId);
      if (!user) {
        res.status(404).json(createErrorResponse('User not found'));
        return;
      }

      const targetFarmId = (user.role === UserRole.ADMIN && farmId) 
        ? farmId as string 
        : user.farmId;

      // Get all collections for the farm
      const allCollectionsResponse = await firestoreService.getEggCollections({
        farmId: targetFarmId,
        limit: 10000
      });
      const allCollections = allCollectionsResponse.data || [];

      // Helper to get date string
      const getDateStr = (date: Date): string => date.toISOString().split('T')[0];

      // Get today's date
      const today = new Date();
      const todayStr = getDateStr(today);
      
      // Get yesterday's date
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = getDateStr(yesterday);

      // Get start of current week (last 7 days)
      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() - 7);
      const weekStartStr = getDateStr(weekStart);

      // Get start of previous week
      const prevWeekStart = new Date(weekStart);
      prevWeekStart.setDate(prevWeekStart.getDate() - 7);
      const prevWeekStartStr = getDateStr(prevWeekStart);

      // Get start of current month
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthStartStr = getDateStr(monthStart);

      // Get start of previous month
      const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const prevMonthStartStr = getDateStr(prevMonthStart);
      const prevMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
      const prevMonthEndStr = getDateStr(prevMonthEnd);

      // Helper function to sum quantities for a date range
      const sumForDateRange = (collections: any[], startDate: string, endDate: string): number => {
        return collections
          .filter(c => {
            const cDate = c.date || c.createdAt?.toDate?.()?.toISOString().split('T')[0] || '';
            return cDate >= startDate && cDate <= endDate;
          })
          .reduce((sum, c) => sum + (c.quantity || c.collected || 0), 0);
      };

      // Calculate today's collection
      const todayCollection = sumForDateRange(allCollections, todayStr, todayStr);
      const yesterdayCollection = sumForDateRange(allCollections, yesterdayStr, yesterdayStr);
      const todayChange = yesterdayCollection > 0 
        ? `${((todayCollection - yesterdayCollection) / yesterdayCollection * 100).toFixed(1)}%`
        : todayCollection > 0 ? '+100%' : '0%';
      const todayChangeFormatted = todayCollection >= yesterdayCollection 
        ? `+${todayChange}` 
        : todayChange;

      // Calculate weekly total
      const weeklyTotal = sumForDateRange(allCollections, weekStartStr, todayStr);
      const prevWeeklyTotal = sumForDateRange(allCollections, prevWeekStartStr, weekStartStr);
      const weeklyChange = prevWeeklyTotal > 0
        ? `${((weeklyTotal - prevWeeklyTotal) / prevWeeklyTotal * 100).toFixed(1)}%`
        : weeklyTotal > 0 ? '+100%' : '0%';
      const weeklyChangeFormatted = weeklyTotal >= prevWeeklyTotal
        ? `+${weeklyChange}`
        : weeklyChange;

      // Calculate monthly total
      const monthlyTotal = sumForDateRange(allCollections, monthStartStr, todayStr);
      const prevMonthlyTotal = sumForDateRange(allCollections, prevMonthStartStr, prevMonthEndStr);
      const monthlyChange = prevMonthlyTotal > 0
        ? `${((monthlyTotal - prevMonthlyTotal) / prevMonthlyTotal * 100).toFixed(1)}%`
        : monthlyTotal > 0 ? '+100%' : '0%';
      const monthlyChangeFormatted = monthlyTotal >= prevMonthlyTotal
        ? `+${monthlyChange}`
        : monthlyChange;

      // Calculate average per bird
      const birdStats = await firestoreService.getBirdStatistics(targetFarmId);
      const totalBirds = birdStats.totalBirds || 0;
      const avgPerBird = totalBirds > 0 ? (monthlyTotal / totalBirds).toFixed(2) : '0';

      // Calculate average weight
      const collectionsWithWeight = allCollections.filter(c => c.avgWeight || c.weight);
      const avgWeight = collectionsWithWeight.length > 0
        ? collectionsWithWeight.reduce((sum, c) => {
            const weight = c.avgWeight || c.weight || '0g';
            const weightNum = parseFloat(weight.replace(/[^0-9.]/g, ''));
            return sum + weightNum;
          }, 0) / collectionsWithWeight.length
        : 0;
      const avgWeightFormatted = avgWeight > 0 ? `${Math.round(avgWeight)}g` : undefined;

      // Calculate Grade AA rate
      const totalEggs = allCollections.reduce((sum, c) => sum + (c.quantity || c.collected || 0), 0);
      const aaEggs = allCollections
        .filter(c => (c.grade || c.quality) === 'AA')
        .reduce((sum, c) => sum + (c.quantity || c.collected || 0), 0);
      const gradeAARate = totalEggs > 0 ? `${Math.round((aaEggs / totalEggs) * 100)}%` : '0%';

      // Calculate daily production (average over last 7 days)
      const last7DaysStart = new Date(today);
      last7DaysStart.setDate(last7DaysStart.getDate() - 7);
      const last7DaysStartStr = last7DaysStart.toISOString().split('T')[0];
      const last7DaysTotal = sumForDateRange(allCollections, last7DaysStartStr, todayStr);
      const dailyProduction = (last7DaysTotal / 7).toFixed(1);

      // Calculate production trend (compare last 7 days with previous 7 days)
      const prev7DaysStart = new Date(last7DaysStart);
      prev7DaysStart.setDate(prev7DaysStart.getDate() - 7);
      const prev7DaysStartStr = prev7DaysStart.toISOString().split('T')[0];
      const prev7DaysTotal = sumForDateRange(allCollections, prev7DaysStartStr, last7DaysStartStr);
      const productionChange = prev7DaysTotal > 0
        ? `${((last7DaysTotal - prev7DaysTotal) / prev7DaysTotal * 100).toFixed(1)}%`
        : last7DaysTotal > 0 ? '+100%' : '0%';
      const productionTrend = last7DaysTotal > prev7DaysTotal ? 'up' 
        : last7DaysTotal < prev7DaysTotal ? 'down' 
        : 'stable';

      const stats = {
        todayCollection,
        todayChange: todayChangeFormatted,
        weeklyTotal,
        weeklyChange: weeklyChangeFormatted,
        monthlyTotal,
        monthlyChange: monthlyChangeFormatted,
        avgPerBird: parseFloat(avgPerBird),
        dailyProduction: parseFloat(dailyProduction),
        productionChange,
        productionTrend,
        avgWeight: avgWeightFormatted,
        gradeAARate
      };

      res.status(200).json(createSuccessResponse('Egg collection statistics retrieved successfully', stats));
    } catch (error: any) {
      console.error('Get egg stats error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to get egg statistics'));
    }
  }

  // Get production chart data
  async getProductionChart(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { period = '7d', farmId } = req.query;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      const user = await firestoreService.getUserById(userId);
      if (!user) {
        res.status(404).json(createErrorResponse('User not found'));
        return;
      }

      const targetFarmId = (user.role === UserRole.ADMIN && farmId) 
        ? farmId as string 
        : user.farmId;

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
          startDate.setDate(endDate.getDate() - 7);
      }

      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      // Get collections for the period
      const collectionsResponse = await firestoreService.getEggCollections({
        farmId: targetFarmId,
        startDate: startDateStr,
        endDate: endDateStr,
        limit: 10000
      });

      const collections = collectionsResponse.data || [];

      // Helper to get date string
      const getDateStr = (date: Date): string => date.toISOString().split('T')[0];
      const todayStr = getDateStr(new Date());

      // Group by date
      const dailyData: Record<string, {
        date: string;
        quantity: number;
        gradeAA: number;
        gradeA: number;
        gradeB: number;
        gradeC: number;
        total: number;
      }> = {};
      
      collections.forEach((collection: any) => {
        const date = collection.date || collection.createdAt?.toDate?.()?.toISOString().split('T')[0] || todayStr;
        const quantity = collection.quantity || collection.collected || 0;
        const grade = collection.grade || collection.quality || 'A';

        if (!dailyData[date]) {
          dailyData[date] = {
            date,
            quantity: 0,
            gradeAA: 0,
            gradeA: 0,
            gradeB: 0,
            gradeC: 0,
            total: 0
          };
        }

        dailyData[date].quantity += quantity;
        dailyData[date].total += quantity;

        if (grade === 'AA') dailyData[date].gradeAA += quantity;
        else if (grade === 'A') dailyData[date].gradeA += quantity;
        else if (grade === 'B') dailyData[date].gradeB += quantity;
        else if (grade === 'C') dailyData[date].gradeC += quantity;
      });

      // Convert to array and sort by date
      const chartData = Object.values(dailyData)
        .sort((a, b) => a.date.localeCompare(b.date));

      // Calculate totals
      const totalProduction = chartData.reduce((sum, d) => sum + d.total, 0);
      const averageDaily = chartData.length > 0 ? totalProduction / chartData.length : 0;

      // Format for chart library (labels and datasets)
      const labels = chartData.map(d => d.date);
      const quantities = chartData.map(d => d.total);

      const response = {
        labels,
        datasets: [
          {
            label: 'Total Production',
            data: quantities,
            backgroundColor: 'rgba(59, 130, 246, 0.5)',
            borderColor: 'rgba(59, 130, 246, 1)'
          }
        ],
        period: period as string,
        totalProduction,
        averageDaily: Math.round(averageDaily * 100) / 100,
        // Alternative format for different chart libraries
        data: chartData
      };

      res.status(200).json(createSuccessResponse('Production chart data retrieved successfully', response));
    } catch (error: any) {
      console.error('Get production chart error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to get production chart data'));
    }
  }

  async getProductionTrends(req: Request, res: Response): Promise<void> {
    // Redirect to production-chart endpoint
    await this.getProductionChart(req, res);
  }

  async searchCollections(req: Request, res: Response): Promise<void> {
    // TODO: Implement search collections functionality
    const response = createErrorResponse('Search collections functionality not implemented yet');
    res.status(501).json(response);
  }

  async exportCollections(req: Request, res: Response): Promise<void> {
    // TODO: Implement export collections functionality
    const response = createErrorResponse('Export collections functionality not implemented yet');
    res.status(501).json(response);
  }
}

export default CollectionController;