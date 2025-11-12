import express from 'express';
import { CollectionController } from '../controllers/collectionController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { validateEggCollection } from '../middleware/validation';
import { UserRole } from '../models/types';

const router = express.Router();
const collectionController = new CollectionController();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Collection management routes
router.get('/', collectionController.getCollections.bind(collectionController));
router.get('/stats', collectionController.getEggStats.bind(collectionController));
router.get('/production-chart', collectionController.getProductionChart.bind(collectionController));
router.get('/search', collectionController.searchCollections.bind(collectionController));
router.get('/export', collectionController.exportCollections.bind(collectionController));
router.get('/daily-summary', collectionController.getDailySummary.bind(collectionController));
router.post('/', validateEggCollection, collectionController.createCollection.bind(collectionController)); // Workers can add eggs
router.get('/:id', collectionController.getCollectionById.bind(collectionController));
router.put('/:id', requireRole(UserRole.MANAGER, UserRole.ADMIN), validateEggCollection, collectionController.updateCollection.bind(collectionController)); // Only managers/admins can edit
router.delete('/:id', requireRole(UserRole.MANAGER, UserRole.ADMIN), collectionController.deleteCollection.bind(collectionController)); // Only managers/admins can delete

// Analytics and reporting
router.get('/analytics/trends', collectionController.getProductionTrends.bind(collectionController));
router.get('/analytics/summary', collectionController.getCollectionSummary.bind(collectionController));
router.get('/analytics/performance', collectionController.getPerformanceMetrics.bind(collectionController));

export default router;