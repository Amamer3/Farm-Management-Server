import express from 'express';
import { UserController } from '../controllers/userController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { validateUserCreation, validateUserUpdate } from '../middleware/validation';
import { UserRole } from '../models/types';

const router = express.Router();
const userController = new UserController();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// User management routes (admin and manager access)
router.get('/stats', requireRole(UserRole.MANAGER, UserRole.ADMIN), userController.getUserStats.bind(userController));
router.get('/', requireRole(UserRole.MANAGER, UserRole.ADMIN), userController.getUsers.bind(userController));
router.get('/:id', requireRole(UserRole.MANAGER, UserRole.ADMIN), userController.getUserById.bind(userController));
router.post('/', requireRole(UserRole.MANAGER, UserRole.ADMIN), validateUserCreation, userController.createUser.bind(userController));
router.put('/:id', requireRole(UserRole.MANAGER, UserRole.ADMIN), validateUserUpdate, userController.updateUser.bind(userController));
router.put('/:id/role', requireRole(UserRole.ADMIN), userController.updateUserRole.bind(userController));
router.patch('/:id/deactivate', requireRole(UserRole.MANAGER, UserRole.ADMIN), userController.deactivateUser.bind(userController));
router.patch('/:id/reactivate', requireRole(UserRole.MANAGER, UserRole.ADMIN), userController.reactivateUser.bind(userController));

// Profile management (accessible by authenticated users)
router.get('/profile', userController.getCurrentUserProfile.bind(userController));
router.put('/profile', validateUserUpdate, userController.updateCurrentUserProfile.bind(userController));

// Super admin only routes
router.delete('/:id', requireRole(UserRole.ADMIN), userController.deleteUser.bind(userController));
router.post('/bulk-import', requireRole(UserRole.ADMIN), userController.bulkImportUsers.bind(userController));
router.get('/audit/logs', requireRole(UserRole.ADMIN), userController.getUserAuditLogs.bind(userController));

export default router;