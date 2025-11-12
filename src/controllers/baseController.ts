import { Request, Response } from 'express';
import { container, SERVICE_KEYS, IAuthService, IFirebaseService, IFirestoreService, ICacheService, ILogger } from '../services/serviceContainer';
import { createSuccessResponse, createErrorResponse } from '../utils/responseHelper';
import { ErrorFactory, AppError } from '../models/errors';

export abstract class BaseController {
  protected firebaseService: IAuthService; // Now uses Better Auth
  protected firestoreService: IFirestoreService;
  protected cacheService: ICacheService;
  protected logger: ILogger;
 
  constructor() {
    // Use AUTH_SERVICE, fallback to 'firebaseService' for backward compatibility
    try {
      this.firebaseService = container.get<IAuthService>(SERVICE_KEYS.AUTH_SERVICE);
    } catch {
      this.firebaseService = container.get<IAuthService>('firebaseService');
    }
    this.firestoreService = container.get<IFirestoreService>(SERVICE_KEYS.FIRESTORE_SERVICE);
    this.cacheService = container.get<ICacheService>(SERVICE_KEYS.CACHE_SERVICE);
    this.logger = container.get<ILogger>(SERVICE_KEYS.LOGGER);
  }

  protected async handleRequest<T>(
    req: Request,
    res: Response,
    operation: () => Promise<T>,
    successMessage: string,
    errorContext?: any
  ): Promise<void> {
    try {
      const result = await operation();
      
      this.logger.info('Request successful', {
        operation: req.route?.path || req.path,
        method: req.method,
        userId: (req as any).user?.uid,
        successMessage
      });

      res.json(createSuccessResponse(successMessage, result));
    } catch (error: any) {
      // If it's already an AppError, use it directly
      if (error instanceof AppError) {
        this.logger.error('Request failed', {
          operation: req.route?.path || req.path,
          method: req.method,
          userId: (req as any).user?.uid,
          error: error.toJSON(),
          context: errorContext
        });
        
        res.status(error.statusCode).json(createErrorResponse(error.message));
        return;
      }

      // Convert other errors to AppError
      let appError: AppError;
      if (error instanceof Error) {
        // Check for Firebase auth errors in the error message
        const errorMessage = error.message || '';
        if (errorMessage.includes('Password not set for this user')) {
          appError = ErrorFactory.authentication('Password not set for this account. Please contact an administrator or use password reset.');
        } else if (errorMessage.includes('auth/invalid-credential') || 
            errorMessage.includes('auth/user-not-found') || 
            errorMessage.includes('auth/wrong-password') ||
            errorMessage.includes('Invalid email or password') ||
            errorMessage.includes('Authentication failed')) {
          appError = ErrorFactory.authentication('Invalid email or password');
        } else {
          appError = AppError.fromError(error, {
            userId: (req as any).user?.uid,
            farmId: (req as any).user?.farmId,
            operation: `${req.method} ${req.path}`,
            ...errorContext
          });
        }
      } else {
        appError = ErrorFactory.internal('An unexpected error occurred', {
          userId: (req as any).user?.uid,
          farmId: (req as any).user?.farmId,
          operation: `${req.method} ${req.path}`,
          ...errorContext
        });
      }

      this.logger.error('Request failed', {
        operation: req.route?.path || req.path,
        method: req.method,
        userId: (req as any).user?.uid,
        error: appError.toJSON(),
        context: errorContext
      });
      
      res.status(appError.statusCode).json(createErrorResponse(appError.message));
    }
  }

  protected validateUser(req: Request): { userId: string; user: any } {
    const userId = (req as any).user?.uid;
    if (!userId) {
      throw ErrorFactory.authentication('User not authenticated');
    }
    return { userId, user: (req as any).user };
  }

  protected async validateUserExists(userId: string): Promise<any> {
    const user = await this.firestoreService.getUserById(userId);
    if (!user) {
      throw ErrorFactory.notFound('User not found');
    }
    return user;
  }

  protected async validateFarmAccess(user: any, farmId?: string): Promise<string> {
    const targetFarmId = farmId || user.farmId;
    
    // Super admins can access any farm
    if (user.role === 'super_admin') {
      return targetFarmId;
    }
    
    // Other users can only access their own farm
    if (user.farmId !== targetFarmId) {
      throw ErrorFactory.authorization('Access denied to this farm');
    }
    
    return targetFarmId;
  }

  protected async getCachedData<T>(
    cacheKey: string,
    fetchFunction: () => Promise<T>,
    ttl: number = 300
  ): Promise<T> {
    try {
      // Try to get from cache first
      const cachedData = await this.cacheService.get<T>(cacheKey);
      if (cachedData) {
        this.logger.debug('Cache hit', { cacheKey });
        return cachedData;
      }

      // Cache miss - fetch from source
      this.logger.debug('Cache miss', { cacheKey });
      const data = await fetchFunction();
      
      // Store in cache
      await this.cacheService.set(cacheKey, data, { ttl });
      
      return data;
    } catch (error) {
      this.logger.error('Cache operation failed', {
        cacheKey,
        error: (error as Error).message
      });
      
      // Fallback to direct fetch
      return await fetchFunction();
    }
  }

  protected async invalidateCache(pattern: string): Promise<void> {
    try {
      await this.cacheService.flush(pattern);
      this.logger.debug('Cache invalidated', { pattern });
    } catch (error) {
      this.logger.error('Cache invalidation failed', {
        pattern,
        error: (error as Error).message
      });
    }
  }

  protected paginateResults<T>(
    data: T[],
    page: number = 1,
    limit: number = 10
  ): { data: T[]; pagination: any } {
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedData = data.slice(startIndex, endIndex);

    return {
      data: paginatedData,
      pagination: {
        page,
        limit,
        total: data.length,
        totalPages: Math.ceil(data.length / limit),
        hasNext: endIndex < data.length,
        hasPrev: page > 1
      }
    };
  }

  protected validatePaginationParams(req: Request): { page: number; limit: number } {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    
    return { page, limit };
  }

  protected validateDateRange(req: Request): { startDate?: Date; endDate?: Date } {
    const { startDate, endDate } = req.query;
    
    const result: { startDate?: Date; endDate?: Date } = {};
    
    if (startDate) {
      result.startDate = new Date(startDate as string);
      if (isNaN(result.startDate.getTime())) {
        throw ErrorFactory.validation('Invalid start date format');
      }
    }
    
    if (endDate) {
      result.endDate = new Date(endDate as string);
      if (isNaN(result.endDate.getTime())) {
        throw ErrorFactory.validation('Invalid end date format');
      }
    }
    
    if (result.startDate && result.endDate && result.startDate > result.endDate) {
      throw ErrorFactory.validation('Start date cannot be after end date');
    }
    
    return result;
  }

  protected async auditLog(
    userId: string,
    action: string,
    resource: string,
    resourceId?: string,
    details?: any
  ): Promise<void> {
    try {
      this.logger.info('Audit log', {
        userId,
        action,
        resource,
        resourceId,
        details,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Audit logging failed', {
        userId,
        action,
        resource,
        error: (error as Error).message
      });
    }
  }
}
