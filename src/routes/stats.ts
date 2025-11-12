import express from 'express';
import { StatsController } from '../controllers/statsController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { validateDateRange } from '../middleware/validation';
import { UserRole } from '../models/types';

const router = express.Router();
const statsController = new StatsController();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Dashboard statistics
router.get('/dashboard', statsController.getDashboardStats.bind(statsController));
router.get('/daily', statsController.getDailyStats.bind(statsController));
router.get('/weekly', statsController.getWeeklyStats.bind(statsController));
router.get('/monthly', statsController.getMonthlyStats.bind(statsController));
router.get('/trends', statsController.getTrends.bind(statsController));
 
// Trends & Analysis
router.get('/eggs/grade-distribution', statsController.getGradeDistribution.bind(statsController));
router.get('/grade-distribution', statsController.getGradeDistribution.bind(statsController)); // Alias for frontend
router.get('/pens/performance', statsController.getPenPerformance.bind(statsController));
router.get('/pen-performance', statsController.getPenPerformance.bind(statsController)); // Alias for frontend
router.get('/collectors/performance', statsController.getCollectorPerformance.bind(statsController));

// Egg production statistics
router.get('/eggs/production', validateDateRange, statsController.getEggStats.bind(statsController));
router.get('/eggs/trends', validateDateRange, statsController.getProductionTrends.bind(statsController));
router.get('/eggs/daily-summary', statsController.getDailyProductionSummary.bind(statsController));
router.get('/eggs/monthly-summary', statsController.getMonthlyProductionSummary.bind(statsController));

// Financial statistics
router.get('/financial/summary', validateDateRange, statsController.getFinancialSummary.bind(statsController));
router.get('/financial/revenue-trends', validateDateRange, statsController.getRevenueTrends.bind(statsController));
router.get('/financial/cost-analysis', validateDateRange, statsController.getCostAnalysis.bind(statsController));
router.get('/financial/profit-margins', validateDateRange, statsController.getProfitMargins.bind(statsController));

// Performance metrics
router.get('/performance/overview', validateDateRange, statsController.getPerformanceMetrics.bind(statsController));
router.get('/performance/efficiency', validateDateRange, statsController.getEfficiencyMetrics.bind(statsController));
router.get('/performance/productivity', validateDateRange, statsController.getProductivityMetrics.bind(statsController));

// Comparative analysis
router.get('/comparative/period', validateDateRange, statsController.getComparativeAnalysis.bind(statsController));
router.get('/comparative/year-over-year', statsController.getYearOverYearComparison.bind(statsController));
router.get('/comparative/benchmarks', statsController.getBenchmarkComparison.bind(statsController));

// Report exports (admin/manager only)
router.post('/export/report', requireRole(UserRole.MANAGER, UserRole.ADMIN), statsController.exportReport.bind(statsController));
router.get('/export/templates', requireRole(UserRole.MANAGER, UserRole.ADMIN), statsController.getReportTemplates.bind(statsController));

export default router;