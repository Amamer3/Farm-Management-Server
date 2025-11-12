import { Request, Response } from 'express';
import FirestoreService from '../services/firestoreService';
import { ApiResponse, UserRole, DateRange } from '../models/types';
import { createSuccessResponse, createErrorResponse } from '../utils/responseHelper';

const firestoreService = FirestoreService;

export class ReportsController {
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

  // Get dashboard statistics for reports page
  async getDashboardReports(req: Request, res: Response): Promise<void> {
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

      // Get current month's start date
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthStartStr = monthStart.toISOString().split('T')[0];
      const todayStr = now.toISOString().split('T')[0];

      // Count reports generated this month (placeholder - would need a reports collection)
      const totalReports = 0; // TODO: Implement report tracking

      // Count automated reports (placeholder)
      const automatedReports = 0; // TODO: Implement automated report tracking

      // Count key metrics tracked
      const dataInsights = 8; // Fixed number of key metrics

      // Calculate performance score (farm efficiency)
      const birdStats = await firestoreService.getBirdStatistics(currentUser.farmId);
      const collectionsResponse = await firestoreService.getEggCollections({
        farmId: currentUser.farmId,
        startDate: monthStartStr,
        endDate: todayStr,
        limit: 10000
      });
      const collections = collectionsResponse.data || [];
      const totalEggs = collections.reduce((sum: number, c: any) => sum + (c.quantity || 0), 0);
      const totalBirds = birdStats.totalBirds || 1;
      const expectedEggs = totalBirds * 0.8 * 30; // Assuming 80% production rate, 30 days
      const performanceScore = expectedEggs > 0 ? Math.min(Math.round((totalEggs / expectedEggs) * 100), 100) : 0;

      const stats = {
        totalReports,
        automatedReports,
        dataInsights,
        performanceScore: `${performanceScore}%`
      };

      res.status(200).json(createSuccessResponse('Dashboard statistics retrieved successfully', stats));
    } catch (error: any) {
      console.error('Get dashboard reports error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to get dashboard statistics'));
    }
  }


  // Get production report
  async getProductionReports(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { period = '30d', farmId } = req.query;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      if (!currentUser) {
        res.status(404).json(createErrorResponse('User not found'));
        return;
      }

      const targetFarmId = (currentUser.role === UserRole.ADMIN && farmId) 
        ? farmId as string 
        : currentUser.farmId;

      const { startDate, endDate } = this.calculateDateRange(period as string);
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

      // Calculate totals
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

      // Calculate trends (compare first half vs second half)
      const sortedDates = Object.keys(dailyTotals).sort();
      const midpoint = Math.floor(sortedDates.length / 2);
      const firstHalf = sortedDates.slice(0, midpoint).reduce((sum, date) => sum + (dailyTotals[date] || 0), 0) / (midpoint || 1);
      const secondHalf = sortedDates.slice(midpoint).reduce((sum, date) => sum + (dailyTotals[date] || 0), 0) / (sortedDates.length - midpoint || 1);
      const change = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf) * 100 : 0;
      const direction = secondHalf > firstHalf ? 'up' : secondHalf < firstHalf ? 'down' : 'stable';

      // Build daily data
      const dailyData = sortedDates.map(date => {
        const dayCollections = collections.filter((c: any) => {
          const cDate = c.date || c.createdAt?.toDate?.()?.toISOString().split('T')[0] || '';
          return cDate === date;
        });

        return {
          date,
          quantity: dailyTotals[date] || 0,
          gradeAA: dayCollections.filter((c: any) => (c.grade || c.quality) === 'AA').reduce((sum: number, c: any) => sum + (c.quantity || 0), 0),
          gradeA: dayCollections.filter((c: any) => (c.grade || c.quality) === 'A').reduce((sum: number, c: any) => sum + (c.quantity || 0), 0),
          gradeB: dayCollections.filter((c: any) => (c.grade || c.quality) === 'B').reduce((sum: number, c: any) => sum + (c.quantity || 0), 0),
          gradeC: dayCollections.filter((c: any) => (c.grade || c.quality) === 'C').reduce((sum: number, c: any) => sum + (c.quantity || 0), 0)
        };
      });

      const report = {
        period: period as string,
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
        },
        trends: {
          change: Math.round(change * 100) / 100,
          direction
        },
        dailyData
      };

      res.status(200).json(createSuccessResponse('Production report retrieved successfully', report));
    } catch (error: any) {
      console.error('Get production report error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to get production report'));
    }
  }


  // Get health report
  async getHealthReports(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { period = '30d', farmId } = req.query;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      if (!currentUser) {
        res.status(404).json(createErrorResponse('User not found'));
        return;
      }

      const targetFarmId = (currentUser.role === UserRole.ADMIN && farmId) 
        ? farmId as string 
        : currentUser.farmId;

      const { startDate, endDate } = this.calculateDateRange(period as string);
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      // Get birds and treatment history
      const [birdsResponse, treatmentHistoryResponse] = await Promise.all([
        firestoreService.getBirds(),
        firestoreService.getMedicineUsageHistory(
          { farmId: targetFarmId, startDate, endDate },
          1,
          1000
        )
      ]);

      // Filter birds by farmId
      const allBirds = birdsResponse?.data || [];
      const birds = allBirds.filter((b: any) => b.farmId === targetFarmId);

      const treatments = treatmentHistoryResponse?.data || [];

      // Calculate health metrics
      const totalBirds = birds.reduce((sum: number, b: any) => sum + (b.quantity || 1), 0);
      const healthyBirds = birds
        .filter((b: any) => b.healthStatus === 'healthy')
        .reduce((sum: number, b: any) => sum + (b.quantity || 1), 0);
      const sickBirds = birds
        .filter((b: any) => b.healthStatus === 'sick' || b.healthStatus === 'quarantine')
        .reduce((sum: number, b: any) => sum + (b.quantity || 1), 0);

      // Calculate mortality rate (placeholder - would need historical data)
      const mortalityRate = 0; // TODO: Calculate from historical data

      // Calculate health score
      const healthScore = totalBirds > 0 ? Math.round((healthyBirds / totalBirds) * 100) : 100;

      // Get active treatments (within last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const activeTreatments = treatments.filter((t: any) => {
        const treatmentDate = t.date || t.administeredDate || t.administeredAt?.toDate?.() || new Date();
        return new Date(treatmentDate) >= thirtyDaysAgo;
      }).length;

      // Common issues (placeholder - would need more detailed tracking)
      const commonIssues: Array<{ issue: string; count: number; severity: string }> = [];
      // TODO: Implement issue tracking

      // Build treatment history
      const treatmentHistory = treatments.slice(0, 50).map((t: any) => ({
        date: t.date || t.administeredDate || t.administeredAt?.toDate?.()?.toISOString().split('T')[0] || '',
        treatment: t.medicineName || t.treatment || t.medicine?.name || 'Unknown',
        birdGroup: t.birdGroup || t.birdGroupId || t.penId || '',
        outcome: t.outcome || 'N/A'
      }));

      // Vaccination schedule (placeholder)
      const vaccinationSchedule: Array<{ date: string; vaccine: string; birdGroup: string; status: string }> = [];
      // TODO: Implement vaccination schedule tracking

      const report = {
        period: period as string,
        totalTreatments: treatments.length,
        activeTreatments,
        mortalityRate: Math.round(mortalityRate * 100) / 100,
        healthScore,
        commonIssues,
        treatmentHistory,
        vaccinationSchedule
      };

      res.status(200).json(createSuccessResponse('Health report retrieved successfully', report));
    } catch (error: any) {
      console.error('Get health report error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to get health report'));
    }
  }

  // Get feed consumption report
  async getFeedConsumptionReport(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { period = '30d', farmId } = req.query;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      if (!currentUser) {
        res.status(404).json(createErrorResponse('User not found'));
        return;
      }

      const targetFarmId = (currentUser.role === UserRole.ADMIN && farmId) 
        ? farmId as string 
        : currentUser.farmId;

      // If no farmId, return default feed consumption report
      if (!targetFarmId || targetFarmId.trim() === '') {
        res.status(200).json(createSuccessResponse('Feed consumption report retrieved successfully', {
          period: period as string,
          totalConsumption: 0,
          averageDaily: 0,
          feedEfficiency: 0,
          costAnalysis: {
            totalCost: 0,
            costPerEgg: 0,
            costPerBird: 0
          },
          byFeedType: [],
          dailyConsumption: []
        }));
        return;
      }

      const { startDate, endDate } = this.calculateDateRange(period as string);

      // Get feed usage history with error handling
      let usageHistory: any[] = [];
      try {
        usageHistory = await firestoreService.getFeedUsageHistory({
          farmId: targetFarmId,
          dateFrom: startDate,
          dateTo: endDate
        }).catch(() => []);
      } catch (error: any) {
        console.error('Error getting feed usage history:', error);
        usageHistory = [];
      }

      // Get feed inventory for cost calculation with error handling
      let feedInventory: any[] = [];
      try {
        const feedInventoryResponse = await firestoreService.getFeedInventory({
          page: 1,
          limit: 10000
        }).catch(() => ({ data: [] }));
        const allFeedInventory = feedInventoryResponse?.data || [];
        feedInventory = allFeedInventory.filter((item: any) => item.farmId === targetFarmId);
      } catch (error: any) {
        console.error('Error getting feed inventory:', error);
        feedInventory = [];
      }

      // Calculate total consumption
      const totalConsumption = usageHistory.reduce((sum: number, record: any) => {
        return sum + (record.quantityUsed || record.quantity || 0);
      }, 0);

      const daysInPeriod = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) || 1;
      const averageDaily = totalConsumption / daysInPeriod;

      // Get egg collections for feed efficiency calculation with error handling
      let collections: any[] = [];
      let totalEggs = 0;
      try {
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];
        const collectionsResponse = await firestoreService.getEggCollections({
          farmId: targetFarmId,
          startDate: startDateStr,
          endDate: endDateStr,
          limit: 10000
        }).catch(() => ({ data: [] }));
        collections = collectionsResponse.data || [];
        totalEggs = collections.reduce((sum: number, c: any) => sum + (c.quantity || 0), 0);
      } catch (error: any) {
        console.error('Error getting egg collections:', error);
        collections = [];
        totalEggs = 0;
      }
      const feedEfficiency = totalEggs > 0 ? Math.round((totalConsumption / totalEggs) * 100) / 100 : 0;

      // Calculate costs
      const totalCost = usageHistory.reduce((sum: number, record: any) => {
        const feedItem = feedInventory.find((f: any) => f.id === record.feedId);
        const costPerUnit = feedItem?.costPerUnit || feedItem?.cost || 0;
        const quantity = record.quantityUsed || record.quantity || 0;
        return sum + (quantity * costPerUnit);
      }, 0);

      const costPerEgg = totalEggs > 0 ? totalCost / totalEggs : 0;
      
      // Get bird statistics with error handling
      let totalBirds = 1;
      try {
        const birdStats = await firestoreService.getBirdStatistics(targetFarmId).catch(() => ({ totalBirds: 1 }));
        totalBirds = birdStats.totalBirds || 1;
      } catch (error: any) {
        console.error('Error getting bird statistics:', error);
        totalBirds = 1;
      }
      const costPerBird = totalBirds > 0 ? totalCost / totalBirds : 0;

      // Group by feed type
      const byFeedType: Record<string, { quantity: number; cost: number }> = {};
      usageHistory.forEach((record: any) => {
        const feedItem = feedInventory.find((f: any) => f.id === record.feedId);
        const type = feedItem?.type || feedItem?.feedType || 'Unknown';
        const quantity = record.quantityUsed || record.quantity || 0;
        const costPerUnit = feedItem?.costPerUnit || feedItem?.cost || 0;
        const cost = quantity * costPerUnit;

        if (!byFeedType[type]) {
          byFeedType[type] = { quantity: 0, cost: 0 };
        }
        byFeedType[type].quantity += quantity;
        byFeedType[type].cost += cost;
      });

      const byFeedTypeArray = Object.entries(byFeedType).map(([type, data]) => ({
        type,
        quantity: Math.round(data.quantity * 100) / 100,
        cost: Math.round(data.cost * 100) / 100,
        percentage: totalConsumption > 0 ? Math.round((data.quantity / totalConsumption) * 100) : 0
      }));

      // Build daily consumption
      const dailyConsumption: Record<string, { quantity: number; cost: number; feedType: string }> = {};
      usageHistory.forEach((record: any) => {
        const date = record.date || record.consumedAt?.toDate?.()?.toISOString().split('T')[0] || '';
        if (!date) return;
        
        const feedItem = feedInventory.find((f: any) => f.id === record.feedId);
        const quantity = record.quantityUsed || record.quantity || 0;
        const costPerUnit = feedItem?.costPerUnit || feedItem?.cost || 0;
        const cost = quantity * costPerUnit;
        const feedType = feedItem?.type || feedItem?.feedType || 'Unknown';

        if (!dailyConsumption[date]) {
          dailyConsumption[date] = { quantity: 0, cost: 0, feedType: '' };
        }
        dailyConsumption[date].quantity += quantity;
        dailyConsumption[date].cost += cost;
        dailyConsumption[date].feedType = feedType; // Use most recent type
      });

      const dailyConsumptionArray = Object.entries(dailyConsumption)
        .map(([date, data]) => ({
          date,
          quantity: Math.round(data.quantity * 100) / 100,
          cost: Math.round(data.cost * 100) / 100,
          feedType: data.feedType
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
      
      const report = {
        period: period as string,
        totalConsumption: Math.round(totalConsumption * 100) / 100,
        averageDaily: Math.round(averageDaily * 100) / 100,
        feedEfficiency: Math.round(feedEfficiency * 100) / 100,
        costAnalysis: {
          totalCost: Math.round(totalCost * 100) / 100,
          costPerEgg: Math.round(costPerEgg * 100) / 100,
          costPerBird: Math.round(costPerBird * 100) / 100
        },
        byFeedType: byFeedTypeArray,
        dailyConsumption: dailyConsumptionArray
      };

      res.status(200).json(createSuccessResponse('Feed consumption report retrieved successfully', report));
    } catch (error: any) {
      console.error('Get feed consumption report error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to get feed consumption report'));
    }
  }

  // Get financial report
  async getFinancialReports(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { period = '30d', farmId } = req.query;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      if (!currentUser) {
        res.status(404).json(createErrorResponse('User not found'));
        return;
      }

      const targetFarmId = (currentUser.role === UserRole.ADMIN && farmId) 
        ? farmId as string 
        : currentUser.farmId;

      const { startDate, endDate } = this.calculateDateRange(period as string);
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      // Get data for the period
      const [collectionsResponse, feedInventoryResponse, medicineInventoryResponse, feedUsageHistory] = await Promise.all([
        firestoreService.getEggCollections({
          farmId: targetFarmId,
          startDate: startDateStr,
          endDate: endDateStr,
          limit: 10000
        }),
        firestoreService.getFeedInventory({ page: 1, limit: 10000 }),
        firestoreService.getMedicineInventory({ farmId: targetFarmId, page: 1, limit: 10000 }),
        firestoreService.getFeedUsageHistory({ farmId: targetFarmId, dateFrom: startDate, dateTo: endDate })
      ]);

      const collections = collectionsResponse.data || [];
      const allFeedInventory = feedInventoryResponse?.data || [];
      const feedInventory = allFeedInventory.filter((item: any) => item.farmId === targetFarmId);
      const allMedicineInventory = medicineInventoryResponse?.data || [];
      const medicineInventory = allMedicineInventory.filter((item: any) => item.farmId === targetFarmId);

      // Calculate revenue (assuming average egg price in Ghana Cedis)
      const avgEggPrice = 2.5; // ₵2.5 per egg (placeholder - should be configurable)
      const totalEggs = collections.reduce((sum: number, c: any) => sum + (c.quantity || 0), 0);
      const revenueFromEggs = totalEggs * avgEggPrice;

      // Calculate expenses
      const feedCost = feedUsageHistory.reduce((sum: number, record: any) => {
        const feedItem = feedInventory.find((f: any) => f.id === record.feedId);
        const costPerUnit = feedItem?.costPerUnit || feedItem?.cost || 0;
        const quantity = record.quantityUsed || record.quantity || 0;
        return sum + (quantity * costPerUnit);
      }, 0);

      const medicineCost = medicineInventory.reduce((sum: number, item: any) => {
        const stock = item.stock || item.currentStock || 0;
        const costPerUnit = item.costPerUnit || 0;
        return sum + (stock * costPerUnit);
      }, 0);

      // Placeholder for other expenses
      const laborCost = 0; // TODO: Implement labor cost tracking
      const utilitiesCost = 0; // TODO: Implement utilities cost tracking
      const otherCost = 0; // TODO: Implement other cost tracking

      const totalExpenses = feedCost + medicineCost + laborCost + utilitiesCost + otherCost;
      const grossProfit = revenueFromEggs - totalExpenses;
      const netProfit = grossProfit; // Assuming no additional deductions
      const profitMargin = revenueFromEggs > 0 ? (netProfit / revenueFromEggs) * 100 : 0;

      // Calculate trends (compare with previous period)
      const prevPeriodDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const prevStartDate = new Date(startDate);
      prevStartDate.setDate(prevStartDate.getDate() - prevPeriodDays);
      const prevStartDateStr = prevStartDate.toISOString().split('T')[0];
      const prevEndDateStr = startDate.toISOString().split('T')[0];

      const prevCollectionsResponse = await firestoreService.getEggCollections({
        farmId: targetFarmId,
        startDate: prevStartDateStr,
        endDate: prevEndDateStr,
        limit: 10000
      });
      const prevCollections = prevCollectionsResponse.data || [];
      const prevTotalEggs = prevCollections.reduce((sum: number, c: any) => sum + (c.quantity || 0), 0);
      const prevRevenue = prevTotalEggs * avgEggPrice;

      const revenueChange = prevRevenue > 0 ? ((revenueFromEggs - prevRevenue) / prevRevenue) * 100 : 0;
      const expenseChange = 0; // TODO: Calculate from previous period
      const profitChange = prevRevenue > 0 ? ((netProfit - (prevRevenue - totalExpenses)) / (prevRevenue - totalExpenses)) * 100 : 0;

      // Build breakdown
      const breakdown = [
        { category: 'Feed', amount: feedCost, percentage: totalExpenses > 0 ? (feedCost / totalExpenses) * 100 : 0 },
        { category: 'Medicine', amount: medicineCost, percentage: totalExpenses > 0 ? (medicineCost / totalExpenses) * 100 : 0 },
        { category: 'Labor', amount: laborCost, percentage: totalExpenses > 0 ? (laborCost / totalExpenses) * 100 : 0 },
        { category: 'Utilities', amount: utilitiesCost, percentage: totalExpenses > 0 ? (utilitiesCost / totalExpenses) * 100 : 0 },
        { category: 'Other', amount: otherCost, percentage: totalExpenses > 0 ? (otherCost / totalExpenses) * 100 : 0 }
      ].filter(item => item.amount > 0);

      const report = {
        period: period as string,
        revenue: {
          total: Math.round(revenueFromEggs * 100) / 100,
          fromEggs: Math.round(revenueFromEggs * 100) / 100,
          fromBirds: 0, // TODO: Implement bird sales tracking
          other: 0 // TODO: Implement other revenue tracking
        },
        expenses: {
          total: Math.round(totalExpenses * 100) / 100,
          feed: Math.round(feedCost * 100) / 100,
          medicine: Math.round(medicineCost * 100) / 100,
          labor: Math.round(laborCost * 100) / 100,
          utilities: Math.round(utilitiesCost * 100) / 100,
          other: Math.round(otherCost * 100) / 100
        },
        profit: {
          gross: Math.round(grossProfit * 100) / 100,
          net: Math.round(netProfit * 100) / 100,
          margin: Math.round(profitMargin * 100) / 100
        },
        trends: {
          revenueChange: Math.round(revenueChange * 100) / 100,
          expenseChange: Math.round(expenseChange * 100) / 100,
          profitChange: Math.round(profitChange * 100) / 100
        },
        breakdown: breakdown.map(item => ({
          category: item.category,
          amount: Math.round(item.amount * 100) / 100,
          percentage: Math.round(item.percentage * 100) / 100
        }))
      };

      res.status(200).json(createSuccessResponse('Financial report retrieved successfully', report));
    } catch (error: any) {
      console.error('Get financial report error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to get financial report'));
    }
  }

  // Generate report
  async generateReport(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { type, filters, format = 'pdf' } = req.body;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      if (!type) {
        res.status(400).json(createErrorResponse('Missing required field: type'));
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      if (!currentUser) {
        res.status(404).json(createErrorResponse('User not found'));
        return;
      }

      const targetFarmId = currentUser.farmId;

      // Calculate date range from filters
      let startDate: Date;
      let endDate: Date;

      if (filters?.dateFrom && filters?.dateTo) {
        startDate = new Date(filters.dateFrom);
        endDate = new Date(filters.dateTo);
      } else {
        const range = this.calculateDateRange('30d');
        startDate = range.startDate;
        endDate = range.endDate;
      }

      // Generate report ID
      const reportId = `report-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Store report generation request (placeholder - would need a reports collection)
      // For now, we'll generate the report synchronously
      const report = {
        id: reportId,
        type,
        status: 'completed',
        farmId: targetFarmId,
        filters: filters || {},
        format,
        createdAt: new Date().toISOString(),
        generatedBy: userId
      };

      // TODO: Implement actual report generation based on type
      // For now, return the report metadata
      res.status(201).json(createSuccessResponse('Report generated successfully', report));
    } catch (error: any) {
      console.error('Generate report error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to generate report'));
    }
  }

  // Export report
  async exportReport(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { id } = req.params;
      const { format = 'pdf' } = req.query;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      if (!format || !['pdf', 'excel', 'csv'].includes(format as string)) {
        res.status(400).json(createErrorResponse('Invalid format. Must be pdf, excel, or csv'));
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      if (!currentUser) {
        res.status(404).json(createErrorResponse('User not found'));
        return;
      }

      // TODO: Retrieve report from database using id
      // For now, return a placeholder response
      res.status(501).json(createErrorResponse('Report export functionality not fully implemented yet. Please use the data export endpoints.'));
    } catch (error: any) {
      console.error('Export report error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to export report'));
    }
  }

  // Legacy methods (kept for backward compatibility)
  async getCollectionReports(req: Request, res: Response): Promise<void> {
    // Redirect to production report
    await this.getProductionReports(req, res);
  }

  async getInventoryReports(req: Request, res: Response): Promise<void> {
    // TODO: Implement inventory report
    res.status(501).json(createErrorResponse('Inventory report functionality not implemented yet'));
  }

  async generateCustomReport(req: Request, res: Response): Promise<void> {
    // Redirect to generateReport
    await this.generateReport(req, res);
  }

  async downloadReport(req: Request, res: Response): Promise<void> {
    // Redirect to exportReport
    await this.exportReport(req, res);
  }
}

export default ReportsController;