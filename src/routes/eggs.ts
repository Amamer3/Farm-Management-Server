import express from 'express';
import { CollectionController } from '../controllers/collectionController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { validateEggCollection } from '../middleware/validation';
import { UserRole } from '../models/types';

const router = express.Router();
const collectionController = new CollectionController();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Egg collection routes (aliases for /api/collections)
router.get('/', collectionController.getCollections.bind(collectionController));
router.get('/stats', collectionController.getEggStats.bind(collectionController));
router.get('/production-chart', collectionController.getProductionChart.bind(collectionController));
router.post('/', validateEggCollection, collectionController.createCollection.bind(collectionController)); // Workers can add eggs
router.get('/:id', collectionController.getCollectionById.bind(collectionController));
router.put('/:id', requireRole(UserRole.MANAGER, UserRole.ADMIN), validateEggCollection, collectionController.updateCollection.bind(collectionController)); // Only managers/admins can edit
router.delete('/:id', requireRole(UserRole.MANAGER, UserRole.ADMIN), collectionController.deleteCollection.bind(collectionController)); // Only managers/admins can delete

export default router;