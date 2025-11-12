import { Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult, ValidationChain } from 'express-validator';
import { ApiResponse, UserRole, EggGrade, Shift, HealthStatus } from '../models/types';
import { createErrorResponse } from '../utils/responseHelper';
import { ErrorFactory } from '../models/errors';

// Enhanced validation error handler
export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(err => ({
      field: err.type === 'field' ? err.path : 'unknown',
      message: err.msg,
      value: err.type === 'field' ? err.value : undefined
    }));

    const response = createErrorResponse('Validation failed');
    res.status(400).json(response);
    return;
  }
  next();
};

// Custom validators
export const customValidators = {
  isValidDate: (value: string): boolean => {
    const date = new Date(value);
    return !isNaN(date.getTime()) && date <= new Date();
  },

  isValidFutureDate: (value: string): boolean => {
    const date = new Date(value);
    return !isNaN(date.getTime()) && date > new Date();
  },

  isValidEmail: (value: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  },

  isValidPassword: (value: string): boolean => {
    // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/;
    return passwordRegex.test(value);
  },

  isValidPhoneNumber: (value: string): boolean => {
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    return phoneRegex.test(value.replace(/[\s\-\(\)]/g, ''));
  },

  isValidUUID: (value: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  },

  isValidFarmId: (value: string): boolean => {
    // Farm ID should be alphanumeric with optional hyphens, 3-50 characters
    const farmIdRegex = /^[a-zA-Z0-9\-]{3,50}$/;
    return farmIdRegex.test(value);
  },

  isValidPenId: (value: string): boolean => {
    // Pen ID should be alphanumeric, 2-20 characters
    const penIdRegex = /^[a-zA-Z0-9]{2,20}$/;
    return penIdRegex.test(value);
  },

  isValidBatchNumber: (value: string): boolean => {
    // Batch number should be alphanumeric with optional hyphens, 3-30 characters
    const batchRegex = /^[a-zA-Z0-9\-]{3,30}$/;
    return batchRegex.test(value);
  }
};

// Common validation rules
export const commonValidations = {
  objectId: [
    param('id').isString().isLength({ min: 1 }).withMessage('Valid ID is required')
  ],

  pagination: [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('sortBy').optional().isString().isLength({ min: 1 }).withMessage('Sort field is required'),
    query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc')
  ],

  dateRange: [
    query('startDate').optional().isISO8601().withMessage('Valid start date is required'),
    query('endDate').optional().isISO8601().withMessage('Valid end date is required')
  ],

  farmId: [
    body('farmId').isString().isLength({ min: 3, max: 50 }).withMessage('Valid farm ID is required')
      .custom(customValidators.isValidFarmId).withMessage('Invalid farm ID format')
  ]
};

// User validation rules
export const userValidations = {
  registration: [
    body('email').isEmail().withMessage('Valid email is required')
      .custom(customValidators.isValidEmail).withMessage('Invalid email format'),
    body('name').isString().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters')
      .trim().escape(),
    body('role').isIn(Object.values(UserRole)).withMessage(`Valid role is required. Must be one of: ${Object.values(UserRole).join(', ')}`),
    body('password').isString().isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
      .custom(customValidators.isValidPassword).withMessage('Password must contain at least 1 uppercase, 1 lowercase, and 1 number'),
    body('farmId').optional().isString().isLength({ min: 3, max: 50 }).withMessage('Valid farm ID is required')
      .custom(customValidators.isValidFarmId).withMessage('Invalid farm ID format'),
    handleValidationErrors
  ],

  login: [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isString().isLength({ min: 1 }).withMessage('Password is required'),
    handleValidationErrors
  ],

  updateProfile: [
    body('name').optional().isString().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters')
      .trim().escape(),
    body('email').optional().isEmail().withMessage('Valid email is required'),
    handleValidationErrors
  ],

  changePassword: [
    body('currentPassword').isString().isLength({ min: 1 }).withMessage('Current password is required'),
    body('newPassword').isString().isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
      .custom(customValidators.isValidPassword).withMessage('New password must contain at least 1 uppercase, 1 lowercase, and 1 number'),
    handleValidationErrors
  ]
};

// Bird validation rules
export const birdValidations = {
  creation: [
    body('penId').isString().isLength({ min: 2, max: 20 }).withMessage('Pen ID is required (2-20 characters)')
      .custom(customValidators.isValidPenId).withMessage('Invalid pen ID format'),
    body('breed').isString().isLength({ min: 1, max: 50 }).withMessage('Breed is required (1-50 characters)')
      .trim().escape(),
    body('batchNumber').isString().isLength({ min: 3, max: 30 }).withMessage('Batch number is required (3-30 characters)')
      .custom(customValidators.isValidBatchNumber).withMessage('Invalid batch number format'),
    body('quantity').isInt({ min: 1, max: 10000 }).withMessage('Quantity must be between 1 and 10,000'),
    body('age').isInt({ min: 0, max: 365 }).withMessage('Age must be between 0 and 365 days'),
    body('dateOfBirth').isISO8601().withMessage('Valid date of birth is required')
      .custom(customValidators.isValidDate).withMessage('Date of birth cannot be in the future'),
    body('farmId').isString().isLength({ min: 3, max: 50 }).withMessage('Valid farm ID is required')
      .custom(customValidators.isValidFarmId).withMessage('Invalid farm ID format'),
    body('healthStatus').optional().isIn(Object.values(HealthStatus)).withMessage('Invalid health status'),
    body('notes').optional().isString().isLength({ max: 500 }).withMessage('Notes must be less than 500 characters')
      .trim().escape(),
    handleValidationErrors
  ],

  update: [
    body('penId').optional().isString().isLength({ min: 2, max: 20 }).withMessage('Pen ID must be 2-20 characters')
      .custom(customValidators.isValidPenId).withMessage('Invalid pen ID format'),
    body('breed').optional().isString().isLength({ min: 1, max: 50 }).withMessage('Breed must be 1-50 characters')
      .trim().escape(),
    body('quantity').optional().isInt({ min: 0, max: 10000 }).withMessage('Quantity must be between 0 and 10,000'),
    body('age').optional().isInt({ min: 0, max: 365 }).withMessage('Age must be between 0 and 365 days'),
    body('healthStatus').optional().isIn(Object.values(HealthStatus)).withMessage('Invalid health status'),
    body('notes').optional().isString().isLength({ max: 500 }).withMessage('Notes must be less than 500 characters')
      .trim().escape(),
    handleValidationErrors
  ],

  bulkUpdate: [
    body('updates').isArray({ min: 1 }).withMessage('Updates array is required'),
    body('updates.*.id').isString().isLength({ min: 1 }).withMessage('Valid bird ID is required'),
    body('updates.*.quantity').optional().isInt({ min: 0, max: 10000 }).withMessage('Quantity must be between 0 and 10,000'),
    body('updates.*.healthStatus').optional().isIn(Object.values(HealthStatus)).withMessage('Invalid health status'),
    body('updates.*.notes').optional().isString().isLength({ max: 500 }).withMessage('Notes must be less than 500 characters'),
    handleValidationErrors
  ]
};

// Egg collection validation rules
export const collectionValidations = {
  creation: [
    body('date').isISO8601().withMessage('Valid date is required')
      .custom(customValidators.isValidDate).withMessage('Date cannot be in the future'),
    body('shift').isIn(Object.values(Shift)).withMessage('Valid shift is required'),
    body('pen').isString().isLength({ min: 2, max: 20 }).withMessage('Pen is required (2-20 characters)')
      .custom(customValidators.isValidPenId).withMessage('Invalid pen ID format'),
    body('quantity').isInt({ min: 0, max: 1000 }).withMessage('Quantity must be between 0 and 1,000'),
    body('grade').isIn(Object.values(EggGrade)).withMessage('Valid egg grade is required'),
    body('avgWeight').isString().isLength({ min: 1, max: 10 }).withMessage('Average weight is required (1-10 characters)')
      .matches(/^\d+(\.\d+)?[a-zA-Z]*$/).withMessage('Invalid weight format'),
    body('collector').isString().isLength({ min: 2, max: 100 }).withMessage('Collector name is required (2-100 characters)')
      .trim().escape(),
    body('farmId').isString().isLength({ min: 3, max: 50 }).withMessage('Valid farm ID is required')
      .custom(customValidators.isValidFarmId).withMessage('Invalid farm ID format'),
    body('notes').optional().isString().isLength({ max: 500 }).withMessage('Notes must be less than 500 characters')
      .trim().escape(),
    handleValidationErrors
  ],

  update: [
    body('date').optional().isISO8601().withMessage('Valid date is required')
      .custom(customValidators.isValidDate).withMessage('Date cannot be in the future'),
    body('shift').optional().isIn(Object.values(Shift)).withMessage('Valid shift is required'),
    body('pen').optional().isString().isLength({ min: 2, max: 20 }).withMessage('Pen must be 2-20 characters')
      .custom(customValidators.isValidPenId).withMessage('Invalid pen ID format'),
    body('quantity').optional().isInt({ min: 0, max: 1000 }).withMessage('Quantity must be between 0 and 1,000'),
    body('grade').optional().isIn(Object.values(EggGrade)).withMessage('Valid egg grade is required'),
    body('avgWeight').optional().isString().isLength({ min: 1, max: 10 }).withMessage('Average weight must be 1-10 characters')
      .matches(/^\d+(\.\d+)?[a-zA-Z]*$/).withMessage('Invalid weight format'),
    body('collector').optional().isString().isLength({ min: 2, max: 100 }).withMessage('Collector name must be 2-100 characters')
      .trim().escape(),
    body('notes').optional().isString().isLength({ max: 500 }).withMessage('Notes must be less than 500 characters')
      .trim().escape(),
    handleValidationErrors
  ]
};

// Feed validation rules
export const feedValidations = {
  creation: [
    body('name').isString().isLength({ min: 1, max: 100 }).withMessage('Feed name is required (1-100 characters)')
      .trim().escape(),
    body('type').isString().isLength({ min: 1, max: 50 }).withMessage('Feed type is required (1-50 characters)')
      .trim().escape(),
    body('supplier').isString().isLength({ min: 1, max: 100 }).withMessage('Supplier is required (1-100 characters)')
      .trim().escape(),
    body('costPerUnit').isFloat({ min: 0 }).withMessage('Cost per unit must be a non-negative number'),
    body('unit').isString().isLength({ min: 1, max: 20 }).withMessage('Unit is required (1-20 characters)')
      .trim().escape(),
    body('quantity').isFloat({ min: 0 }).withMessage('Quantity must be a non-negative number'),
    body('expiryDate').optional().isISO8601().withMessage('Valid expiry date is required')
      .custom(customValidators.isValidFutureDate).withMessage('Expiry date must be in the future'),
    body('minimumStock').optional().isFloat({ min: 0 }).withMessage('Minimum stock must be a non-negative number'),
    body('farmId').isString().isLength({ min: 3, max: 50 }).withMessage('Valid farm ID is required')
      .custom(customValidators.isValidFarmId).withMessage('Invalid farm ID format'),
    handleValidationErrors
  ],

  update: [
    body('name').optional().isString().isLength({ min: 1, max: 100 }).withMessage('Feed name must be 1-100 characters')
      .trim().escape(),
    body('type').optional().isString().isLength({ min: 1, max: 50 }).withMessage('Feed type must be 1-50 characters')
      .trim().escape(),
    body('supplier').optional().isString().isLength({ min: 1, max: 100 }).withMessage('Supplier must be 1-100 characters')
      .trim().escape(),
    body('costPerUnit').optional().isFloat({ min: 0 }).withMessage('Cost per unit must be a non-negative number'),
    body('unit').optional().isString().isLength({ min: 1, max: 20 }).withMessage('Unit must be 1-20 characters')
      .trim().escape(),
    body('quantity').optional().isFloat({ min: 0 }).withMessage('Quantity must be a non-negative number'),
    body('expiryDate').optional().isISO8601().withMessage('Valid expiry date is required')
      .custom(customValidators.isValidFutureDate).withMessage('Expiry date must be in the future'),
    body('minimumStock').optional().isFloat({ min: 0 }).withMessage('Minimum stock must be a non-negative number'),
    handleValidationErrors
  ],

  consumption: [
    body('feedId').isString().isLength({ min: 1 }).withMessage('Valid feed ID is required'),
    body('birdBatchId').isString().isLength({ min: 1 }).withMessage('Valid bird batch ID is required'),
    body('quantity').isFloat({ min: 0 }).withMessage('Quantity must be a non-negative number'),
    body('consumptionDate').isISO8601().withMessage('Valid consumption date is required')
      .custom(customValidators.isValidDate).withMessage('Consumption date cannot be in the future'),
    body('farmId').isString().isLength({ min: 3, max: 50 }).withMessage('Valid farm ID is required')
      .custom(customValidators.isValidFarmId).withMessage('Invalid farm ID format'),
    handleValidationErrors
  ]
};

// Medicine validation rules
export const medicineValidations = {
  creation: [
    body('name').isString().isLength({ min: 1, max: 100 }).withMessage('Medicine name is required (1-100 characters)')
      .trim().escape(),
    body('type').isIn(['vaccination', 'treatment', 'supplement']).withMessage('Valid medicine type is required'),
    body('supplier').isString().isLength({ min: 1, max: 100 }).withMessage('Supplier is required (1-100 characters)')
      .trim().escape(),
    body('costPerUnit').isFloat({ min: 0 }).withMessage('Cost per unit must be a non-negative number'),
    body('unit').isString().isLength({ min: 1, max: 20 }).withMessage('Unit is required (1-20 characters)')
      .trim().escape(),
    body('currentStock').isFloat({ min: 0 }).withMessage('Current stock must be a non-negative number'),
    body('expiryDate').optional().isISO8601().withMessage('Valid expiry date is required')
      .custom(customValidators.isValidFutureDate).withMessage('Expiry date must be in the future'),
    body('minimumStock').optional().isFloat({ min: 0 }).withMessage('Minimum stock must be a non-negative number'),
    body('farmId').isString().isLength({ min: 3, max: 50 }).withMessage('Valid farm ID is required')
      .custom(customValidators.isValidFarmId).withMessage('Invalid farm ID format'),
    handleValidationErrors
  ],

  usage: [
    body('medicineId').isString().isLength({ min: 1 }).withMessage('Valid medicine ID is required'),
    body('birdBatchId').isString().isLength({ min: 1 }).withMessage('Valid bird batch ID is required'),
    body('quantity').isFloat({ min: 0 }).withMessage('Quantity must be a non-negative number'),
    body('administeredDate').isISO8601().withMessage('Valid administered date is required')
      .custom(customValidators.isValidDate).withMessage('Administered date cannot be in the future'),
    body('purpose').isString().isLength({ min: 1, max: 200 }).withMessage('Purpose is required (1-200 characters)')
      .trim().escape(),
    body('farmId').isString().isLength({ min: 3, max: 50 }).withMessage('Valid farm ID is required')
      .custom(customValidators.isValidFarmId).withMessage('Invalid farm ID format'),
    handleValidationErrors
  ]
};

// Report validation rules
export const reportValidations = {
  generation: [
    body('type').isIn(['daily', 'weekly', 'monthly', 'custom']).withMessage('Valid report type is required'),
    body('startDate').isISO8601().withMessage('Valid start date is required')
      .custom(customValidators.isValidDate).withMessage('Start date cannot be in the future'),
    body('endDate').isISO8601().withMessage('Valid end date is required')
      .custom(customValidators.isValidDate).withMessage('End date cannot be in the future'),
    body('format').optional().isIn(['pdf', 'csv', 'excel']).withMessage('Valid format is required'),
    body('farmId').isString().isLength({ min: 3, max: 50 }).withMessage('Valid farm ID is required')
      .custom(customValidators.isValidFarmId).withMessage('Invalid farm ID format'),
    body('includeFinancials').optional().isBoolean().withMessage('includeFinancials must be a boolean'),
    handleValidationErrors
  ]
};

// Request transformation middleware
export const transformRequest = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // Transform string numbers to actual numbers
    if (req.body) {
      req.body = transformNumbers(req.body);
    }

    // Transform query parameters
    if (req.query) {
      req.query = transformNumbers(req.query);
    }

    // Transform date strings to Date objects for specific fields
    const dateFields = ['date', 'startDate', 'endDate', 'dateOfBirth', 'expiryDate', 'administeredDate', 'consumptionDate'];
    if (req.body) {
      dateFields.forEach(field => {
        if (req.body[field] && typeof req.body[field] === 'string') {
          req.body[field] = new Date(req.body[field]);
        }
      });
    }

    next();
  } catch (error) {
    res.status(400).json(createErrorResponse('Request transformation failed', (error as Error).message));
  }
};

// Transform string numbers to actual numbers
const transformNumbers = (obj: any): any => {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    // Check if string is a valid number
    if (/^\d+$/.test(obj)) {
      return parseInt(obj, 10);
    }
    if (/^\d+\.\d+$/.test(obj)) {
      return parseFloat(obj);
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => transformNumbers(item));
  }

  if (typeof obj === 'object') {
    const transformed: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        transformed[key] = transformNumbers(obj[key]);
      }
    }
    return transformed;
  }

  return obj;
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

export default {
  handleValidationErrors,
  customValidators,
  commonValidations,
  userValidations,
  birdValidations,
  collectionValidations,
  feedValidations,
  medicineValidations,
  reportValidations,
  transformRequest,
  validateFileUpload,
  validateDateRangeLogic
};
