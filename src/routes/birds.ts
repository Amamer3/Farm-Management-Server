import express from 'express';
import { BirdController } from '../controllers/birdController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { validateBirdCreation, validateBirdUpdate } from '../middleware/validation';
import { UserRole } from '../models/types';

const router = express.Router();
const birdController = new BirdController();

// Apply authentication middleware to all routes
router.use(authenticateToken); 

// Bird management routes
router.get('/', birdController.getBirds.bind(birdController));
router.get('/statistics', birdController.getBirdStats.bind(birdController));
router.get('/stats', birdController.getBirdStats.bind(birdController)); // Alias for frontend compatibility
router.get('/:id', birdController.getBirdById.bind(birdController));
router.post('/', validateBirdCreation, birdController.createBird.bind(birdController)); // Workers can add birds
router.put('/:id', requireRole(UserRole.MANAGER, UserRole.ADMIN), validateBirdUpdate, birdController.updateBird.bind(birdController)); // Only managers/admins can edit
router.delete('/:id', requireRole(UserRole.MANAGER, UserRole.ADMIN), birdController.deleteBird.bind(birdController)); // Only managers/admins can delete

// Pen management routes
router.get('/pens', birdController.getPens.bind(birdController));
router.post('/pens', requireRole(UserRole.MANAGER, UserRole.ADMIN), birdController.createPen.bind(birdController));
router.put('/pens/:id', requireRole(UserRole.MANAGER, UserRole.ADMIN), birdController.updatePen.bind(birdController));

// Health management routes
router.get('/health', birdController.getHealthOverview.bind(birdController));
router.post('/:id/health', requireRole(UserRole.MANAGER, UserRole.ADMIN), birdController.recordHealthCheck.bind(birdController));

// Bulk operations
router.patch('/bulk-update', requireRole(UserRole.MANAGER, UserRole.ADMIN), birdController.bulkUpdateBirds.bind(birdController));
router.post('/bulk-import', requireRole(UserRole.MANAGER, UserRole.ADMIN), birdController.bulkImportBirds.bind(birdController));

// Health and status tracking
router.patch('/:id/health-status', requireRole(UserRole.MANAGER, UserRole.ADMIN), birdController.updateHealthStatus.bind(birdController));
router.get('/:id/health-history', birdController.getHealthHistory.bind(birdController));
router.get('/health/alerts', birdController.getHealthAlerts.bind(birdController));

// Production tracking
router.get('/:id/production-history', birdController.getProductionHistory.bind(birdController));
router.get('/production/summary', birdController.getProductionSummary.bind(birdController));

export default router;