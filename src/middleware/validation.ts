import { Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { ApiResponse, UserRole } from '../models/types';
import { createErrorResponse } from '../utils/responseHelper';

// Validation error handler
export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const response = createErrorResponse('Validation failed', errors.array().map(err => err.msg).join(', '));
    res.status(400).json(response);
    return;
  }
  next();
};

// Common validation rules
export const validateObjectId = [
  param('id').isString().isLength({ min: 1 }).withMessage('Valid ID is required')
];

export const validatePagination = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
];

// User validation
export const validateUserCreation = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('name').isString().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
  body('role').isIn(Object.values(UserRole)).withMessage('Valid role is required'),
  body('password').isString().isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('farmId').optional().isString().isLength({ min: 1 }).withMessage('Valid farm ID is required')
];

export const validateUserRegistration = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('name').isString().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
  body('role').isIn(Object.values(UserRole)).withMessage(`Valid role is required. Must be one of: ${Object.values(UserRole).join(', ')}`),
  body('password').isString().isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('farmId').optional().isString().isLength({ min: 1 }).withMessage('Valid farm ID is required'),
  handleValidationErrors
];

export const validateUserUpdate = [
  body('email').optional().isEmail().withMessage('Valid email is required'),
  body('name').optional().isString().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
  body('role').optional().isIn(Object.values(UserRole)).withMessage('Valid role is required'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean')
];

// Bird validation
export const validateBirdCreation = [
  body('breed').isString().isLength({ min: 1, max: 50 }).withMessage('Breed is required (1-50 characters)'),
  body('batchNumber').isString().isLength({ min: 1, max: 20 }).withMessage('Batch number is required (1-20 characters)'),
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be a positive integer'),
  body('dateOfBirth').isISO8601().withMessage('Valid date of birth is required'),
  body('farmId').isString().isLength({ min: 1 }).withMessage('Valid farm ID is required')
];

export const validateBird = validateBirdCreation;

export const validateBirdUpdate = [
  body('breed').optional().isString().isLength({ min: 1, max: 50 }).withMessage('Breed must be 1-50 characters'),
  body('quantity').optional().isInt({ min: 0 }).withMessage('Quantity must be a non-negative integer'),
  body('mortality').optional().isInt({ min: 0 }).withMessage('Mortality must be a non-negative integer'),
  body('notes').optional().isString().isLength({ max: 500 }).withMessage('Notes must be less than 500 characters')
];

export const validateBulkBirdUpdate = [
  body('updates').isArray({ min: 1 }).withMessage('Updates array is required'),
  body('updates.*.id').isString().isLength({ min: 1 }).withMessage('Valid bird ID is required'),
  body('updates.*.quantity').optional().isInt({ min: 0 }).withMessage('Quantity must be a non-negative integer'),
  body('updates.*.mortality').optional().isInt({ min: 0 }).withMessage('Mortality must be a non-negative integer')
];

// Egg collection validation
export const validateEggCollection = [
  body('date').isISO8601().withMessage('Valid date is required'),
  body('quantity').isInt({ min: 0 }).withMessage('Quantity must be a non-negative integer'),
  body('birdBatchId').isString().isLength({ min: 1 }).withMessage('Valid bird batch ID is required'),
  body('farmId').isString().isLength({ min: 1 }).withMessage('Valid farm ID is required'),
  body('notes').optional().isString().isLength({ max: 500 }).withMessage('Notes must be less than 500 characters')
];

// Feed validation
export const validateFeed = [
  body('name').isString().isLength({ min: 1, max: 100 }).withMessage('Feed name is required (1-100 characters)'),
  body('type').isString().isLength({ min: 1, max: 50 }).withMessage('Feed type is required (1-50 characters)'),
  body('supplier').isString().isLength({ min: 1, max: 100 }).withMessage('Supplier is required (1-100 characters)'),
  body('costPerUnit').isFloat({ min: 0 }).withMessage('Cost per unit must be a non-negative number'),
  body('unit').isString().isLength({ min: 1, max: 20 }).withMessage('Unit is required (1-20 characters)'),
  body('farmId').isString().isLength({ min: 1 }).withMessage('Valid farm ID is required')
];

export const validateFeedCreation = [
  body('name').isString().isLength({ min: 1, max: 100 }).withMessage('Feed name is required (1-100 characters)'),
  body('type').isString().isLength({ min: 1, max: 50 }).withMessage('Feed type is required (1-50 characters)'),
  body('supplier').isString().isLength({ min: 1, max: 100 }).withMessage('Supplier is required (1-100 characters)'),
  body('costPerUnit').isFloat({ min: 0 }).withMessage('Cost per unit must be a non-negative number'),
  body('unit').isString().isLength({ min: 1, max: 20 }).withMessage('Unit is required (1-20 characters)'),
  body('farmId').isString().isLength({ min: 1 }).withMessage('Valid farm ID is required')
];

export const validateFeedInventoryUpdate = [
  body('quantity').isFloat({ min: 0 }).withMessage('Quantity must be a non-negative number'),
  body('expiryDate').optional().isISO8601().withMessage('Valid expiry date is required'),
  body('batchNumber').optional().isString().isLength({ min: 1, max: 50 }).withMessage('Batch number must be 1-50 characters')
];

// Medicine validation
export const validateMedicine = [
  body('name').isString().isLength({ min: 1, max: 100 }).withMessage('Medicine name is required (1-100 characters)'),
  body('type').isString().isLength({ min: 1, max: 50 }).withMessage('Medicine type is required (1-50 characters)'),
  body('supplier').isString().isLength({ min: 1, max: 100 }).withMessage('Supplier is required (1-100 characters)'),
  body('costPerUnit').isFloat({ min: 0 }).withMessage('Cost per unit must be a non-negative number'),
  body('unit').isString().isLength({ min: 1, max: 20 }).withMessage('Unit is required (1-20 characters)'),
  body('farmId').isString().isLength({ min: 1 }).withMessage('Valid farm ID is required')
];

export const validateMedicineCreation = [
  body('name').isString().isLength({ min: 1, max: 100 }).withMessage('Medicine name is required (1-100 characters)'),
  body('type').isString().isLength({ min: 1, max: 50 }).withMessage('Medicine type is required (1-50 characters)'),
  body('supplier').isString().isLength({ min: 1, max: 100 }).withMessage('Supplier is required (1-100 characters)'),
  body('costPerUnit').isFloat({ min: 0 }).withMessage('Cost per unit must be a non-negative number'),
  body('unit').isString().isLength({ min: 1, max: 20 }).withMessage('Unit is required (1-20 characters)'),
  body('farmId').isString().isLength({ min: 1 }).withMessage('Valid farm ID is required')
];

export const validateMedicineUsage = [
  body('medicineId').isString().isLength({ min: 1 }).withMessage('Valid medicine ID is required'),
  body('birdBatchId').isString().isLength({ min: 1 }).withMessage('Valid bird batch ID is required'),
  body('quantity').isFloat({ min: 0 }).withMessage('Quantity must be a non-negative number'),
  body('administeredDate').isISO8601().withMessage('Valid administered date is required'),
  body('purpose').isString().isLength({ min: 1, max: 200 }).withMessage('Purpose is required (1-200 characters)'),
  body('farmId').isString().isLength({ min: 1 }).withMessage('Valid farm ID is required')
];

// Report validation
export const validateFeedConsumption = [
  body('feedId').isString().isLength({ min: 1 }).withMessage('Valid feed ID is required'),
  body('birdBatchId').isString().isLength({ min: 1 }).withMessage('Valid bird batch ID is required'),
  body('quantity').isFloat({ min: 0 }).withMessage('Quantity must be a non-negative number'),
  body('consumptionDate').isISO8601().withMessage('Valid consumption date is required'),
  body('farmId').isString().isLength({ min: 1 }).withMessage('Valid farm ID is required')
];

export const validateReportExport = [
  body('type').isIn(['daily', 'weekly', 'monthly', 'custom']).withMessage('Valid report type is required'),
  body('startDate').isISO8601().withMessage('Valid start date is required'),
  body('endDate').isISO8601().withMessage('Valid end date is required'),
  body('format').optional().isIn(['pdf', 'csv', 'excel']).withMessage('Valid format is required'),
  body('farmId').isString().isLength({ min: 1 }).withMessage('Valid farm ID is required')
];

export const validateReportGeneration = [
  body('type').isIn(['daily', 'weekly', 'monthly', 'custom']).withMessage('Valid report type is required'),
  body('startDate').isISO8601().withMessage('Valid start date is required'),
  body('endDate').isISO8601().withMessage('Valid end date is required'),
  body('farmId').isString().isLength({ min: 1 }).withMessage('Valid farm ID is required'),
  body('includeFinancials').optional().isBoolean().withMessage('includeFinancials must be a boolean')
];

// Date range validation
export const validateDateRange = [
  query('startDate').optional().isISO8601().withMessage('Valid start date is required'),
  query('endDate').optional().isISO8601().withMessage('Valid end date is required')
];

// Custom validation middleware for date range logic
export const validateDateRangeLogic = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { startDate, endDate } = req.query;
  
  if (startDate && endDate) {
    const start = new Date(startDate as string);
    const end = new Date(endDate as string);
    
    if (start > end) {
      const response = createErrorResponse('Start date cannot be after end date');
      res.status(400).json(response);
      return;
    }
    
    // Check if date range is not too large (e.g., max 1 year)
    const oneYear = 365 * 24 * 60 * 60 * 1000;
    if (end.getTime() - start.getTime() > oneYear) {
      const response = createErrorResponse('Date range cannot exceed 1 year');
      res.status(400).json(response);
      return;
    }
  }
  
  next();
};

// File upload validation
export const validateFileUpload = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.file) {
    const response = createErrorResponse('File is required');
    res.status(400).json(response);
    return;
  }
  
  // Check file size (max 5MB)
  const maxSize = 5 * 1024 * 1024;
  if (req.file.size > maxSize) {
    const response = createErrorResponse('File size cannot exceed 5MB');
    res.status(400).json(response);
    return;
  }
  
  // Check file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
  if (!allowedTypes.includes(req.file.mimetype)) {
    const response = createErrorResponse('Invalid file type. Only JPEG, PNG, GIF, and PDF files are allowed');
    res.status(400).json(response);
    return;
  }
  
  next();
};