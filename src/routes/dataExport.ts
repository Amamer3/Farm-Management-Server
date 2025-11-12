import { Router } from 'express';
import { DataExportController } from '../controllers/dataExportController';
import authMiddleware from '../middleware/auth';
import { 
  collectionValidations, 
  birdValidations, 
  feedValidations,
  reportValidations 
} from '../middleware/enhancedValidation';

const router = Router();
const dataExportController = new DataExportController();

// Apply authentication to all routes
router.use(authMiddleware.authenticateToken);
 
// Export egg collections
router.post('/collections/pdf', 
  reportValidations.generation,
  dataExportController.exportCollectionsToPDF.bind(dataExportController)
);

router.post('/collections/csv', 
  reportValidations.generation,
  dataExportController.exportCollectionsToCSV.bind(dataExportController)
);

// Export birds data
router.post('/birds', 
  birdValidations.creation,
  dataExportController.exportBirdsData.bind(dataExportController)
);

// Export feed inventory
router.post('/feed', 
  feedValidations.creation,
  dataExportController.exportFeedInventory.bind(dataExportController)
);

// Export comprehensive farm report
router.post('/farm-report', 
  reportValidations.generation,
  dataExportController.exportFarmReport.bind(dataExportController)
);

export default router;
