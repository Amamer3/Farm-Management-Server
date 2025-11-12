import { Router } from 'express';
import { DataBackupController } from '../controllers/dataBackupController';
import authMiddleware from '../middleware/auth';

const router = Router();
const dataBackupController = new DataBackupController();

// Apply authentication to all routes
router.use(authMiddleware.authenticateToken);

// Create backup 
router.post('/create', dataBackupController.createBackup.bind(dataBackupController));

// Restore backup
router.post('/restore', dataBackupController.restoreBackup.bind(dataBackupController));

// List backups
router.get('/list', dataBackupController.listBackups.bind(dataBackupController));

// Download backup
router.get('/download/:backupId', dataBackupController.downloadBackup.bind(dataBackupController));

// Delete backup
router.delete('/:backupId', dataBackupController.deleteBackup.bind(dataBackupController));

export default router;
