import express from 'express';
import { DashboardController } from '../controllers/dashboardController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { UserRole } from '../models/types';

const router = express.Router();
const dashboardController = new DashboardController();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Dashboard overview data
router.get('/overview', dashboardController.getOverview.bind(dashboardController));

// Recent activity feed
router.get('/recent-activity', dashboardController.getRecentActivity.bind(dashboardController));
router.get('/activity', dashboardController.getRecentActivity.bind(dashboardController)); // Alias for frontend compatibility

// Performance metrics
router.get('/performance', dashboardController.getPerformance.bind(dashboardController));

// System alerts
router.get('/alerts', dashboardController.getAlerts.bind(dashboardController));

// User notifications
router.get('/notifications', dashboardController.getNotifications.bind(dashboardController));

// Mark notification as read
router.put('/notifications/:id/read', dashboardController.markNotificationAsRead.bind(dashboardController));

export default router;