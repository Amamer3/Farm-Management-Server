import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { handleValidationErrors, validateUserRegistration } from '../middleware/validation';
import { authRateLimit } from '../middleware/rateLimiter';
import { UserRole } from '../models/types';

const router = Router();
const authController = new AuthController();

// Note: Preflight OPTIONS requests are handled by CORS middleware in app.ts
// No need for explicit OPTIONS route handler

// Public routes (no authentication required) - Apply strict rate limiting
router.post('/login', authRateLimit, authController.login.bind(authController));
// router.post('/refresh-token', authController.refreshToken.bind(authController));
// router.get('/verify-token', authController.verifyToken.bind(authController));

// Protected routes (authentication required)
router.use(authenticateToken); // Apply authentication middleware to all routes below

// Profile management
router.get('/profile', authController.getProfile.bind(authController));
router.put('/profile', authController.updateProfile.bind(authController));
router.post('/profile/avatar', authController.uploadAvatar.bind(authController));
router.delete('/profile/avatar', authController.deleteAvatar.bind(authController));
router.post('/change-password', authController.changePassword.bind(authController));
router.post('/logout', authController.logout.bind(authController));

// Admin only routes
router.post('/register', requireRole(UserRole.ADMIN), validateUserRegistration, authController.register.bind(authController));
// router.post('/revoke-token', requireRole(UserRole.ADMIN), authController.revokeToken.bind(authController));

export default router;