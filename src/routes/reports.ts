import express from 'express';
import { ReportsController } from '../controllers/reportController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { validateReportGeneration } from '../middleware/validation';
import { UserRole } from '../models/types';

const router = express.Router();
const reportsController = new ReportsController();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Dashboard statistics for reports page
router.get('/dashboard', reportsController.getDashboardReports.bind(reportsController));

// Production report
router.get('/production', reportsController.getProductionReports.bind(reportsController));

// Health report
router.get('/health', reportsController.getHealthReports.bind(reportsController));

// Feed consumption report
router.get('/feed-consumption', reportsController.getFeedConsumptionReport.bind(reportsController));

// Financial reports (managers/admins only)
router.get('/financial', requireRole(UserRole.MANAGER, UserRole.ADMIN), reportsController.getFinancialReports.bind(reportsController));

// Generate report
router.post('/generate', requireRole(UserRole.MANAGER, UserRole.ADMIN), validateReportGeneration, reportsController.generateReport.bind(reportsController));

// Export report
router.get('/:id/export', reportsController.exportReport.bind(reportsController));

// Legacy endpoints (for backward compatibility)
router.get('/collections', reportsController.getCollectionReports.bind(reportsController));
router.get('/inventory', reportsController.getInventoryReports.bind(reportsController));
router.post('/custom', requireRole(UserRole.MANAGER, UserRole.ADMIN), validateReportGeneration, reportsController.generateCustomReport.bind(reportsController));
router.get('/:id/download', reportsController.downloadReport.bind(reportsController));

export default router;