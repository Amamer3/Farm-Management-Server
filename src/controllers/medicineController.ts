import { Request, Response } from 'express';
import FirestoreService from '../services/firestoreService';
import { ApiResponse, MedicineInventory, CreateMedicineRequest, UpdateMedicineRequest, PaginatedResponse, UserRole, TreatmentRecord, CreateTreatmentRequest } from '../models/types';
import { createSuccessResponse, createErrorResponse } from '../utils/responseHelper';
import { Timestamp as FirestoreTimestamp } from 'firebase-admin/firestore';

const firestoreService = FirestoreService;

// Helper function to calculate medicine status based on stock levels
const calculateMedicineStatus = (stock: number, minimumStock?: number): 'In Stock' | 'Low Stock' | 'Out of Stock' => {
  if (stock <= 0) {
    return 'Out of Stock';
  }
  
  // Low stock threshold: 10 units or 20% of minimumStock (whichever is higher)
  const threshold = minimumStock ? Math.max(10, minimumStock * 0.2) : 10;
  
  if (stock < threshold) {
    return 'Low Stock';
  }
  
  return 'In Stock';
};

export class MedicineController {
  // Get all medicine inventory with pagination and filtering
  async getMedicineInventory(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { type, status, search, page = 1, limit = 50, farmId } = req.query;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      if (!currentUser) {
        res.status(404).json(createErrorResponse('User not found'));
        return;
      }

      const targetFarmId = (currentUser.role === UserRole.ADMIN && farmId) 
        ? farmId as string 
        : currentUser.farmId;

      // Get all medicine inventory for the farm
      const queryOptions: any = {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        farmId: targetFarmId
      };

      if (type) queryOptions.type = type as string;

      const medicineInventory = await firestoreService.getMedicineInventory(
        queryOptions,
        parseInt(page as string),
        parseInt(limit as string)
      );

      let medicines = medicineInventory.data || [];

      // Map legacy fields and calculate status
      medicines = medicines.map((item: any) => {
        const stock = item.stock || item.currentStock || 0;
        const name = item.name || item.medicineName || '';
        const calculatedStatus = calculateMedicineStatus(stock, item.minimumStock);
        
        return {
          ...item,
          name: name,
          stock: stock,
          status: item.status || calculatedStatus,
          // Map legacy fields for backward compatibility
          medicineName: item.medicineName || name,
          currentStock: item.currentStock || stock,
          costPerUnit: item.costPerUnit || item.unitPrice,
          unitPrice: item.unitPrice || item.costPerUnit
        };
      });

      // Apply type filter
      if (type) {
        const typeLower = (type as string).toLowerCase();
        medicines = medicines.filter((item: any) => {
          const itemType = (item.type || '').toLowerCase();
          return itemType === typeLower;
        });
      }

      // Apply status filter
      if (status) {
        medicines = medicines.filter((item: any) => item.status === status);
      }

      // Apply search filter (searches name)
      if (search) {
        const searchLower = (search as string).toLowerCase();
        medicines = medicines.filter((item: any) => {
          const itemName = (item.name || item.medicineName || '').toLowerCase();
          return itemName.includes(searchLower);
        });
      }

      // Apply pagination
      const total = medicines.length;
      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const offset = (pageNum - 1) * limitNum;
      const paginatedMedicines = medicines.slice(offset, offset + limitNum);

      res.status(200).json(createSuccessResponse('Medicine inventory retrieved successfully', {
        data: paginatedMedicines,
        total,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
          hasNext: offset + limitNum < total,
          hasPrev: pageNum > 1
        }
      }));
    } catch (error: any) {
      console.error('Get medicine inventory error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to get medicine inventory'));
    }
  }

  // Get medicine item by ID
  async getMedicineById(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { id } = req.params;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      const medicineItem = await firestoreService.getMedicineById(id);
      
      if (!currentUser || !medicineItem) {
        res.status(404).json(createErrorResponse('Medicine item not found'));
        return;
      }

      // Check if user can access this medicine item (same farm or super admin)
      if (currentUser.role !== UserRole.ADMIN && currentUser.farmId !== medicineItem.farmId) {
        res.status(403).json(createErrorResponse('Access denied to view this medicine item'));
        return;
      }

      res.status(200).json(createSuccessResponse(medicineItem, 'Medicine item retrieved successfully'));
    } catch (error: any) {
      console.error('Get medicine by ID error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to get medicine item'));
    }
  }

  // Add new medicine to inventory
  async addMedicine(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const medicineData: CreateMedicineRequest = req.body;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      // Validate required fields
      if (!medicineData.name || !medicineData.type || !medicineData.supplier || !medicineData.quantity || !medicineData.unit || !medicineData.expiryDate) {
        res.status(400).json(createErrorResponse('Missing required fields: name, type, supplier, quantity, unit, expiryDate'));
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      if (!currentUser) {
        res.status(404).json(createErrorResponse('User not found'));
        return;
      }

      // Set farmId based on user role (workers can add medicine)
      const farmId = currentUser.role === UserRole.ADMIN && medicineData.farmId 
        ? medicineData.farmId 
        : currentUser.farmId;

      const stock = medicineData.quantity || medicineData.currentStock || 0;
      const calculatedStatus = calculateMedicineStatus(stock, medicineData.minimumStock);

      const newMedicineData: Omit<MedicineInventory, 'id'> = {
        name: medicineData.name || medicineData.medicineName || '',
        type: medicineData.type,
        supplier: medicineData.supplier,
        stock: stock,
        unit: medicineData.unit,
        status: calculatedStatus,
        expiryDate: medicineData.expiryDate,
        usage: medicineData.usage,
        costPerUnit: medicineData.costPerUnit || medicineData.unitPrice,
        location: medicineData.location,
        batchNumber: medicineData.batchNumber,
        notes: medicineData.notes,
        farmId,
        // Legacy fields for backward compatibility
        medicineName: medicineData.name || medicineData.medicineName || '',
        currentStock: stock,
        unitPrice: medicineData.costPerUnit || medicineData.unitPrice,
        minimumStock: medicineData.minimumStock,
        createdAt: FirestoreTimestamp.now(),
        updatedAt: FirestoreTimestamp.now()
      };

      const newMedicineId = await firestoreService.addMedicine(newMedicineData);
      const createdMedicine = await firestoreService.getMedicineById(newMedicineId);

      res.status(201).json(createSuccessResponse('Medicine added successfully', createdMedicine));
    } catch (error: any) {
      console.error('Add medicine error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to add medicine'));
    }
  }

  // Update medicine inventory
  async updateMedicine(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { id } = req.params;
      const updateData: UpdateMedicineRequest = req.body;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      const medicineItem = await firestoreService.getMedicineById(id);
      
      if (!currentUser || !medicineItem) {
        res.status(404).json(createErrorResponse('Medicine item not found'));
        return;
      }

      // Check permissions (only managers and admins can edit)
      const canUpdate = currentUser.role === UserRole.ADMIN ||
                       (currentUser.role === UserRole.MANAGER && currentUser.farmId === medicineItem.farmId);

      if (!canUpdate) {
        res.status(403).json(createErrorResponse('Access denied to update this medicine item'));
        return;
      }

      // Prepare update fields
      const updateFields: any = {};
      
      if (updateData.name !== undefined) {
        updateFields.name = updateData.name;
        updateFields.medicineName = updateData.name; // Legacy field
      }
      if (updateData.type !== undefined) updateFields.type = updateData.type;
      if (updateData.supplier !== undefined) updateFields.supplier = updateData.supplier;
      if (updateData.stock !== undefined) {
        updateFields.stock = updateData.stock;
        updateFields.currentStock = updateData.stock; // Legacy field
      }
      if (updateData.quantity !== undefined) {
        updateFields.stock = updateData.quantity;
        updateFields.currentStock = updateData.quantity; // Legacy field
      }
      if (updateData.unit !== undefined) updateFields.unit = updateData.unit;
      if (updateData.expiryDate !== undefined) updateFields.expiryDate = updateData.expiryDate;
      if (updateData.usage !== undefined) updateFields.usage = updateData.usage;
      if (updateData.costPerUnit !== undefined) {
        updateFields.costPerUnit = updateData.costPerUnit;
        updateFields.unitPrice = updateData.costPerUnit; // Legacy field
      }
      if (updateData.location !== undefined) updateFields.location = updateData.location;
      if (updateData.batchNumber !== undefined) updateFields.batchNumber = updateData.batchNumber;
      if (updateData.notes !== undefined) updateFields.notes = updateData.notes;

      // Recalculate status if stock changed
      const finalStock = updateFields.stock !== undefined ? updateFields.stock : (medicineItem.stock || medicineItem.currentStock || 0);
      const minimumStock = medicineItem.minimumStock;
      updateFields.status = calculateMedicineStatus(finalStock, minimumStock);

      // Update medicine in Firestore
      await firestoreService.updateMedicine(id, {
        ...updateFields,
        updatedAt: FirestoreTimestamp.now()
      });

      // Get the updated medicine data
      const updatedMedicine = await firestoreService.getMedicineById(id);

      res.status(200).json(createSuccessResponse('Medicine updated successfully', updatedMedicine));
    } catch (error: any) {
      console.error('Update medicine error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to update medicine'));
    }
  }

  // Delete medicine from inventory
  async deleteMedicine(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { id } = req.params;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      const medicineItem = await firestoreService.getMedicineById(id);
      
      if (!currentUser || !medicineItem) {
        res.status(404).json(createErrorResponse('Medicine item not found'));
        return;
      }

      // Only farm managers and super admins can delete medicine
      if (currentUser.role !== UserRole.MANAGER && currentUser.role !== UserRole.ADMIN) {
        res.status(403).json(createErrorResponse('Insufficient permissions to delete medicine'));
        return;
      }

      // Check if user can delete this medicine item (same farm or super admin)
      if (currentUser.role !== UserRole.ADMIN && currentUser.farmId !== medicineItem.farmId) {
        res.status(403).json(createErrorResponse('Access denied to delete this medicine item'));
        return;
      }

      await firestoreService.deleteMedicine(id);

      res.status(200).json(createSuccessResponse('Medicine deleted from inventory successfully'));
    } catch (error: any) {
      console.error('Delete medicine error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to delete medicine'));
    }
  }

  // Get expired medicine alerts
  async getExpiredMedicineAlerts(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { farmId } = req.query;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      if (!currentUser) {
        res.status(404).json(createErrorResponse('User not found'));
        return;
      }

      // Determine which farm to get alerts for
      const targetFarmId = currentUser.role === UserRole.ADMIN && farmId 
        ? farmId as string 
        : currentUser.farmId;

      const expiredMedicine = await firestoreService.getExpiredMedicine(targetFarmId);

      res.status(200).json(createSuccessResponse(expiredMedicine, 'Expired medicine alerts retrieved successfully'));
    } catch (error: any) {
      console.error('Get expired medicine alerts error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to get expired medicine alerts'));
    }
  }

  // Record medicine usage
  async recordMedicineUsage(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { medicineId, quantityUsed, birdIds, treatmentReason, notes } = req.body;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      const medicineItem = await firestoreService.getMedicineById(medicineId);
      
      if (!currentUser || !medicineItem) {
        res.status(404).json(createErrorResponse('Medicine item not found'));
        return;
      }

      // Check if user can record usage for this medicine (same farm or super admin)
      if (currentUser.role !== UserRole.ADMIN && currentUser.farmId !== medicineItem.farmId) {
        res.status(403).json(createErrorResponse('Access denied to record usage for this medicine'));
        return;
      }

      // Check if there's enough stock
      if (medicineItem.currentStock < quantityUsed) {
        res.status(400).json(createErrorResponse('Insufficient stock for this usage'));
        return;
      }

      // Record usage and update stock
      await firestoreService.recordMedicineUsage({
        medicineId,
        quantityUsed,
        birdIds: birdIds || [],
        treatmentReason,
        administeredBy: userId,
        administeredAt: FirestoreTimestamp.now(),
        notes,
        farmId: medicineItem.farmId
      });

      // Update medicine stock
      const newStock = medicineItem.currentStock - quantityUsed;
      await firestoreService.updateMedicine(medicineId, {
        currentStock: newStock,
        updatedAt: FirestoreTimestamp.now()
      });

      res.status(200).json(createSuccessResponse('Medicine usage recorded successfully', { newStock }));
    } catch (error: any) {
      console.error('Record medicine usage error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to record medicine usage'));
    }
  }

  // Get medicine usage history
  async getMedicineUsageHistory(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { farmId, medicineId, birdId, startDate, endDate, page = 1, limit = 10 } = req.query;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      if (!currentUser) {
        res.status(404).json(createErrorResponse('User not found'));
        return;
      }

      // Determine which farm to get history for
      const targetFarmId = currentUser.role === UserRole.ADMIN && farmId 
        ? farmId as string 
        : currentUser.farmId;

      const filters: any = { farmId: targetFarmId };
      if (medicineId) filters.medicineId = medicineId as string;
      if (birdId) filters.birdId = birdId as string;
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);

      const usageHistory = await firestoreService.getMedicineUsageHistory(
        filters,
        parseInt(page as string),
        parseInt(limit as string)
      );

      res.status(200).json(createSuccessResponse(usageHistory, 'Medicine usage history retrieved successfully'));
    } catch (error: any) {
      console.error('Get medicine usage history error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to get medicine usage history'));
    }
  }

  // Get medicine expiry alerts (medicines expiring soon)
  async getExpiryAlerts(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { farmId, daysAhead = 30 } = req.query;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      if (!currentUser) {
        res.status(404).json(createErrorResponse('User not found'));
        return;
      }

      // Determine which farm to get alerts for
      const targetFarmId = currentUser.role === UserRole.ADMIN && farmId 
        ? farmId as string 
        : currentUser.farmId;

      const expiringMedicine = await firestoreService.getMedicineExpiringIn(
        parseInt(daysAhead as string, 10)
      );

      res.status(200).json(createSuccessResponse(expiringMedicine, 'Medicine expiry alerts retrieved successfully'));
    } catch (error: any) {
      console.error('Get medicine expiry alerts error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to get medicine expiry alerts'));
     }
   }

  async getMedicineCostAnalysis(req: Request, res: Response): Promise<void> {
    // TODO: Implement medicine cost analysis functionality
    const response = createErrorResponse('Medicine cost analysis functionality not implemented yet');
    res.status(501).json(response);
  }

  async getTreatmentEffectiveness(req: Request, res: Response): Promise<void> {
    // TODO: Implement treatment effectiveness functionality
    const response = createErrorResponse('Treatment effectiveness functionality not implemented yet');
    res.status(501).json(response);
  }

  async scheduleTreatment(req: Request, res: Response): Promise<void> {
    // TODO: Implement schedule treatment functionality
    const response = createErrorResponse('Schedule treatment functionality not implemented yet');
    res.status(501).json(response);
  }

  async getMedicineUsageTrends(req: Request, res: Response): Promise<void> {
    // TODO: Implement medicine usage trends functionality
    const response = createErrorResponse('Medicine usage trends functionality not implemented yet');
    res.status(501).json(response);
  }

  async getActiveTreatments(req: Request, res: Response): Promise<void> {
    // TODO: Implement active treatments functionality
    const response = createErrorResponse('Active treatments functionality not implemented yet');
    res.status(501).json(response);
  }

  async getTreatmentHistory(req: Request, res: Response): Promise<void> {
    // TODO: Implement treatment history functionality
    const response = createErrorResponse('Treatment history functionality not implemented yet');
    res.status(501).json(response);
  }

  // Get treatment history
  async getTreatmentRecords(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { birdGroup, medicine, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      if (!currentUser) {
        res.status(404).json(createErrorResponse('User not found'));
        return;
      }

      const targetFarmId = currentUser.farmId;
      
      // If user doesn't have a farmId, return empty results
      if (!targetFarmId || targetFarmId.trim() === '') {
        res.status(200).json(createSuccessResponse('Treatment history retrieved successfully', {
          data: [],
          total: 0,
          pagination: {
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            total: 0,
            totalPages: 0,
            hasNext: false,
            hasPrev: false
          }
        }));
        return;
      }

      // Get treatment history from medicine usage
      // Build query options for getMedicineUsageHistory
      const queryOptions: any = { farmId: targetFarmId };
      if (dateFrom) {
        try {
          queryOptions.startDate = new Date(dateFrom as string);
        } catch (e) {
          // Invalid date, ignore
          console.error('Invalid dateFrom:', dateFrom, e);
        }
      }
      if (dateTo) {
        try {
          queryOptions.endDate = new Date(dateTo as string);
        } catch (e) {
          // Invalid date, ignore
          console.error('Invalid dateTo:', dateTo, e);
        }
      }
      if (medicine) {
        queryOptions.medicineId = medicine as string;
      }

      let usageHistoryResponse;
      try {
        console.log('[MEDICINE] getTreatmentRecords - calling getMedicineUsageHistory', {
          queryOptions,
          page: parseInt(page as string),
          limit: parseInt(limit as string)
        });
        usageHistoryResponse = await firestoreService.getMedicineUsageHistory(
          queryOptions,
          parseInt(page as string),
          parseInt(limit as string)
        );
        console.log('[MEDICINE] getTreatmentRecords - getMedicineUsageHistory response', {
          success: usageHistoryResponse?.success,
          dataCount: usageHistoryResponse?.data?.length || 0
        });
      } catch (error: any) {
        // If the collection doesn't exist or there's an error, return empty results
        console.error('[MEDICINE] Error getting medicine usage history:', error);
        console.error('[MEDICINE] Error stack:', error?.stack);
        console.error('[MEDICINE] Query options used:', queryOptions);
        usageHistoryResponse = {
          success: true,
          data: [],
          pagination: {
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            total: 0,
            totalPages: 0,
            hasNext: false,
            hasPrev: false
          }
        };
      }

      let treatments = usageHistoryResponse?.data || [];

      // Filter by birdGroup if provided
      if (birdGroup) {
        try {
          treatments = treatments.filter((treatment: any) => {
            const group = treatment.birdGroup || treatment.birdGroupId || treatment.penId || '';
            return group.toLowerCase().includes((birdGroup as string).toLowerCase());
          });
        } catch (error: any) {
          console.error('Error filtering by birdGroup:', error);
          // Continue with all treatments if filter fails
        }
      }

      // Map to treatment record format with legacy field support
      let treatmentRecords: any[] = [];
      try {
        console.log('[MEDICINE] getTreatmentRecords - mapping treatments', { 
          treatmentCount: treatments.length 
        });
        
        treatmentRecords = treatments.map((usage: any, index: number) => {
          try {
            // Get medicine name if available (don't fetch from DB, just use what's in the record)
            const medicineName = usage.medicineName || usage.medicine?.name || usage.medicine?.medicineName || 'Unknown';
            
            // Safely get date
            let dateStr = new Date().toISOString().split('T')[0];
            try {
              if (usage.date) {
                dateStr = typeof usage.date === 'string' ? usage.date : usage.date.toISOString().split('T')[0];
              } else if (usage.administeredDate) {
                dateStr = typeof usage.administeredDate === 'string' ? usage.administeredDate : usage.administeredDate.toISOString().split('T')[0];
              } else if (usage.administeredAt?.toDate) {
                dateStr = usage.administeredAt.toDate().toISOString().split('T')[0];
              } else if (usage.administeredAt?.toMillis) {
                dateStr = new Date(usage.administeredAt.toMillis()).toISOString().split('T')[0];
              } else if (usage.administeredAt?.seconds) {
                dateStr = new Date(usage.administeredAt.seconds * 1000).toISOString().split('T')[0];
              } else if (usage.administeredAt && typeof usage.administeredAt === 'string') {
                dateStr = usage.administeredAt.split('T')[0];
              }
            } catch (e) {
              console.warn('[MEDICINE] Error parsing date for treatment record', { 
                index, 
                error: e,
                administeredAt: usage.administeredAt 
              });
              // Use default date if parsing fails
            }
            
            return {
              id: usage.id || `temp_${index}`,
              medicineId: usage.medicineId || usage.medicine?.id || '',
              birdGroup: usage.birdGroup || usage.birdGroupId || usage.penId || '',
              dosage: usage.dosage || usage.quantityUsed || '',
              administeredBy: usage.administeredBy || usage.usedBy || usage.adminBy || usage.userId || '',
              date: dateStr,
              reason: usage.reason || usage.treatmentReason || usage.notes || '',
              outcome: usage.outcome || '',
              farmId: usage.farmId || targetFarmId,
              createdAt: usage.createdAt,
              // Legacy/alternative field names
              birdGroupId: usage.birdGroup || usage.birdGroupId || usage.penId || '',
              treatment: medicineName,
              medicineName: medicineName,
              usedBy: usage.administeredBy || usage.usedBy || usage.adminBy || '',
              adminBy: usage.administeredBy || usage.adminBy || ''
            };
          } catch (error: any) {
            console.error('[MEDICINE] Error mapping treatment record:', { 
              error: error.message,
              errorStack: error.stack,
              usageId: usage.id,
              usageMedicineId: usage.medicineId,
              index
            });
            return null;
          }
        }).filter((record: any) => record !== null);
        
        console.log('[MEDICINE] getTreatmentRecords - mapping complete', { 
          originalCount: treatments.length,
          mappedCount: treatmentRecords.length 
        });
      } catch (error: any) {
        console.error('[MEDICINE] Error mapping treatment records:', error);
        console.error('[MEDICINE] Error stack:', error?.stack);
        treatmentRecords = [];
      }

      // Apply pagination
      const total = treatmentRecords.length;
      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const offset = (pageNum - 1) * limitNum;
      const paginatedTreatments = treatmentRecords.slice(offset, offset + limitNum);

      res.status(200).json(createSuccessResponse('Treatment history retrieved successfully', {
        data: paginatedTreatments,
        total,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
          hasNext: offset + limitNum < total,
          hasPrev: pageNum > 1
        }
      }));
    } catch (error: any) {
      console.error('[MEDICINE] Get treatment records error:', error);
      console.error('[MEDICINE] Error stack:', error?.stack);
      console.error('[MEDICINE] Error details:', {
        message: error?.message,
        name: error?.name,
        code: error?.code,
        userId: (req as any).user?.uid
      });
      res.status(500).json(createErrorResponse(error.message || 'Failed to get treatment history'));
    }
  }

  // Record new treatment
  async recordNewTreatment(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const treatmentData: CreateTreatmentRequest = req.body;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      // Validate required fields
      if (!treatmentData.medicineId || !treatmentData.birdGroup || !treatmentData.dosage || !treatmentData.administeredBy || !treatmentData.date || !treatmentData.reason) {
        res.status(400).json(createErrorResponse('Missing required fields: medicineId, birdGroup, dosage, administeredBy, date, reason'));
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      const medicineItem = await firestoreService.getMedicineById(treatmentData.medicineId);
      
      if (!currentUser || !medicineItem) {
        res.status(404).json(createErrorResponse('Medicine item not found'));
        return;
      }

      // Check if user can record treatment for this medicine (same farm or admin)
      if (currentUser.role !== UserRole.ADMIN && currentUser.farmId !== medicineItem.farmId) {
        res.status(403).json(createErrorResponse('Access denied to record treatment for this medicine'));
        return;
      }

      // Record treatment (using medicine usage record)
      const usageRecord = {
        medicineId: treatmentData.medicineId,
        quantityUsed: 0, // Dosage is stored separately
        birdIds: [],
        treatmentReason: treatmentData.reason,
        administeredBy: treatmentData.administeredBy,
        administeredAt: FirestoreTimestamp.fromDate(new Date(treatmentData.date)),
        notes: treatmentData.outcome || '',
        farmId: medicineItem.farmId,
        // Additional fields for treatment record
        birdGroup: treatmentData.birdGroup,
        dosage: treatmentData.dosage,
        date: treatmentData.date,
        outcome: treatmentData.outcome
      };

      await firestoreService.recordMedicineUsage(usageRecord);

      // Get medicine name for response
      const medicineName = medicineItem.name || medicineItem.medicineName || 'Unknown';

      // Create treatment record response (ID will be generated by Firestore, but we don't have it here)
      // The frontend can use the medicineId and date to identify the record
      const treatmentRecord: any = {
        medicineId: treatmentData.medicineId,
        birdGroup: treatmentData.birdGroup,
        dosage: treatmentData.dosage,
        administeredBy: treatmentData.administeredBy,
        date: treatmentData.date,
        reason: treatmentData.reason,
        outcome: treatmentData.outcome,
        farmId: medicineItem.farmId,
        createdAt: FirestoreTimestamp.now(),
        // Legacy/alternative field names
        medicineName: medicineName,
        birdGroupId: treatmentData.birdGroup,
        treatment: medicineName,
        usedBy: treatmentData.administeredBy,
        adminBy: treatmentData.administeredBy
      };

      res.status(201).json(createSuccessResponse('Treatment recorded successfully', treatmentRecord));
    } catch (error: any) {
      console.error('Record new treatment error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to record treatment'));
    }
  }

  async getVaccinationSchedule(req: Request, res: Response): Promise<void> {
    // TODO: Implement vaccination schedule functionality
    const response = createErrorResponse('Vaccination schedule functionality not implemented yet');
    res.status(501).json(response);
  }

  async scheduleVaccination(req: Request, res: Response): Promise<void> {
    // TODO: Implement schedule vaccination functionality
    const response = createErrorResponse('Schedule vaccination functionality not implemented yet');
    res.status(501).json(response);
  }

  // Get medicine statistics
  async getMedicineStats(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { farmId } = req.query;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      if (!currentUser) {
        res.status(404).json(createErrorResponse('User not found'));
        return;
      }

      const targetFarmId = currentUser.role === UserRole.ADMIN && farmId 
        ? farmId as string 
        : currentUser.farmId;

      // Get medicine inventory
      const medicineInventoryResponse = await firestoreService.getMedicineInventory(
        { farmId: targetFarmId },
        1,
        10000
      );
      const medicineInventory = medicineInventoryResponse?.data || [];

      // Get active treatments (from treatment records)
      let activeTreatments = 0;
      try {
        const treatmentsResponse = await firestoreService.getMedicineUsageHistory(
          { farmId: targetFarmId },
          1,
          1000
        );
        const recentTreatments = (treatmentsResponse?.data || []).filter((treatment: any) => {
        // Consider treatments active if used within last 30 days
          const treatmentDate = treatment.date || treatment.administeredDate || treatment.createdAt?.toDate?.()?.toISOString().split('T')[0];
          if (!treatmentDate) return false;
          const date = new Date(treatmentDate);
          const daysSinceTreatment = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
          return daysSinceTreatment <= 30;
        });
        activeTreatments = recentTreatments.length;
      } catch (error) {
        console.warn('Error getting active treatments:', error);
      }

      // Calculate statistics
      const today = new Date();
      const thirtyDaysFromNow = new Date(today);
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      const lowStockItems = medicineInventory.filter((medicine: any) => {
        const stock = medicine.stock || medicine.currentStock || 0;
        const status = calculateMedicineStatus(stock, medicine.minimumStock);
        return status === 'Low Stock';
      }).length;

      const expiringSoon = medicineInventory.filter((medicine: any) => {
        if (!medicine.expiryDate) return false;
        const expiryDate = new Date(medicine.expiryDate);
        return expiryDate > today && expiryDate <= thirtyDaysFromNow;
      }).length;

      const totalValue = medicineInventory.reduce((sum: number, medicine: any) => {
        const stock = medicine.stock || medicine.currentStock || 0;
        const costPerUnit = medicine.costPerUnit || medicine.unitPrice || 0;
        return sum + (stock * costPerUnit);
      }, 0);

      // Count by type
      const byType = medicineInventory.reduce((acc: Record<string, number>, medicine: any) => {
        const type = medicine.type || 'treatment';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const stats = {
        totalMedicines: medicineInventory.length,
        lowStockItems,
        activeTreatments,
        expiringSoon,
        totalValue: Math.round(totalValue * 100) / 100,
        byType: {
          vaccine: byType.vaccine || 0,
          antibiotic: byType.antibiotic || 0,
          vitamin: byType.vitamin || 0,
          treatment: byType.treatment || 0
        }
      };

      res.status(200).json(createSuccessResponse('Medicine statistics retrieved successfully', stats));
    } catch (error: any) {
      console.error('Get medicine stats error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to get medicine statistics'));
    }
  }
}

 export default MedicineController;