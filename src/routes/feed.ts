import express from 'express';
import { FeedController } from '../controllers/feedController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { validateFeedCreation, validateFeedConsumption } from '../middleware/validation';
import { UserRole } from '../models/types';

const router = express.Router();
const feedController = new FeedController();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Feed inventory management routes
router.get('/', feedController.getFeedInventory.bind(feedController));
router.get('/stats', feedController.getFeedStats.bind(feedController));
router.get('/low-stock', feedController.getLowStockAlerts.bind(feedController));
router.get('/suppliers', feedController.getFeedSuppliers.bind(feedController));

// Feed usage tracking (new endpoints - must come before /:id routes)
router.post('/usage', feedController.recordFeedUsage.bind(feedController));
router.get('/usage', feedController.getFeedUsageHistory.bind(feedController));

// Feed consumption tracking (legacy endpoints)
router.post('/consumption', validateFeedConsumption, feedController.recordFeedConsumption.bind(feedController));
router.get('/consumption/history', feedController.getFeedConsumptionHistory.bind(feedController));

// Feed item routes (must come after specific routes)
router.post('/', validateFeedCreation, feedController.addFeed.bind(feedController)); // Workers can add feed
router.post('/:id/reorder', requireRole(UserRole.MANAGER, UserRole.ADMIN), feedController.createFeedReorder.bind(feedController));
router.get('/:id', feedController.getFeedById.bind(feedController));
router.put('/:id', requireRole(UserRole.MANAGER, UserRole.ADMIN), validateFeedCreation, feedController.updateFeed.bind(feedController)); // Only managers/admins can edit
router.delete('/:id', requireRole(UserRole.MANAGER, UserRole.ADMIN), feedController.deleteFeed.bind(feedController)); // Only managers/admins can delete

// Analytics and reporting
router.get('/analytics/usage-trends', feedController.getFeedUsageTrends.bind(feedController));
router.get('/analytics/cost-analysis', feedController.getFeedCostAnalysis.bind(feedController));
router.get('/analytics/efficiency', feedController.getFeedEfficiencyMetrics.bind(feedController));

// Statistics endpoint for frontend compatibility
router.get('/stats', feedController.getFeedStats.bind(feedController));

export default router;