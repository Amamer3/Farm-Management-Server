import { Request, Response } from 'express';
import FirestoreService from '../services/firestoreService';
import { ApiResponse, UserRole, DateRange, StatsQuery } from '../models/types';
import { logger } from '../utils/logger';
import { createSuccessResponse, createErrorResponse } from '../utils/responseHelper';

const firestoreService = FirestoreService;

export class StatsController {
  // Helper function to calculate date range from period
  private calculateDateRange(period: string): { startDate: Date; endDate: Date } {
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
    
    return { startDate, endDate };
  }

  // Helper function to get date string
  private getDateStr(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  // Helper function to normalize role
  private normalizeRole(role: string): UserRole {
    if (!role) return UserRole.WORKER;
    
    const roleLower = role.toLowerCase().trim();
    const roleMap: Record<string, UserRole> = {
      'super_admin': UserRole.ADMIN,
      'farm_manager': UserRole.MANAGER,
      'farm_worker': UserRole.WORKER,
      'admin': UserRole.ADMIN,
      'manager': UserRole.MANAGER,
      'worker': UserRole.WORKER,
    };
    return roleMap[roleLower] || role as UserRole;
  }

  // Helper function to get user and farm
  private async getUserAndFarm(req: Request): Promise<{ user: any; farmId: string }> {
    const userId = (req as any).user?.uid;
    const { farmId } = req.query;
    
    if (!userId) {
      throw new Error('User not authenticated');
    }

    const currentUser = await firestoreService.getUserById(userId);
    if (!currentUser) {
      throw new Error('User not found');
    }

    // Normalize the role for consistent comparison
    const normalizedRole = this.normalizeRole(currentUser.role || '');
    const userWithNormalizedRole = { ...currentUser, role: normalizedRole };

    const targetFarmId = (normalizedRole === UserRole.ADMIN && farmId) 
      ? farmId as string 
      : (currentUser.farmId || '');

    return { user: userWithNormalizedRole, farmId: targetFarmId };
  }

  // 1. GET /api/stats/dashboard - Get Dashboard Statistics
  async getDashboardStats(req: Request, res: Response): Promise<void> {
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

      // Determine which farm to get stats for
      const targetFarmId = currentUser.role === UserRole.ADMIN && farmId 
        ? farmId as string 
        : currentUser.farmId;

      // If user doesn't have a farmId, return default stats
      if (!targetFarmId || targetFarmId.trim() === '') {
        res.status(200).json(createSuccessResponse('Dashboard statistics retrieved successfully', {
          totalBirds: 0,
          todayEggs: 0,
          revenue: 0,
          performanceScore: '0%',
          feedStock: 0,
          healthAlerts: 0
        }));
        return;
      }

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

      const dateRange: DateRange = { startDate, endDate };

      // Get various statistics with error handling
      let eggStats: any = { totalCollections: 0, totalEggs: 0 };
      let birdStats: any = { totalBirds: 0, healthyBirds: 0, sickQuarantineBirds: 0 };
      let feedStats: any = { totalStock: 0 };
      let medicineStats: any = { totalItems: 0 };

      try {
        [eggStats, birdStats, feedStats, medicineStats] = await Promise.all([
          firestoreService.getEggCollectionStats(targetFarmId, dateRange, 'daily').catch(() => ({ totalCollections: 0, totalEggs: 0 })),
          firestoreService.getBirdStatistics(targetFarmId).catch(() => ({ totalBirds: 0, healthyBirds: 0, sickQuarantineBirds: 0 })),
          firestoreService.getFeedInventoryStats(targetFarmId).catch(() => ({ totalStock: 0 })),
          firestoreService.getMedicineInventoryStats(targetFarmId).catch(() => ({ totalItems: 0 }))
        ]);
      } catch (error: any) {
        console.error('Error getting dashboard stats:', error);
        // Continue with default values
      }

      // Get today's date
      const today = new Date();
      const todayStr = this.getDateStr(today);

      // Get today's egg collections
      const todayCollections = await firestoreService.getEggCollections({
        farmId: targetFarmId,
        startDate: todayStr,
        endDate: todayStr,
        limit: 10000
      });
      const todayEggs = (todayCollections.data || []).reduce((sum: number, c: any) => sum + (c.quantity || 0), 0);

      // Calculate revenue (assuming ₵2.5 per egg)
      const avgEggPrice = 2.5;
      const revenue = todayEggs * avgEggPrice;

      // Calculate performance score
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthStartStr = this.getDateStr(monthStart);
      const monthCollections = await firestoreService.getEggCollections({
        farmId: targetFarmId,
        startDate: monthStartStr,
        endDate: todayStr,
        limit: 10000
      });
      const monthlyEggs = (monthCollections.data || []).reduce((sum: number, c: any) => sum + (c.quantity || 0), 0);
      const expectedEggs = birdStats.totalBirds * 0.8 * 30; // 80% production rate
      const performanceScore = expectedEggs > 0 ? Math.min(Math.round((monthlyEggs / expectedEggs) * 100), 100) : 0;

      // Get feed stock (optional)
      const feedStock = feedStats.totalStock || 0;

      // Get health alerts (optional - count sick birds)
      const healthAlerts = birdStats.sickQuarantineBirds || 0;

      const data = {
        totalBirds: birdStats.totalBirds || 0,
        todayEggs,
        revenue: Math.round(revenue * 100) / 100,
        performanceScore: `${performanceScore}%`,
        feedStock,
        healthAlerts
      };

      res.status(200).json(createSuccessResponse('Dashboard statistics retrieved successfully', data));
    } catch (error: any) {
      console.error('Get dashboard stats error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to get dashboard statistics'));
    }
  }

  // 9. GET /api/stats/eggs/production - Get Egg Production Statistics
  async getEggStats(req: Request, res: Response): Promise<void> {
    try {
      const { farmId } = await this.getUserAndFarm(req);
      const { period = '30d' } = req.query;

      const { startDate, endDate } = this.calculateDateRange(period as string);
      const startDateStr = this.getDateStr(startDate);
      const endDateStr = this.getDateStr(endDate);

      const collectionsResponse = await firestoreService.getEggCollections({
        farmId,
        startDate: startDateStr,
        endDate: endDateStr,
        limit: 10000
      });
      const collections = collectionsResponse.data || [];

      const totalProduction = collections.reduce((sum: number, c: any) => sum + (c.quantity || 0), 0);
      const daysInPeriod = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) || 1;
      const averageDaily = totalProduction / daysInPeriod;

      // Find peak day
      const dailyTotals: Record<string, number> = {};
      collections.forEach((c: any) => {
        const date = c.date || c.createdAt?.toDate?.()?.toISOString().split('T')[0] || '';
        if (date) {
          dailyTotals[date] = (dailyTotals[date] || 0) + (c.quantity || 0);
        }
      });

      const peakDayEntry = Object.entries(dailyTotals).reduce((max, [date, quantity]) => 
        quantity > max.quantity ? { date, quantity } : max,
        { date: '', quantity: 0 }
      );

      // Calculate grade distribution
      const gradeDistribution = collections.reduce((acc: Record<string, number>, c: any) => {
        const grade = c.grade || c.quality || 'A';
        const quantity = c.quantity || c.collected || 0;
        acc[grade] = (acc[grade] || 0) + quantity;
        return acc;
      }, {} as Record<string, number>);

      const data = {
        totalProduction,
        averageDaily: Math.round(averageDaily * 100) / 100,
        peakDay: peakDayEntry.quantity > 0 ? {
          date: peakDayEntry.date,
          quantity: peakDayEntry.quantity
        } : null,
        gradeDistribution: {
          AA: gradeDistribution.AA || 0,
          A: gradeDistribution.A || 0,
          B: gradeDistribution.B || 0,
          C: gradeDistribution.C || 0
        }
      };

      res.status(200).json(createSuccessResponse('Egg production statistics retrieved successfully', data));
    } catch (error: any) {
      console.error('Get egg stats error:', error);
      if (error.message === 'User not authenticated') {
        res.status(401).json(createErrorResponse(error.message));
      } else if (error.message === 'User not found') {
        res.status(404).json(createErrorResponse(error.message));
      } else if (error.message === 'User does not have an associated farm') {
        res.status(200).json(createSuccessResponse('Egg production statistics retrieved successfully', {
          totalProduction: 0,
          averageDaily: 0,
          peakDay: { date: '', quantity: 0 },
          gradeDistribution: { AA: 0, A: 0, B: 0, C: 0 }
        }));
      } else {
        res.status(500).json(createErrorResponse(error.message || 'Failed to get egg production statistics'));
      }
    }
  }

  // 10. GET /api/stats/eggs/trends - Get Production Trends
  async getProductionTrends(req: Request, res: Response): Promise<void> {
    try {
      const { farmId } = await this.getUserAndFarm(req);
      const { period = '30d' } = req.query;

      const { startDate, endDate } = this.calculateDateRange(period as string);
      const startDateStr = this.getDateStr(startDate);
      const endDateStr = this.getDateStr(endDate);

      const collectionsResponse = await firestoreService.getEggCollections({
        farmId,
        startDate: startDateStr,
        endDate: endDateStr,
        limit: 10000
      });
      const collections = collectionsResponse.data || [];

      // Build data points
      const dailyData: Record<string, { quantity: number; gradeAA: number; gradeA: number; gradeB: number }> = {};
      collections.forEach((c: any) => {
        const date = c.date || c.createdAt?.toDate?.()?.toISOString().split('T')[0] || '';
        if (!date) return;

        if (!dailyData[date]) {
          dailyData[date] = { quantity: 0, gradeAA: 0, gradeA: 0, gradeB: 0 };
        }

        const quantity = c.quantity || c.collected || 0;
        const grade = c.grade || c.quality || 'A';
        dailyData[date].quantity += quantity;
        if (grade === 'AA') dailyData[date].gradeAA += quantity;
        else if (grade === 'A') dailyData[date].gradeA += quantity;
        else if (grade === 'B') dailyData[date].gradeB += quantity;
      });

      const dataPoints = Object.entries(dailyData)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, data]) => ({
          date,
          quantity: data.quantity,
          gradeAA: data.gradeAA,
          gradeA: data.gradeA,
          gradeB: data.gradeB
        }));

      // Calculate trend
      const sortedDates = Object.keys(dailyData).sort();
      const midpoint = Math.floor(sortedDates.length / 2);
      const firstHalf = sortedDates.slice(0, midpoint).reduce((sum, date) => sum + (dailyData[date].quantity || 0), 0) / (midpoint || 1);
      const secondHalf = sortedDates.slice(midpoint).reduce((sum, date) => sum + (dailyData[date].quantity || 0), 0) / (sortedDates.length - midpoint || 1);
      const trend = secondHalf > firstHalf ? 'increasing' : secondHalf < firstHalf ? 'decreasing' : 'stable';

      const data = {
        period: period as string,
        dataPoints,
        trend
      };

      res.status(200).json(createSuccessResponse('Production trends retrieved successfully', data));
    } catch (error: any) {
      console.error('Get production trends error:', error);
      if (error.message === 'User not authenticated' || error.message === 'User not found') {
        res.status(error.message === 'User not authenticated' ? 401 : 404).json(createErrorResponse(error.message));
      } else {
        res.status(500).json(createErrorResponse(error.message || 'Failed to get production trends'));
      }
    }
  }

  // 11. GET /api/stats/eggs/daily-summary - Get Daily Production Summary
  async getDailyProductionSummary(req: Request, res: Response): Promise<void> {
    try {
      const { farmId } = await this.getUserAndFarm(req);
      const { date } = req.query;

      const targetDate = date ? new Date(date as string) : new Date();
      const dateStr = this.getDateStr(targetDate);

      const collectionsResponse = await firestoreService.getEggCollections({
        farmId,
        startDate: dateStr,
        endDate: dateStr,
        limit: 10000
      });
      const collections = collectionsResponse.data || [];

      const totalEggs = collections.reduce((sum: number, c: any) => sum + (c.quantity || 0), 0);

      // Group by grade
      const byGrade = collections.reduce((acc: Record<string, number>, c: any) => {
        const grade = c.grade || c.quality || 'A';
        const quantity = c.quantity || c.collected || 0;
        acc[grade] = (acc[grade] || 0) + quantity;
        return acc;
      }, {} as Record<string, number>);

      // Group by shift
      const byShift = collections.reduce((acc: Record<string, number>, c: any) => {
        const shift = c.shift || 'Morning';
        const quantity = c.quantity || c.collected || 0;
        acc[shift] = (acc[shift] || 0) + quantity;
        return acc;
      }, {} as Record<string, number>);

      const data = {
        date: dateStr,
        totalEggs,
        byGrade: {
          AA: byGrade.AA || 0,
          A: byGrade.A || 0,
          B: byGrade.B || 0,
          C: byGrade.C || 0
        },
        byShift: {
          Morning: byShift.Morning || 0,
          Afternoon: byShift.Afternoon || 0,
          Evening: byShift.Evening || 0
        }
      };

      res.status(200).json(createSuccessResponse('Daily production summary retrieved successfully', data));
    } catch (error: any) {
      console.error('Get daily production summary error:', error);
      if (error.message === 'User not authenticated' || error.message === 'User not found') {
        res.status(error.message === 'User not authenticated' ? 401 : 404).json(createErrorResponse(error.message));
      } else {
        res.status(500).json(createErrorResponse(error.message || 'Failed to get daily production summary'));
      }
    }
  }

  // 12. GET /api/stats/eggs/monthly-summary - Get Monthly Production Summary
  async getMonthlyProductionSummary(req: Request, res: Response): Promise<void> {
    try {
      const { farmId } = await this.getUserAndFarm(req);
      const { month } = req.query;

      const today = new Date();
      let monthStart: Date;
      let monthEnd: Date;

      if (month) {
        const [year, monthNum] = (month as string).split('-').map(Number);
        monthStart = new Date(year, monthNum - 1, 1);
        monthEnd = new Date(year, monthNum, 0);
      } else {
        monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        monthEnd = today;
      }

      const monthStartStr = this.getDateStr(monthStart);
      const monthEndStr = this.getDateStr(monthEnd);
      const monthKey = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`;

      const collectionsResponse = await firestoreService.getEggCollections({
        farmId,
        startDate: monthStartStr,
        endDate: monthEndStr,
        limit: 10000
      });
      const collections = collectionsResponse.data || [];

      const totalEggs = collections.reduce((sum: number, c: any) => sum + (c.quantity || 0), 0);
      const daysInMonth = Math.ceil((monthEnd.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24)) || 1;
      const averageDaily = totalEggs / daysInMonth;

      // Find peak day
      const dailyTotals: Record<string, number> = {};
      collections.forEach((c: any) => {
        const date = c.date || c.createdAt?.toDate?.()?.toISOString().split('T')[0] || '';
        if (date) {
          dailyTotals[date] = (dailyTotals[date] || 0) + (c.quantity || 0);
        }
      });

      const peakDayEntry = Object.entries(dailyTotals).reduce((max, [date, quantity]) => 
        quantity > max.quantity ? { date, quantity } : max,
        { date: '', quantity: 0 }
      );

      // Group by grade
      const byGrade = collections.reduce((acc: Record<string, number>, c: any) => {
        const grade = c.grade || c.quality || 'A';
        const quantity = c.quantity || c.collected || 0;
        acc[grade] = (acc[grade] || 0) + quantity;
        return acc;
      }, {} as Record<string, number>);

      const data = {
        month: monthKey,
        totalEggs,
        averageDaily: Math.round(averageDaily * 100) / 100,
        peakDay: peakDayEntry.quantity > 0 ? {
          date: peakDayEntry.date,
          quantity: peakDayEntry.quantity
        } : null,
        byGrade: {
          AA: byGrade.AA || 0,
          A: byGrade.A || 0,
          B: byGrade.B || 0,
          C: byGrade.C || 0
        }
      };

      res.status(200).json(createSuccessResponse('Monthly production summary retrieved successfully', data));
    } catch (error: any) {
      console.error('Get monthly production summary error:', error);
      if (error.message === 'User not authenticated' || error.message === 'User not found') {
        res.status(error.message === 'User not authenticated' ? 401 : 404).json(createErrorResponse(error.message));
      } else {
        res.status(500).json(createErrorResponse(error.message || 'Failed to get monthly production summary'));
      }
    }
  }

  // 13. GET /api/stats/financial/summary - Get Financial Summary
  async getFinancialSummary(req: Request, res: Response): Promise<void> {
    try {
      const { user, farmId } = await this.getUserAndFarm(req);
      const { period = '30d' } = req.query;

      // Only farm managers and super admins can view financial data
      if (user.role !== UserRole.MANAGER && user.role !== UserRole.ADMIN) {
        res.status(403).json(createErrorResponse('Insufficient permissions to view financial data'));
        return;
      }

      // If no farmId, return default financial summary
      if (!farmId || farmId.trim() === '') {
        res.status(200).json(createSuccessResponse('Financial summary retrieved successfully', {
          totalRevenue: 0,
          totalExpenses: 0,
          netProfit: 0,
          profitMargin: 0
        }));
        return;
      }

      const { startDate, endDate } = this.calculateDateRange(period as string);
      const startDateStr = this.getDateStr(startDate);
      const endDateStr = this.getDateStr(endDate);

      // Get collections with error handling
      let collections: any[] = [];
      try {
        const collectionsResponse = await firestoreService.getEggCollections({
          farmId,
          startDate: startDateStr,
          endDate: endDateStr,
          limit: 10000
        }).catch(() => ({ data: [] }));
        collections = collectionsResponse.data || [];
      } catch (error: any) {
        console.error('Error getting egg collections:', error);
        collections = [];
      }
      const totalEggs = collections.reduce((sum: number, c: any) => sum + (c.quantity || 0), 0);

      // Calculate revenue
      const avgEggPrice = 2.5;
      const totalRevenue = totalEggs * avgEggPrice;

      // Calculate expenses
      let feedUsage: any[] = [];
      try {
        feedUsage = await firestoreService.getFeedUsageHistory({
          farmId,
          dateFrom: startDate,
          dateTo: endDate
        }).catch(() => []);
      } catch (error: any) {
        console.error('Error getting feed usage history:', error);
        feedUsage = [];
      }

      let feedInventory: any[] = [];
      try {
        const feedInventoryResponse = await firestoreService.getFeedInventory({ page: 1, limit: 10000 }).catch(() => ({ data: [] }));
        feedInventory = (feedInventoryResponse?.data || []).filter((item: any) => item.farmId === farmId);
      } catch (error: any) {
        console.error('Error getting feed inventory:', error);
        feedInventory = [];
      }

      const totalExpenses = feedUsage.reduce((sum: number, record: any) => {
        const feedItem = feedInventory.find((f: any) => f.id === record.feedId);
        const costPerUnit = feedItem?.costPerUnit || feedItem?.cost || 0;
        const quantity = record.quantityUsed || record.quantity || 0;
        return sum + (quantity * costPerUnit);
      }, 0);

      const netProfit = totalRevenue - totalExpenses;
      const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

      const data = {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        netProfit: Math.round(netProfit * 100) / 100,
        profitMargin: Math.round(profitMargin * 100) / 100
      };

      res.status(200).json(createSuccessResponse('Financial summary retrieved successfully', data));
    } catch (error: any) {
      console.error('Get financial summary error:', error);
      if (error.message === 'User not authenticated' || error.message === 'User not found') {
        res.status(error.message === 'User not authenticated' ? 401 : 404).json(createErrorResponse(error.message));
      } else {
        res.status(500).json(createErrorResponse(error.message || 'Failed to get financial summary'));
      }
    }
  }

  // 17. GET /api/stats/performance/overview - Get Performance Overview
  async getPerformanceMetrics(req: Request, res: Response): Promise<void> {
    try {
      const { farmId } = await this.getUserAndFarm(req);
      const { period = '30d' } = req.query;

      // If no farmId, return default performance metrics
      if (!farmId || farmId.trim() === '') {
        res.status(200).json(createSuccessResponse('Performance overview retrieved successfully', {
          overallScore: 0,
          productionEfficiency: 0,
          feedEfficiency: 0,
          healthScore: 0,
          financialHealth: 0
        }));
        return;
      }

      const { startDate, endDate } = this.calculateDateRange(period as string);
      const startDateStr = this.getDateStr(startDate);
      const endDateStr = this.getDateStr(endDate);

      // Get data with error handling
      let collectionsResponse: any = { data: [] };
      let birdStats: any = { totalBirds: 0, healthyBirds: 0 };
      let feedUsage: any[] = [];

      try {
        [collectionsResponse, birdStats, feedUsage] = await Promise.all([
          firestoreService.getEggCollections({
            farmId,
            startDate: startDateStr,
            endDate: endDateStr,
            limit: 10000
          }).catch(() => ({ data: [] })),
          firestoreService.getBirdStatistics(farmId).catch(() => ({ totalBirds: 0, healthyBirds: 0 })),
          firestoreService.getFeedUsageHistory({
            farmId,
            dateFrom: startDate,
            dateTo: endDate
          }).catch(() => [])
        ]);
      } catch (error: any) {
        console.error('Error getting performance metrics data:', error);
        // Continue with default values
      }

      const collections = collectionsResponse.data || [];
      const totalEggs = collections.reduce((sum: number, c: any) => sum + (c.quantity || 0), 0);
      const totalBirds = birdStats.totalBirds || 1;
      const totalFeed = feedUsage.reduce((sum: number, r: any) => sum + (r.quantityUsed || r.quantity || 0), 0);

      // Calculate production efficiency
      const productionEfficiency = totalBirds > 0 ? (totalEggs / totalBirds) * 100 : 0;

      // Calculate feed efficiency
      const feedEfficiency = totalFeed > 0 ? (totalEggs / totalFeed) * 100 : 0;

      // Calculate health score
      const healthyBirds = birdStats.healthyBirds || 0;
      const healthScore = totalBirds > 0 ? (healthyBirds / totalBirds) * 100 : 100;

      // Calculate financial health
      const avgEggPrice = 2.5;
      const revenue = totalEggs * avgEggPrice;
      let feedInventory: any[] = [];
      try {
        const feedInventoryResponse = await firestoreService.getFeedInventory({ page: 1, limit: 10000 }).catch(() => ({ data: [] }));
        feedInventory = (feedInventoryResponse?.data || []).filter((item: any) => item.farmId === farmId);
      } catch (error: any) {
        console.error('Error getting feed inventory:', error);
        feedInventory = [];
      }
      const expenses = feedUsage.reduce((sum: number, record: any) => {
        const feedItem = feedInventory.find((f: any) => f.id === record.feedId);
        const costPerUnit = feedItem?.costPerUnit || feedItem?.cost || 0;
        const quantity = record.quantityUsed || record.quantity || 0;
        return sum + (quantity * costPerUnit);
      }, 0);
      const profitMargin = revenue > 0 ? ((revenue - expenses) / revenue) * 100 : 0;
      const financialHealth = Math.max(0, Math.min(100, profitMargin + 50)); // Normalize to 0-100

      // Calculate overall score (weighted average)
      const overallScore = (
        productionEfficiency * 0.3 +
        feedEfficiency * 0.2 +
        healthScore * 0.3 +
        financialHealth * 0.2
      );

      const data = {
        overallScore: Math.round(overallScore),
        productionEfficiency: Math.round(productionEfficiency * 100) / 100,
        feedEfficiency: Math.round(feedEfficiency * 100) / 100,
        healthScore: Math.round(healthScore),
        financialHealth: Math.round(financialHealth)
      };

      res.status(200).json(createSuccessResponse('Performance overview retrieved successfully', data));
    } catch (error: any) {
      console.error('Get performance overview error:', error);
      if (error.message === 'User not authenticated' || error.message === 'User not found') {
        res.status(error.message === 'User not authenticated' ? 401 : 404).json(createErrorResponse(error.message));
      } else {
        res.status(500).json(createErrorResponse(error.message || 'Failed to get performance overview'));
      }
    }
  }

  // 20. GET /api/stats/comparative/period - Get Period Comparison
  async getComparativeAnalysis(req: Request, res: Response): Promise<void> {
    try {
      const { user, farmId } = await this.getUserAndFarm(req);
      const { period = '30d' } = req.query;

      const { startDate, endDate } = this.calculateDateRange(period as string);
      const startDateStr = this.getDateStr(startDate);
      const endDateStr = this.getDateStr(endDate);

      // Get current period data
      const currentCollections = await firestoreService.getEggCollections({
        farmId,
        startDate: startDateStr,
        endDate: endDateStr,
        limit: 10000
      });
      const currentEggs = (currentCollections.data || []).reduce((sum: number, c: any) => sum + (c.quantity || 0), 0);

      // Calculate previous period
      const periodDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const prevStartDate = new Date(startDate);
      prevStartDate.setDate(prevStartDate.getDate() - periodDays);
      const prevEndDate = new Date(startDate);
      const prevStartDateStr = this.getDateStr(prevStartDate);
      const prevEndDateStr = this.getDateStr(prevEndDate);

      // Get previous period data
      const prevCollections = await firestoreService.getEggCollections({
        farmId,
        startDate: prevStartDateStr,
        endDate: prevEndDateStr,
        limit: 10000
      });
      const prevEggs = (prevCollections.data || []).reduce((sum: number, c: any) => sum + (c.quantity || 0), 0);

      // Calculate revenue
      const avgEggPrice = 2.5;
      const currentRevenue = currentEggs * avgEggPrice;
      const prevRevenue = prevEggs * avgEggPrice;

      // Calculate expenses
      const currentFeedUsage = await firestoreService.getFeedUsageHistory({
        farmId,
        dateFrom: startDate,
        dateTo: endDate
      });
      const feedInventoryResponse = await firestoreService.getFeedInventory({ page: 1, limit: 10000 });
      const feedInventory = (feedInventoryResponse?.data || []).filter((item: any) => item.farmId === farmId);
      const currentExpenses = currentFeedUsage.reduce((sum: number, record: any) => {
        const feedItem = feedInventory.find((f: any) => f.id === record.feedId);
        const costPerUnit = feedItem?.costPerUnit || feedItem?.cost || 0;
        const quantity = record.quantityUsed || record.quantity || 0;
        return sum + (quantity * costPerUnit);
      }, 0);

      const prevFeedUsage = await firestoreService.getFeedUsageHistory({
        farmId,
        dateFrom: prevStartDate,
        dateTo: prevEndDate
      });
      const prevExpenses = prevFeedUsage.reduce((sum: number, record: any) => {
        const feedItem = feedInventory.find((f: any) => f.id === record.feedId);
        const costPerUnit = feedItem?.costPerUnit || feedItem?.cost || 0;
        const quantity = record.quantityUsed || record.quantity || 0;
        return sum + (quantity * costPerUnit);
      }, 0);

      // Calculate changes
      const eggsChange = prevEggs > 0 ? ((currentEggs - prevEggs) / prevEggs) * 100 : 0;
      const revenueChange = prevRevenue > 0 ? ((currentRevenue - prevRevenue) / prevRevenue) * 100 : 0;
      const expenseChange = prevExpenses > 0 ? ((currentExpenses - prevExpenses) / prevExpenses) * 100 : 0;

      const data = {
        currentPeriod: {
          start: startDateStr,
          end: endDateStr,
          metrics: {
            totalEggs: currentEggs,
            revenue: Math.round(currentRevenue * 100) / 100,
            expenses: Math.round(currentExpenses * 100) / 100
          }
        },
        previousPeriod: {
          start: prevStartDateStr,
          end: prevEndDateStr,
          metrics: {
            totalEggs: prevEggs,
            revenue: Math.round(prevRevenue * 100) / 100,
            expenses: Math.round(prevExpenses * 100) / 100
          }
        },
        changes: {
          eggsChange: Math.round(eggsChange * 100) / 100,
          revenueChange: Math.round(revenueChange * 100) / 100,
          expenseChange: Math.round(expenseChange * 100) / 100
        }
      };

      res.status(200).json(createSuccessResponse('Period comparison retrieved successfully', data));
    } catch (error: any) {
      console.error('Get period comparison error:', error);
      if (error.message === 'User not authenticated' || error.message === 'User not found') {
        res.status(error.message === 'User not authenticated' ? 401 : 404).json(createErrorResponse(error.message));
      } else {
        res.status(500).json(createErrorResponse(error.message || 'Failed to get period comparison'));
      }
    }
  }

  // Export statistics report
  async exportStatsReport(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { farmId, reportType = 'comprehensive', format = 'json', startDate, endDate } = req.query;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      if (!currentUser) {
        res.status(404).json(createErrorResponse('User not found'));
        return;
      }

      // Only farm managers and super admins can export reports
      if (currentUser.role !== UserRole.MANAGER && currentUser.role !== UserRole.ADMIN) {
        res.status(403).json(createErrorResponse('Insufficient permissions to export reports'));
        return;
      }

      // Determine which farm to get stats for
      const targetFarmId = currentUser.role === UserRole.ADMIN && farmId 
        ? farmId as string 
        : currentUser.farmId;

      const dateRange: DateRange = {
        startDate: startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endDate: endDate ? new Date(endDate as string) : new Date()
      };

      const report = await firestoreService.generateStatsReport(
        targetFarmId,
        dateRange.startDate,
        dateRange.endDate
      );

      // Set appropriate headers for download
      const filename = `farm-report-${targetFarmId}-${Date.now()}.${format}`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        // Convert to CSV format (simplified)
        const csvData = JSON.stringify(report); // In real implementation, convert to proper CSV
        res.send(csvData);
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.json({
          success: true,
          message: 'Report generated successfully',
          data: report,
          metadata: {
            farmId: targetFarmId,
            reportType,
            dateRange,
            generatedAt: new Date(),
            generatedBy: userId
          }
        });
      }
    } catch (error: any) {
      console.error('Export stats report error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to export statistics report'));
     }
   }

  // 24. POST /api/stats/export/report - Export Statistics Report
  async exportReport(req: Request, res: Response): Promise<void> {
    try {
      const { user, farmId } = await this.getUserAndFarm(req);
      const { templateId, dateRange, format = 'pdf', filters } = req.body;

      // Only managers and admins can export reports
      if (user.role !== UserRole.MANAGER && user.role !== UserRole.ADMIN) {
        res.status(403).json(createErrorResponse('Insufficient permissions to export reports'));
        return;
      }

      if (!format || !['pdf', 'excel', 'csv'].includes(format)) {
        res.status(400).json(createErrorResponse('Invalid format. Must be pdf, excel, or csv'));
        return;
      }

      // Determine date range
      let startDate: Date;
      let endDate: Date;

      if (dateRange?.start && dateRange?.end) {
        startDate = new Date(dateRange.start);
        endDate = new Date(dateRange.end);
      } else {
        const range = this.calculateDateRange('30d');
        startDate = range.startDate;
        endDate = range.endDate;
      }

      // TODO: Implement actual report generation and export
      // For now, return a placeholder response indicating the report is being generated
      const reportId = `report-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // In a real implementation, this would:
      // 1. Generate the report based on templateId and filters
      // 2. Convert to the requested format (PDF/Excel/CSV)
      // 3. Store the report or return it directly
      // 4. For async generation, return reportId and status

      res.status(200).json(createSuccessResponse('Report generation started', {
        reportId,
        status: 'generating',
        estimatedCompletion: new Date(Date.now() + 60000).toISOString() // 1 minute estimate
      }));
    } catch (error: any) {
      console.error('Export report error:', error);
      if (error.message === 'User not authenticated' || error.message === 'User not found') {
        res.status(error.message === 'User not authenticated' ? 401 : 404).json(createErrorResponse(error.message));
      } else {
        res.status(500).json(createErrorResponse(error.message || 'Failed to export report'));
      }
    }
  }

  // 23. GET /api/stats/export/templates - Get Report Templates
  async getReportTemplates(req: Request, res: Response): Promise<void> {
    try {
      const { user } = await this.getUserAndFarm(req);

      // Only managers and admins can access templates
      if (user.role !== UserRole.MANAGER && user.role !== UserRole.ADMIN) {
        res.status(403).json(createErrorResponse('Insufficient permissions to access report templates'));
        return;
      }

      // Return predefined templates
      const templates = [
        {
          id: 'production-daily',
          name: 'Daily Production Report',
          description: 'Daily egg production summary',
          type: 'production',
          defaultFilters: {
            period: '7d',
            pens: [],
            grades: []
          }
        },
        {
          id: 'production-weekly',
          name: 'Weekly Production Report',
          description: 'Weekly egg production summary',
          type: 'production',
          defaultFilters: {
            period: '30d',
            pens: [],
            grades: []
          }
        },
        {
          id: 'financial-monthly',
          name: 'Monthly Financial Report',
          description: 'Monthly financial summary',
          type: 'financial',
          defaultFilters: {
            period: '30d',
            pens: [],
            grades: []
          }
        },
        {
          id: 'health-overview',
          name: 'Health Overview Report',
          description: 'Health and treatment overview',
          type: 'health',
          defaultFilters: {
            period: '30d',
            pens: [],
            grades: []
          }
        },
        {
          id: 'comprehensive',
          name: 'Comprehensive Farm Report',
          description: 'Complete farm performance report',
          type: 'overview',
          defaultFilters: {
            period: '90d',
            pens: [],
            grades: []
          }
        }
      ];

      res.status(200).json(createSuccessResponse('Report templates retrieved successfully', templates));
    } catch (error: any) {
      console.error('Get report templates error:', error);
      if (error.message === 'User not authenticated' || error.message === 'User not found') {
        res.status(error.message === 'User not authenticated' ? 401 : 404).json(createErrorResponse(error.message));
      } else {
        res.status(500).json(createErrorResponse(error.message || 'Failed to get report templates'));
      }
    }
  }

  // 22. GET /api/stats/comparative/benchmarks - Get Benchmark Comparison
  async getBenchmarkComparison(req: Request, res: Response): Promise<void> {
    try {
      const { farmId } = await this.getUserAndFarm(req);
      const { period = '30d' } = req.query;

      const { startDate, endDate } = this.calculateDateRange(period as string);
      const startDateStr = this.getDateStr(startDate);
      const endDateStr = this.getDateStr(endDate);

      // Get farm data
      const [collectionsResponse, birdStats, feedUsage] = await Promise.all([
        firestoreService.getEggCollections({
          farmId,
          startDate: startDateStr,
          endDate: endDateStr,
          limit: 10000
        }),
        firestoreService.getBirdStatistics(farmId),
        firestoreService.getFeedUsageHistory({
          farmId,
          dateFrom: startDate,
          dateTo: endDate
        })
      ]);

      const collections = collectionsResponse.data || [];
      const totalEggs = collections.reduce((sum: number, c: any) => sum + (c.quantity || 0), 0);
      const totalBirds = birdStats.totalBirds || 1;
      const totalFeed = feedUsage.reduce((sum: number, r: any) => sum + (r.quantityUsed || r.quantity || 0), 0);

      // Calculate farm metrics
      const eggsPerBird = totalBirds > 0 ? totalEggs / totalBirds : 0;
      const feedEfficiency = totalEggs > 0 ? totalFeed / totalEggs : 0;
      const mortalityRate = 0; // TODO: Calculate from historical data

      // Industry benchmarks (placeholder - should be configurable)
      const industryBenchmarks = {
        eggsPerBird: 280, // Average eggs per bird per year
        feedEfficiency: 2.2, // kg feed per egg
        mortalityRate: 5 // 5% mortality rate
      };

      // Compare with benchmarks
      const eggsPerBirdComparison = eggsPerBird > industryBenchmarks.eggsPerBird ? 'above' 
        : eggsPerBird < industryBenchmarks.eggsPerBird ? 'below' 
        : 'at';
      const feedEfficiencyComparison = feedEfficiency < industryBenchmarks.feedEfficiency ? 'above' 
        : feedEfficiency > industryBenchmarks.feedEfficiency ? 'below' 
        : 'at';
      const mortalityRateComparison = mortalityRate < industryBenchmarks.mortalityRate ? 'above' 
        : mortalityRate > industryBenchmarks.mortalityRate ? 'below' 
        : 'at';

      const data = {
        farmMetrics: {
          eggsPerBird: Math.round(eggsPerBird * 100) / 100,
          feedEfficiency: Math.round(feedEfficiency * 100) / 100,
          mortalityRate: Math.round(mortalityRate * 100) / 100
        },
        industryBenchmarks,
        comparison: {
          eggsPerBird: eggsPerBirdComparison,
          feedEfficiency: feedEfficiencyComparison,
          mortalityRate: mortalityRateComparison
        }
      };

      res.status(200).json(createSuccessResponse('Benchmark comparison retrieved successfully', data));
    } catch (error: any) {
      console.error('Get benchmark comparison error:', error);
      if (error.message === 'User not authenticated' || error.message === 'User not found') {
        res.status(error.message === 'User not authenticated' ? 401 : 404).json(createErrorResponse(error.message));
      } else {
        res.status(500).json(createErrorResponse(error.message || 'Failed to get benchmark comparison'));
      }
    }
  }

  // 18. GET /api/stats/performance/efficiency - Get Efficiency Metrics
  async getEfficiencyMetrics(req: Request, res: Response): Promise<void> {
    try {
      const { farmId } = await this.getUserAndFarm(req);
      const { period = '30d' } = req.query;

      const { startDate, endDate } = this.calculateDateRange(period as string);
      const startDateStr = this.getDateStr(startDate);
      const endDateStr = this.getDateStr(endDate);

      // Get data
      const [collectionsResponse, birdStats, feedUsage] = await Promise.all([
        firestoreService.getEggCollections({
          farmId,
          startDate: startDateStr,
          endDate: endDateStr,
          limit: 10000
        }),
        firestoreService.getBirdStatistics(farmId),
        firestoreService.getFeedUsageHistory({
          farmId,
          dateFrom: startDate,
          dateTo: endDate
        })
      ]);

      const collections = collectionsResponse.data || [];
      const totalEggs = collections.reduce((sum: number, c: any) => sum + (c.quantity || 0), 0);
      const totalBirds = birdStats.totalBirds || 1;
      const totalFeed = feedUsage.reduce((sum: number, r: any) => sum + (r.quantityUsed || r.quantity || 0), 0);

      // Calculate feed efficiency (kg per egg)
      const feedEfficiency = totalEggs > 0 ? totalFeed / totalEggs : 0;

      // Calculate production efficiency (eggs per bird)
      const productionEfficiency = totalBirds > 0 ? totalEggs / totalBirds : 0;

      // Calculate labor efficiency (placeholder)
      const laborEfficiency = 0; // TODO: Implement labor efficiency tracking

      // Calculate resource utilization
      const daysInPeriod = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) || 1;
      const expectedEggs = totalBirds * 0.8 * daysInPeriod; // 80% production rate
      const resourceUtilization = expectedEggs > 0 ? (totalEggs / expectedEggs) * 100 : 0;

      const data = {
        feedEfficiency: Math.round(feedEfficiency * 100) / 100,
        productionEfficiency: Math.round(productionEfficiency * 100) / 100,
        laborEfficiency: Math.round(laborEfficiency * 100) / 100,
        resourceUtilization: Math.round(resourceUtilization * 100) / 100
      };

      res.status(200).json(createSuccessResponse('Efficiency metrics retrieved successfully', data));
    } catch (error: any) {
      console.error('Get efficiency metrics error:', error);
      if (error.message === 'User not authenticated' || error.message === 'User not found') {
        res.status(error.message === 'User not authenticated' ? 401 : 404).json(createErrorResponse(error.message));
      } else {
        res.status(500).json(createErrorResponse(error.message || 'Failed to get efficiency metrics'));
      }
    }
  }

  // 19. GET /api/stats/performance/productivity - Get Productivity Metrics
  async getProductivityMetrics(req: Request, res: Response): Promise<void> {
    try {
      const { farmId } = await this.getUserAndFarm(req);
      const { period = '30d' } = req.query;

      const { startDate, endDate } = this.calculateDateRange(period as string);
      const startDateStr = this.getDateStr(startDate);
      const endDateStr = this.getDateStr(endDate);

      // Get data
      const [collectionsResponse, birdStats] = await Promise.all([
        firestoreService.getEggCollections({
          farmId,
          startDate: startDateStr,
          endDate: endDateStr,
          limit: 10000
        }),
        firestoreService.getBirdStatistics(farmId)
      ]);

      const collections = collectionsResponse.data || [];
      const totalEggs = collections.reduce((sum: number, c: any) => sum + (c.quantity || 0), 0);
      const totalBirds = birdStats.totalBirds || 1;
      const daysInPeriod = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) || 1;

      // Calculate metrics
      const eggsPerBird = totalBirds > 0 ? totalEggs / totalBirds : 0;
      const eggsPerDay = daysInPeriod > 0 ? totalEggs / daysInPeriod : 0;

      // Calculate collection rate (collections vs expected collections)
      const expectedCollections = daysInPeriod * 3; // 3 shifts per day
      const actualCollections = collections.length;
      const collectionRate = expectedCollections > 0 ? (actualCollections / expectedCollections) * 100 : 0;

      // Calculate quality score (percentage of AA and A grade eggs)
      const gradeDistribution = collections.reduce((acc: Record<string, number>, c: any) => {
        const grade = c.grade || c.quality || 'A';
        const quantity = c.quantity || c.collected || 0;
        acc[grade] = (acc[grade] || 0) + quantity;
        return acc;
      }, {} as Record<string, number>);
      const highQualityEggs = (gradeDistribution.AA || 0) + (gradeDistribution.A || 0);
      const qualityScore = totalEggs > 0 ? (highQualityEggs / totalEggs) * 100 : 0;

      const data = {
        eggsPerBird: Math.round(eggsPerBird * 100) / 100,
        eggsPerDay: Math.round(eggsPerDay * 100) / 100,
        collectionRate: Math.round(collectionRate * 100) / 100,
        qualityScore: Math.round(qualityScore * 100) / 100
      };

      res.status(200).json(createSuccessResponse('Productivity metrics retrieved successfully', data));
    } catch (error: any) {
      console.error('Get productivity metrics error:', error);
      if (error.message === 'User not authenticated' || error.message === 'User not found') {
        res.status(error.message === 'User not authenticated' ? 401 : 404).json(createErrorResponse(error.message));
      } else {
        res.status(500).json(createErrorResponse(error.message || 'Failed to get productivity metrics'));
      }
    }
  }

  // 21. GET /api/stats/comparative/year-over-year - Get Year-over-Year Comparison
  async getYearOverYearComparison(req: Request, res: Response): Promise<void> {
    try {
      const { farmId } = await this.getUserAndFarm(req);

      const today = new Date();
      const currentYear = today.getFullYear();
      const previousYear = currentYear - 1;

      const currentYearStart = new Date(currentYear, 0, 1);
      const currentYearEnd = today;
      const prevYearStart = new Date(previousYear, 0, 1);
      const prevYearEnd = new Date(previousYear, 11, 31);

      const currentYearStartStr = this.getDateStr(currentYearStart);
      const currentYearEndStr = this.getDateStr(currentYearEnd);
      const prevYearStartStr = this.getDateStr(prevYearStart);
      const prevYearEndStr = this.getDateStr(prevYearEnd);

      // Get current year data
      const currentCollections = await firestoreService.getEggCollections({
        farmId,
        startDate: currentYearStartStr,
        endDate: currentYearEndStr,
        limit: 10000
      });
      const currentEggs = (currentCollections.data || []).reduce((sum: number, c: any) => sum + (c.quantity || 0), 0);

      // Get previous year data
      const prevCollections = await firestoreService.getEggCollections({
        farmId,
        startDate: prevYearStartStr,
        endDate: prevYearEndStr,
        limit: 10000
      });
      const prevEggs = (prevCollections.data || []).reduce((sum: number, c: any) => sum + (c.quantity || 0), 0);

      // Calculate revenue
      const avgEggPrice = 2.5;
      const currentRevenue = currentEggs * avgEggPrice;
      const prevRevenue = prevEggs * avgEggPrice;

      // Calculate changes
      const eggsChange = prevEggs > 0 ? ((currentEggs - prevEggs) / prevEggs) * 100 : 0;
      const revenueChange = prevRevenue > 0 ? ((currentRevenue - prevRevenue) / prevRevenue) * 100 : 0;

      const data = {
        currentYear,
        previousYear,
        metrics: {
          totalEggs: {
            current: currentEggs,
            previous: prevEggs,
            change: Math.round(eggsChange * 100) / 100
          },
          revenue: {
            current: Math.round(currentRevenue * 100) / 100,
            previous: Math.round(prevRevenue * 100) / 100,
            change: Math.round(revenueChange * 100) / 100
          }
        }
      };

      res.status(200).json(createSuccessResponse('Year-over-year comparison retrieved successfully', data));
    } catch (error: any) {
      console.error('Get year-over-year comparison error:', error);
      if (error.message === 'User not authenticated' || error.message === 'User not found') {
        res.status(error.message === 'User not authenticated' ? 401 : 404).json(createErrorResponse(error.message));
      } else {
        res.status(500).json(createErrorResponse(error.message || 'Failed to get year-over-year comparison'));
      }
    }
  }

  // 14. GET /api/stats/financial/revenue-trends - Get Revenue Trends
  async getRevenueTrends(req: Request, res: Response): Promise<void> {
    try {
      const { user, farmId } = await this.getUserAndFarm(req);
      const { period = '30d' } = req.query;

      if (user.role !== UserRole.MANAGER && user.role !== UserRole.ADMIN) {
        res.status(403).json(createErrorResponse('Insufficient permissions to view financial data'));
        return;
      }

      const { startDate, endDate } = this.calculateDateRange(period as string);
      const startDateStr = this.getDateStr(startDate);
      const endDateStr = this.getDateStr(endDate);

      const collectionsResponse = await firestoreService.getEggCollections({
        farmId,
        startDate: startDateStr,
        endDate: endDateStr,
        limit: 10000
      });
      const collections = collectionsResponse.data || [];

      const avgEggPrice = 2.5;
      const dailyRevenue: Record<string, number> = {};
      collections.forEach((c: any) => {
        const date = c.date || c.createdAt?.toDate?.()?.toISOString().split('T')[0] || '';
        if (date) {
          const quantity = c.quantity || c.collected || 0;
          dailyRevenue[date] = (dailyRevenue[date] || 0) + (quantity * avgEggPrice);
        }
      });

      const dataPoints = Object.entries(dailyRevenue)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, revenue]) => ({
          date,
          revenue: Math.round(revenue * 100) / 100,
          source: 'eggs' as const
        }));

      // Calculate trend
      const sortedDates = Object.keys(dailyRevenue).sort();
      const midpoint = Math.floor(sortedDates.length / 2);
      const firstHalf = sortedDates.slice(0, midpoint).reduce((sum, date) => sum + (dailyRevenue[date] || 0), 0) / (midpoint || 1);
      const secondHalf = sortedDates.slice(midpoint).reduce((sum, date) => sum + (dailyRevenue[date] || 0), 0) / (sortedDates.length - midpoint || 1);
      const trend = secondHalf > firstHalf ? 'increasing' : secondHalf < firstHalf ? 'decreasing' : 'stable';

      const data = {
        period: period as string,
        dataPoints,
        trend
      };

      res.status(200).json(createSuccessResponse('Revenue trends retrieved successfully', data));
    } catch (error: any) {
      console.error('Get revenue trends error:', error);
      if (error.message === 'User not authenticated' || error.message === 'User not found') {
        res.status(error.message === 'User not authenticated' ? 401 : 404).json(createErrorResponse(error.message));
      } else {
        res.status(500).json(createErrorResponse(error.message || 'Failed to get revenue trends'));
      }
    }
  }

  // 15. GET /api/stats/financial/cost-analysis - Get Cost Analysis
  async getCostAnalysis(req: Request, res: Response): Promise<void> {
    try {
      const { user, farmId } = await this.getUserAndFarm(req);
      const { period = '30d' } = req.query;

      if (user.role !== UserRole.MANAGER && user.role !== UserRole.ADMIN) {
        res.status(403).json(createErrorResponse('Insufficient permissions to view financial data'));
        return;
      }

      const { startDate, endDate } = this.calculateDateRange(period as string);

      // Get feed usage
      const feedUsage = await firestoreService.getFeedUsageHistory({
        farmId,
        dateFrom: startDate,
        dateTo: endDate
      });
      const feedInventoryResponse = await firestoreService.getFeedInventory({ page: 1, limit: 10000 });
      const feedInventory = (feedInventoryResponse?.data || []).filter((item: any) => item.farmId === farmId);

      // Calculate costs by category
      const feedCost = feedUsage.reduce((sum: number, record: any) => {
        const feedItem = feedInventory.find((f: any) => f.id === record.feedId);
        const costPerUnit = feedItem?.costPerUnit || feedItem?.cost || 0;
        const quantity = record.quantityUsed || record.quantity || 0;
        return sum + (quantity * costPerUnit);
      }, 0);

      const medicineInventoryResponse = await firestoreService.getMedicineInventory({ farmId }, 1, 10000);
      const medicineInventory = medicineInventoryResponse?.data || [];
      const medicineCost = medicineInventory.reduce((sum: number, item: any) => {
        const stock = item.stock || item.currentStock || 0;
        const costPerUnit = item.costPerUnit || 0;
        return sum + (stock * costPerUnit);
      }, 0);

      const laborCost = 0; // TODO: Implement labor cost tracking
      const utilitiesCost = 0; // TODO: Implement utilities cost tracking
      const otherCost = 0; // TODO: Implement other cost tracking

      const totalCost = feedCost + medicineCost + laborCost + utilitiesCost + otherCost;

      // Get total eggs for cost per egg calculation
      const startDateStr = this.getDateStr(startDate);
      const endDateStr = this.getDateStr(endDate);
      const collectionsResponse = await firestoreService.getEggCollections({
        farmId,
        startDate: startDateStr,
        endDate: endDateStr,
        limit: 10000
      });
      const collections = collectionsResponse.data || [];
      const totalEggs = collections.reduce((sum: number, c: any) => sum + (c.quantity || 0), 0);
      const costPerEgg = totalEggs > 0 ? totalCost / totalEggs : 0;

      // Get bird count for cost per bird
      const birdStats = await firestoreService.getBirdStatistics(farmId);
      const totalBirds = birdStats.totalBirds || 1;
      const costPerBird = totalBirds > 0 ? totalCost / totalBirds : 0;

      const byCategory = [
        { category: 'feed', amount: feedCost, percentage: totalCost > 0 ? (feedCost / totalCost) * 100 : 0 },
        { category: 'medicine', amount: medicineCost, percentage: totalCost > 0 ? (medicineCost / totalCost) * 100 : 0 },
        { category: 'labor', amount: laborCost, percentage: totalCost > 0 ? (laborCost / totalCost) * 100 : 0 },
        { category: 'utilities', amount: utilitiesCost, percentage: totalCost > 0 ? (utilitiesCost / totalCost) * 100 : 0 },
        { category: 'other', amount: otherCost, percentage: totalCost > 0 ? (otherCost / totalCost) * 100 : 0 }
      ].filter(item => item.amount > 0);

      const data = {
        totalCost: Math.round(totalCost * 100) / 100,
        byCategory: byCategory.map(item => ({
          category: item.category,
          amount: Math.round(item.amount * 100) / 100,
          percentage: Math.round(item.percentage * 100) / 100
        })),
        costPerEgg: Math.round(costPerEgg * 100) / 100,
        costPerBird: Math.round(costPerBird * 100) / 100
      };

      res.status(200).json(createSuccessResponse('Cost analysis retrieved successfully', data));
    } catch (error: any) {
      console.error('Get cost analysis error:', error);
      if (error.message === 'User not authenticated' || error.message === 'User not found') {
        res.status(error.message === 'User not authenticated' ? 401 : 404).json(createErrorResponse(error.message));
      } else {
        res.status(500).json(createErrorResponse(error.message || 'Failed to get cost analysis'));
      }
    }
  }

  // 16. GET /api/stats/financial/profit-margins - Get Profit Margins
  async getProfitMargins(req: Request, res: Response): Promise<void> {
    try {
      const { user, farmId } = await this.getUserAndFarm(req);
      const { period = '30d' } = req.query;

      if (user.role !== UserRole.MANAGER && user.role !== UserRole.ADMIN) {
        res.status(403).json(createErrorResponse('Insufficient permissions to view financial data'));
        return;
      }

      const { startDate, endDate } = this.calculateDateRange(period as string);
      const startDateStr = this.getDateStr(startDate);
      const endDateStr = this.getDateStr(endDate);

      // Get collections
      const collectionsResponse = await firestoreService.getEggCollections({
        farmId,
        startDate: startDateStr,
        endDate: endDateStr,
        limit: 10000
      });
      const collections = collectionsResponse.data || [];
      const totalEggs = collections.reduce((sum: number, c: any) => sum + (c.quantity || 0), 0);

      // Calculate revenue and expenses
      const avgEggPrice = 2.5;
      const totalRevenue = totalEggs * avgEggPrice;

      const feedUsage = await firestoreService.getFeedUsageHistory({
        farmId,
        dateFrom: startDate,
        dateTo: endDate
      });
      const feedInventoryResponse = await firestoreService.getFeedInventory({ page: 1, limit: 10000 });
      const feedInventory = (feedInventoryResponse?.data || []).filter((item: any) => item.farmId === farmId);
      const totalExpenses = feedUsage.reduce((sum: number, record: any) => {
        const feedItem = feedInventory.find((f: any) => f.id === record.feedId);
        const costPerUnit = feedItem?.costPerUnit || feedItem?.cost || 0;
        const quantity = record.quantityUsed || record.quantity || 0;
        return sum + (quantity * costPerUnit);
      }, 0);

      const grossProfit = totalRevenue - totalExpenses;
      const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
      const netProfit = grossProfit; // Assuming no additional deductions
      const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

      // Calculate by period (monthly breakdown)
      const monthlyMargins: Array<{ period: string; margin: number }> = [];
      // TODO: Implement monthly breakdown if needed

      const data = {
        grossMargin: Math.round(grossMargin * 100) / 100,
        netMargin: Math.round(netMargin * 100) / 100,
        byPeriod: monthlyMargins
      };

      res.status(200).json(createSuccessResponse('Profit margins retrieved successfully', data));
    } catch (error: any) {
      console.error('Get profit margins error:', error);
      if (error.message === 'User not authenticated' || error.message === 'User not found') {
        res.status(error.message === 'User not authenticated' ? 401 : 404).json(createErrorResponse(error.message));
      } else {
        res.status(500).json(createErrorResponse(error.message || 'Failed to get profit margins'));
      }
    }
  }


  // 2. GET /api/stats/daily - Get Daily Statistics
  async getDailyStats(req: Request, res: Response): Promise<void> {
    try {
      const { farmId } = await this.getUserAndFarm(req);
      const { date } = req.query;

      const targetDate = date ? new Date(date as string) : new Date();
      const dateStr = this.getDateStr(targetDate);

      // Get collections for the day
      const collectionsResponse = await firestoreService.getEggCollections({
        farmId,
        startDate: dateStr,
        endDate: dateStr,
        limit: 10000
      });
      const collections = collectionsResponse.data || [];
      const eggsCollected = collections.reduce((sum: number, c: any) => sum + (c.quantity || 0), 0);

      // Get bird count
      const birdStats = await firestoreService.getBirdStatistics(farmId);
      const birdsCount = birdStats.totalBirds || 0;

      // Get feed consumed (from usage history)
      const feedUsage = await firestoreService.getFeedUsageHistory({
        farmId,
        dateFrom: targetDate,
        dateTo: targetDate
      });
      const feedConsumed = feedUsage.reduce((sum: number, record: any) => sum + (record.quantityUsed || record.quantity || 0), 0);

      // Calculate revenue
      const avgEggPrice = 2.5;
      const revenue = eggsCollected * avgEggPrice;

      // Calculate expenses (feed cost)
      const feedInventoryResponse = await firestoreService.getFeedInventory({ page: 1, limit: 10000 });
      const feedInventory = (feedInventoryResponse?.data || []).filter((item: any) => item.farmId === farmId);
      const expenses = feedUsage.reduce((sum: number, record: any) => {
        const feedItem = feedInventory.find((f: any) => f.id === record.feedId);
        const costPerUnit = feedItem?.costPerUnit || feedItem?.cost || 0;
        const quantity = record.quantityUsed || record.quantity || 0;
        return sum + (quantity * costPerUnit);
      }, 0);

      const data = {
        date: dateStr,
        eggsCollected,
        birdsCount,
        feedConsumed: Math.round(feedConsumed * 100) / 100,
        revenue: Math.round(revenue * 100) / 100,
        expenses: Math.round(expenses * 100) / 100
      };

      res.status(200).json(createSuccessResponse('Daily statistics retrieved successfully', data));
    } catch (error: any) {
      console.error('Get daily stats error:', error);
      if (error.message === 'User not authenticated' || error.message === 'User not found') {
        res.status(error.message === 'User not authenticated' ? 401 : 404).json(createErrorResponse(error.message));
      } else {
        res.status(500).json(createErrorResponse(error.message || 'Failed to get daily statistics'));
      }
    }
  }

  // 3. GET /api/stats/weekly - Get Weekly Statistics
  async getWeeklyStats(req: Request, res: Response): Promise<void> {
    try {
      const { farmId } = await this.getUserAndFarm(req);

      const today = new Date();
      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() - 7);
      const weekStartStr = this.getDateStr(weekStart);
      const weekEndStr = this.getDateStr(today);

      // Get collections for the week
      const collectionsResponse = await firestoreService.getEggCollections({
        farmId,
        startDate: weekStartStr,
        endDate: weekEndStr,
        limit: 10000
      });
      const collections = collectionsResponse.data || [];
      const totalEggs = collections.reduce((sum: number, c: any) => sum + (c.quantity || 0), 0);
      const daysInWeek = 7;
      const averageDaily = totalEggs / daysInWeek;

      // Calculate revenue
      const avgEggPrice = 2.5;
      const totalRevenue = totalEggs * avgEggPrice;

      // Calculate expenses
      const feedUsage = await firestoreService.getFeedUsageHistory({
        farmId,
        dateFrom: weekStart,
        dateTo: today
      });
      const feedInventoryResponse = await firestoreService.getFeedInventory({ page: 1, limit: 10000 });
      const feedInventory = (feedInventoryResponse?.data || []).filter((item: any) => item.farmId === farmId);
      const totalExpenses = feedUsage.reduce((sum: number, record: any) => {
        const feedItem = feedInventory.find((f: any) => f.id === record.feedId);
        const costPerUnit = feedItem?.costPerUnit || feedItem?.cost || 0;
        const quantity = record.quantityUsed || record.quantity || 0;
        return sum + (quantity * costPerUnit);
      }, 0);

      const netProfit = totalRevenue - totalExpenses;

      const data = {
        weekStart: weekStartStr,
        weekEnd: weekEndStr,
        totalEggs,
        averageDaily: Math.round(averageDaily * 100) / 100,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        netProfit: Math.round(netProfit * 100) / 100
      };

      res.status(200).json(createSuccessResponse('Weekly statistics retrieved successfully', data));
    } catch (error: any) {
      console.error('Get weekly stats error:', error);
      if (error.message === 'User not authenticated' || error.message === 'User not found') {
        res.status(error.message === 'User not authenticated' ? 401 : 404).json(createErrorResponse(error.message));
      } else {
        res.status(500).json(createErrorResponse(error.message || 'Failed to get weekly statistics'));
      }
    }
  }

  // 4. GET /api/stats/monthly - Get Monthly Statistics
  async getMonthlyStats(req: Request, res: Response): Promise<void> {
    try {
      const { farmId } = await this.getUserAndFarm(req);
      const { month } = req.query;

      const today = new Date();
      let monthStart: Date;
      let monthEnd: Date;

      if (month) {
        // Parse YYYY-MM format
        const [year, monthNum] = (month as string).split('-').map(Number);
        monthStart = new Date(year, monthNum - 1, 1);
        monthEnd = new Date(year, monthNum, 0);
      } else {
        monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        monthEnd = today;
      }

      const monthStartStr = this.getDateStr(monthStart);
      const monthEndStr = this.getDateStr(monthEnd);
      const monthKey = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`;

      // Get collections for the month
      const collectionsResponse = await firestoreService.getEggCollections({
        farmId,
        startDate: monthStartStr,
        endDate: monthEndStr,
        limit: 10000
      });
      const collections = collectionsResponse.data || [];
      const totalEggs = collections.reduce((sum: number, c: any) => sum + (c.quantity || 0), 0);
      const daysInMonth = Math.ceil((monthEnd.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24)) || 1;
      const averageDaily = totalEggs / daysInMonth;

      // Calculate revenue
      const avgEggPrice = 2.5;
      const totalRevenue = totalEggs * avgEggPrice;

      // Calculate expenses
      const feedUsage = await firestoreService.getFeedUsageHistory({
        farmId,
        dateFrom: monthStart,
        dateTo: monthEnd
      });
      const feedInventoryResponse = await firestoreService.getFeedInventory({ page: 1, limit: 10000 });
      const feedInventory = (feedInventoryResponse?.data || []).filter((item: any) => item.farmId === farmId);
      const totalExpenses = feedUsage.reduce((sum: number, record: any) => {
        const feedItem = feedInventory.find((f: any) => f.id === record.feedId);
        const costPerUnit = feedItem?.costPerUnit || feedItem?.cost || 0;
        const quantity = record.quantityUsed || record.quantity || 0;
        return sum + (quantity * costPerUnit);
      }, 0);

      const netProfit = totalRevenue - totalExpenses;
      const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

      const data = {
        month: monthKey,
        totalEggs,
        averageDaily: Math.round(averageDaily * 100) / 100,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        netProfit: Math.round(netProfit * 100) / 100,
        profitMargin: Math.round(profitMargin * 100) / 100
      };

      res.status(200).json(createSuccessResponse('Monthly statistics retrieved successfully', data));
    } catch (error: any) {
      console.error('Get monthly stats error:', error);
      if (error.message === 'User not authenticated' || error.message === 'User not found') {
        res.status(error.message === 'User not authenticated' ? 401 : 404).json(createErrorResponse(error.message));
      } else {
        res.status(500).json(createErrorResponse(error.message || 'Failed to get monthly statistics'));
      }
    }
  }

  // 5. GET /api/stats/trends - Get Performance Trends
  async getTrends(req: Request, res: Response): Promise<void> {
    try {
      const { farmId } = await this.getUserAndFarm(req);
      const { period = '30d' } = req.query;

      // If no farmId, return empty trends
      if (!farmId || farmId.trim() === '') {
        res.status(200).json(createSuccessResponse('Performance trends retrieved successfully', {
          eggProduction: { current: 0, previous: 0, change: 0, trend: 'neutral' },
          feedEfficiency: { current: 0, previous: 0, change: 0, trend: 'neutral' },
          revenue: { current: 0, previous: 0, change: 0, trend: 'neutral' }
        }));
        return;
      }

      const { startDate, endDate } = this.calculateDateRange(period as string);
      const startDateStr = this.getDateStr(startDate);
      const endDateStr = this.getDateStr(endDate);

      // Get current period data
      const currentCollections = await firestoreService.getEggCollections({
        farmId,
        startDate: startDateStr,
        endDate: endDateStr,
        limit: 10000
      });
      const currentEggs = (currentCollections.data || []).reduce((sum: number, c: any) => sum + (c.quantity || 0), 0);

      // Get previous period data
      const periodDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const prevStartDate = new Date(startDate);
      prevStartDate.setDate(prevStartDate.getDate() - periodDays);
      const prevEndDate = new Date(startDate);
      const prevStartDateStr = this.getDateStr(prevStartDate);
      const prevEndDateStr = this.getDateStr(prevEndDate);

      const prevCollections = await firestoreService.getEggCollections({
        farmId,
        startDate: prevStartDateStr,
        endDate: prevEndDateStr,
        limit: 10000
      });
      const previousEggs = (prevCollections.data || []).reduce((sum: number, c: any) => sum + (c.quantity || 0), 0);

      // Calculate egg production trend
      const eggsChange = previousEggs > 0 ? ((currentEggs - previousEggs) / previousEggs) * 100 : 0;
      const eggsTrend = currentEggs > previousEggs ? 'up' : currentEggs < previousEggs ? 'down' : 'neutral';

      // Calculate feed efficiency (eggs per kg of feed)
      let feedUsage: any[] = [];
      try {
        feedUsage = await firestoreService.getFeedUsageHistory({
          farmId,
          dateFrom: startDate,
          dateTo: endDate
        }).catch(() => []);
      } catch (error: any) {
        console.error('Error getting feed usage:', error);
        feedUsage = [];
      }
      const totalFeed = feedUsage.reduce((sum: number, r: any) => sum + (r.quantityUsed || r.quantity || 0), 0);
      const currentFeedEfficiency = totalFeed > 0 ? currentEggs / totalFeed : 0;

      let prevFeedUsage: any[] = [];
      try {
        prevFeedUsage = await firestoreService.getFeedUsageHistory({
          farmId,
          dateFrom: prevStartDate,
          dateTo: prevEndDate
        }).catch(() => []);
      } catch (error: any) {
        console.error('Error getting previous feed usage:', error);
        prevFeedUsage = [];
      }
      const prevTotalFeed = prevFeedUsage.reduce((sum: number, r: any) => sum + (r.quantityUsed || r.quantity || 0), 0);
      const previousFeedEfficiency = prevTotalFeed > 0 ? previousEggs / prevTotalFeed : 0;

      const feedEfficiencyChange = previousFeedEfficiency > 0 ? ((currentFeedEfficiency - previousFeedEfficiency) / previousFeedEfficiency) * 100 : 0;
      const feedEfficiencyTrend = currentFeedEfficiency > previousFeedEfficiency ? 'up' : currentFeedEfficiency < previousFeedEfficiency ? 'down' : 'neutral';

      // Calculate revenue trend
      const avgEggPrice = 2.5;
      const currentRevenue = currentEggs * avgEggPrice;
      const previousRevenue = previousEggs * avgEggPrice;
      const revenueChange = previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : 0;
      const revenueTrend = currentRevenue > previousRevenue ? 'up' : currentRevenue < previousRevenue ? 'down' : 'neutral';

      const data = {
        eggProduction: {
          current: currentEggs,
          previous: previousEggs,
          change: Math.round(eggsChange * 100) / 100,
          trend: eggsTrend
        },
        feedEfficiency: {
          current: Math.round(currentFeedEfficiency * 100) / 100,
          previous: Math.round(previousFeedEfficiency * 100) / 100,
          change: Math.round(feedEfficiencyChange * 100) / 100,
          trend: feedEfficiencyTrend
        },
        revenue: {
          current: Math.round(currentRevenue * 100) / 100,
          previous: Math.round(previousRevenue * 100) / 100,
          change: Math.round(revenueChange * 100) / 100,
          trend: revenueTrend
        }
      };

      res.status(200).json(createSuccessResponse('Performance trends retrieved successfully', data));
    } catch (error: any) {
      console.error('Get trends error:', error);
      if (error.message === 'User not authenticated' || error.message === 'User not found') {
        res.status(error.message === 'User not authenticated' ? 401 : 404).json(createErrorResponse(error.message));
      } else {
        res.status(500).json(createErrorResponse(error.message || 'Failed to get trends'));
      }
    }
  }

  // 6. GET /api/stats/eggs/grade-distribution - Get Grade Distribution
  async getGradeDistribution(req: Request, res: Response): Promise<void> {
    try {
      const { farmId } = await this.getUserAndFarm(req);
      const { period = '30d' } = req.query;

      // If no farmId, return empty distribution
      if (!farmId || farmId.trim() === '') {
        res.status(200).json(createSuccessResponse('Grade distribution retrieved successfully', {
          gradeAA: { count: 0, percentage: 0 },
          gradeA: { count: 0, percentage: 0 },
          gradeB: { count: 0, percentage: 0 },
          cracked: { count: 0, percentage: 0 },
          total: 0
        }));
        return;
      }

      const { startDate, endDate } = this.calculateDateRange(period as string);
      const startDateStr = this.getDateStr(startDate);
      const endDateStr = this.getDateStr(endDate);

      const collectionsResponse = await firestoreService.getEggCollections({
        farmId,
        startDate: startDateStr,
        endDate: endDateStr,
        limit: 10000
      });
      const collections = collectionsResponse.data || [];

      // Calculate grade distribution
      const gradeCounts: Record<string, number> = { AA: 0, A: 0, B: 0, C: 0, cracked: 0 };
      collections.forEach((c: any) => {
        const grade = c.grade || c.quality || 'A';
        const quantity = c.quantity || c.collected || 0;
        const broken = c.broken || c.cracked || 0;
        
        if (grade === 'AA') gradeCounts.AA += quantity;
        else if (grade === 'A') gradeCounts.A += quantity;
        else if (grade === 'B') gradeCounts.B += quantity;
        else if (grade === 'C') gradeCounts.C += quantity;
        
        gradeCounts.cracked += broken;
      });

      const total = Object.values(gradeCounts).reduce((sum, count) => sum + count, 0);

      const data = {
        gradeAA: {
          count: gradeCounts.AA,
          percentage: total > 0 ? Math.round((gradeCounts.AA / total) * 100 * 100) / 100 : 0
        },
        gradeA: {
          count: gradeCounts.A,
          percentage: total > 0 ? Math.round((gradeCounts.A / total) * 100 * 100) / 100 : 0
        },
        gradeB: {
          count: gradeCounts.B,
          percentage: total > 0 ? Math.round((gradeCounts.B / total) * 100 * 100) / 100 : 0
        },
        cracked: {
          count: gradeCounts.cracked,
          percentage: total > 0 ? Math.round((gradeCounts.cracked / total) * 100 * 100) / 100 : 0
        },
        total
      };

      res.status(200).json(createSuccessResponse('Grade distribution retrieved successfully', data));
    } catch (error: any) {
      console.error('Get grade distribution error:', error);
      if (error.message === 'User not authenticated' || error.message === 'User not found') {
        res.status(error.message === 'User not authenticated' ? 401 : 404).json(createErrorResponse(error.message));
      } else {
        res.status(500).json(createErrorResponse(error.message || 'Failed to get grade distribution'));
      }
    }
  }

  // 7. GET /api/stats/pens/performance - Get Pen Performance
  async getPenPerformance(req: Request, res: Response): Promise<void> {
    try {
      const { farmId } = await this.getUserAndFarm(req);
      const { period = '30d' } = req.query;

      // If no farmId, return empty performance
      if (!farmId || farmId.trim() === '') {
        res.status(200).json(createSuccessResponse('Pen performance retrieved successfully', []));
        return;
      }

      const { startDate, endDate } = this.calculateDateRange(period as string);
      const startDateStr = this.getDateStr(startDate);
      const endDateStr = this.getDateStr(endDate);

      // Get collections grouped by pen
      const collectionsResponse = await firestoreService.getEggCollections({
        farmId,
        startDate: startDateStr,
        endDate: endDateStr,
        limit: 10000
      });
      const collections = collectionsResponse.data || [];

      // Get birds grouped by pen
      const birdsResponse = await firestoreService.getBirds();
      const birds = (birdsResponse?.data || []).filter((b: any) => b.farmId === farmId);

      // Group by pen
      const penStats: Record<string, { penId: string; penName: string; birdCount: number; eggProduction: number }> = {};

      collections.forEach((c: any) => {
        const pen = c.pen || c.penId || 'Unknown';
        if (!penStats[pen]) {
          penStats[pen] = {
            penId: pen,
            penName: pen,
            birdCount: 0,
            eggProduction: 0
          };
        }
        penStats[pen].eggProduction += (c.quantity || 0);
      });

      birds.forEach((b: any) => {
        const pen = b.penId || b.pen || 'Unknown';
        if (!penStats[pen]) {
          penStats[pen] = {
            penId: pen,
            penName: pen,
            birdCount: 0,
            eggProduction: 0
          };
        }
        penStats[pen].birdCount += (b.quantity || 1);
      });

      // Calculate efficiency and rank
      const penArray = Object.values(penStats).map(pen => ({
        ...pen,
        efficiency: pen.birdCount > 0 ? Math.round((pen.eggProduction / pen.birdCount) * 100) / 100 : 0
      }));

      // Sort by efficiency and assign ranks
      penArray.sort((a, b) => b.efficiency - a.efficiency);
      penArray.forEach((pen, index) => {
        (pen as any).rank = index + 1;
      });

      res.status(200).json(createSuccessResponse('Pen performance retrieved successfully', penArray));
    } catch (error: any) {
      console.error('Get pen performance error:', error);
      if (error.message === 'User not authenticated' || error.message === 'User not found') {
        res.status(error.message === 'User not authenticated' ? 401 : 404).json(createErrorResponse(error.message));
      } else {
        res.status(500).json(createErrorResponse(error.message || 'Failed to get pen performance'));
      }
    }
  }

  // 8. GET /api/stats/collectors/performance - Get Collector Performance
  async getCollectorPerformance(req: Request, res: Response): Promise<void> {
    try {
      const { farmId } = await this.getUserAndFarm(req);
      const { period = '30d' } = req.query;

      const { startDate, endDate } = this.calculateDateRange(period as string);
      const startDateStr = this.getDateStr(startDate);
      const endDateStr = this.getDateStr(endDate);

      const collectionsResponse = await firestoreService.getEggCollections({
        farmId,
        startDate: startDateStr,
        endDate: endDateStr,
        limit: 10000
      });
      const collections = collectionsResponse.data || [];

      // Group by collector
      const collectorStats: Record<string, { collectorId: string; collectorName: string; totalCollections: number; totalEggs: number; dates: Set<string> }> = {};

      collections.forEach((c: any) => {
        const collector = c.collector || c.collectedBy || 'Unknown';
        if (!collectorStats[collector]) {
          collectorStats[collector] = {
            collectorId: collector,
            collectorName: collector,
            totalCollections: 0,
            totalEggs: 0,
            dates: new Set()
          };
        }
        collectorStats[collector].totalCollections += 1;
        collectorStats[collector].totalEggs += (c.quantity || 0);
        const date = c.date || c.createdAt?.toDate?.()?.toISOString().split('T')[0] || '';
        if (date) collectorStats[collector].dates.add(date);
      });

      // Calculate metrics
      const daysInPeriod = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) || 1;
      const collectorArray = Object.values(collectorStats).map(collector => ({
        collectorId: collector.collectorId,
        collectorName: collector.collectorName,
        totalCollections: collector.totalCollections,
        averagePerDay: Math.round((collector.totalEggs / daysInPeriod) * 100) / 100,
        efficiency: collector.totalCollections > 0 ? Math.round((collector.totalEggs / collector.totalCollections) * 100) / 100 : 0
      }));

      // Sort by total collections and assign ranks
      collectorArray.sort((a, b) => b.totalCollections - a.totalCollections);
      collectorArray.forEach((collector, index) => {
        (collector as any).rank = index + 1;
      });

      res.status(200).json(createSuccessResponse('Collector performance retrieved successfully', collectorArray));
    } catch (error: any) {
      console.error('Get collector performance error:', error);
      if (error.message === 'User not authenticated' || error.message === 'User not found') {
        res.status(error.message === 'User not authenticated' ? 401 : 404).json(createErrorResponse(error.message));
      } else {
        res.status(500).json(createErrorResponse(error.message || 'Failed to get collector performance'));
      }
    }
  }
}

 export default StatsController;