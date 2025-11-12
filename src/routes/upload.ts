import express from 'express';
import { UploadController } from '../controllers/uploadController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { uploadRateLimit } from '../middleware/rateLimiter';
import { UserRole } from '../models/types';

const router = express.Router();
const uploadController = new UploadController();

// Apply authentication and rate limiting to all routes
router.use(authenticateToken);
router.use(uploadRateLimit);

// Image upload endpoint
router.post('/image', uploadController.uploadImage.bind(uploadController));

// Document upload endpoint
router.post('/document', uploadController.uploadDocument.bind(uploadController));

// Delete uploaded file (admin/manager only)
router.delete('/:fileId', requireRole(UserRole.MANAGER, UserRole.ADMIN), uploadController.deleteFile.bind(uploadController));

export default router;