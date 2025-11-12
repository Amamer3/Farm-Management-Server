import express from 'express';
import { MedicineController } from '../controllers/medicineController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { validateMedicineCreation, validateMedicineUsage } from '../middleware/validation';
import { UserRole } from '../models/types';

const router = express.Router();
const medicineController = new MedicineController();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Medicine inventory management routes
router.get('/', medicineController.getMedicineInventory.bind(medicineController));
router.get('/stats', medicineController.getMedicineStats.bind(medicineController));
router.get('/expired', medicineController.getExpiredMedicineAlerts.bind(medicineController));
router.get('/expiry-alerts', medicineController.getExpiryAlerts.bind(medicineController));
router.post('/', validateMedicineCreation, medicineController.addMedicine.bind(medicineController)); // Workers can add medicine
router.get('/:id', medicineController.getMedicineById.bind(medicineController));
router.put('/:id', requireRole(UserRole.MANAGER, UserRole.ADMIN), validateMedicineCreation, medicineController.updateMedicine.bind(medicineController)); // Only managers/admins can edit
router.delete('/:id', requireRole(UserRole.MANAGER, UserRole.ADMIN), medicineController.deleteMedicine.bind(medicineController)); // Only managers/admins can delete

// Medicine usage tracking
router.post('/usage', validateMedicineUsage, medicineController.recordMedicineUsage.bind(medicineController));
router.get('/usage/history', medicineController.getMedicineUsageHistory.bind(medicineController));

// Health and treatment tracking
router.get('/treatments', medicineController.getTreatmentRecords.bind(medicineController));
router.post('/treatments', medicineController.recordNewTreatment.bind(medicineController)); // Workers can record treatments
router.get('/treatments/active', medicineController.getActiveTreatments.bind(medicineController));
router.get('/treatments/history', medicineController.getTreatmentHistory.bind(medicineController));

// Vaccination management
router.get('/vaccinations', medicineController.getVaccinationSchedule.bind(medicineController));
router.post('/vaccinations', requireRole(UserRole.MANAGER, UserRole.ADMIN), medicineController.scheduleVaccination.bind(medicineController));
router.post('/treatments/schedule', requireRole(UserRole.MANAGER, UserRole.ADMIN), medicineController.scheduleTreatment.bind(medicineController));

// Analytics and reporting
router.get('/analytics/usage-trends', medicineController.getMedicineUsageTrends.bind(medicineController));
router.get('/analytics/cost-analysis', medicineController.getMedicineCostAnalysis.bind(medicineController));
router.get('/analytics/effectiveness', medicineController.getTreatmentEffectiveness.bind(medicineController));

// Statistics endpoint is already defined above

export default router;