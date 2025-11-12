import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest, UserRole, ApiResponse } from '../models/types';
import { ErrorFactory } from '../models/errors';
import authService from '../services/betterAuthService';
import firestoreService from '../services/firestoreService';

// Extend Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        uid: string; 
        email: string;
        role: UserRole;
        name: string;
      };
    }
  }
}

/**
 * Middleware to verify Firebase ID token and authenticate user
 */
export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      res.status(401).json({
        success: false,
        message: 'Authorization header is required',
        error: 'Missing authorization header',
        timestamp: new Date().toISOString(),
      } as ApiResponse);
      return;
    }

    const token = authHeader.split(' ')[1]; // Bearer TOKEN
    
    if (!token) {
      res.status(401).json({
        success: false,
        message: 'Token is required',
        error: 'Missing token in authorization header',
        timestamp: new Date().toISOString(),
      } as ApiResponse);
      return;
    }

    // Verify the JWT token (Better Auth)
    const decodedToken = await authService.verifyIdToken(token);
    
    // Get user data from Firestore
    const userData = await firestoreService.getUserById(decodedToken.uid);
    
    if (!userData) {
      res.status(401).json({
        success: false,
        message: 'User not found in database',
        error: 'User record does not exist',
        timestamp: new Date().toISOString(),
      } as ApiResponse);
      return;
    }

    // Check if user is active
    if (userData.isActive === false) {
      res.status(401).json({
        success: false,
        message: 'User account is deactivated',
        error: 'Account is not active',
        timestamp: new Date().toISOString(),
      } as ApiResponse);
      return;
    }

    // Normalize role: map old role values to new ones for backward compatibility
    const normalizeRole = (role: string): UserRole => {
      if (!role) return UserRole.WORKER; // Default to worker if no role
      
      const roleLower = role.toLowerCase().trim();
      const roleMap: Record<string, UserRole> = {
        'super_admin': UserRole.ADMIN,
        'farm_manager': UserRole.MANAGER,
        'farm_worker': UserRole.WORKER,
        'admin': UserRole.ADMIN,
        'manager': UserRole.MANAGER,
        'worker': UserRole.WORKER,
      };
      return roleMap[roleLower] || role as UserRole;
    };

    // Attach user info to request
    req.user = {
      uid: decodedToken.uid,
      email: userData.email,
      role: normalizeRole(userData.role),
      name: userData.name,
    };

    // Update last login timestamp
    await firestoreService.updateUser(decodedToken.uid, {
      lastLogin: new Date() as any,
    });

    next();
  } catch (error: any) {
    // Use next() to pass error to error handler middleware for consistent error handling
    // Determine error type
    if (error.code && error.code.startsWith('auth/')) {
      next(ErrorFactory.authentication('Authentication failed'));
    } else if (error.name === 'TokenExpiredError') {
      next(ErrorFactory.authentication('Your token has expired. Please log in again'));
    } else if (error.name === 'JsonWebTokenError') {
      next(ErrorFactory.authentication('Invalid token. Please log in again'));
    } else {
      next(ErrorFactory.authentication('Invalid or expired token'));
    }
  }
};

/**
 * Middleware to check if user has required role(s)
 */
export const requireRole = (...allowedRoles: UserRole[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
        error: 'User not authenticated',
        timestamp: new Date().toISOString(),
      } as ApiResponse);
      return;
    }

    // req.user.role is already normalized in authenticateToken, but ensure it's a valid UserRole
    const userRole = req.user.role as UserRole;

    if (!allowedRoles.includes(userRole)) {
      res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action',
        error: `Required role: ${allowedRoles.join(' or ')}, current role: ${userRole}`,
        timestamp: new Date().toISOString(),
      } as ApiResponse);
      return;
    }

    next();
  };
};

/**
 * Middleware to check if user is admin
 */
export const requireAdmin = requireRole(UserRole.ADMIN);

/**
 * Middleware to check if user is admin or manager
 */
export const requireManagerOrAdmin = requireRole(UserRole.ADMIN, UserRole.MANAGER);

/**
 * Middleware to check if user can access resource (admin, manager, or owner)
 */
export const requireOwnershipOrAdmin = (userIdParam: string = 'userId') => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
        error: 'User not authenticated',
        timestamp: new Date().toISOString(),
      } as ApiResponse);
      return;
    }

    const targetUserId = req.params[userIdParam];
    const isOwner = req.user.uid === targetUserId;
    const isAdminOrManager = [UserRole.ADMIN, UserRole.MANAGER].includes(req.user.role);

    if (!isOwner && !isAdminOrManager) {
      res.status(403).json({
        success: false,
        message: 'Access denied',
        error: 'You can only access your own resources or need admin/manager privileges',
        timestamp: new Date().toISOString(),
      } as ApiResponse);
      return;
    }

    next();
  };
};

/**
 * Optional authentication middleware - doesn't fail if no token provided
 */
export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      next();
      return;
    }

    const token = authHeader.split(' ')[1];
    
    if (!token) {
      next();
      return;
    }

    // Verify the JWT token (Better Auth)
    const decodedToken = await authService.verifyIdToken(token);
    
    // Get user data from Firestore
    const userData = await firestoreService.getUserById(decodedToken.uid);
    
    if (userData && userData.isActive !== false) {
      req.user = {
        uid: decodedToken.uid,
        email: userData.email,
        role: userData.role,
        name: userData.name,
      };
    }

    next();
  } catch (error) {
    // Don't fail on optional auth errors, just continue without user
    console.warn('Optional authentication failed:', error);
    next();
  }
};

/**
 * Middleware to validate API key for external integrations
 */
export const validateApiKey = (req: Request, res: Response, next: NextFunction): void => {
  const apiKey = req.headers['x-api-key'] as string;
  const validApiKey = process.env.API_KEY;

  if (!validApiKey) {
    res.status(500).json({
      success: false,
      message: 'API key validation not configured',
      error: 'Server configuration error',
      timestamp: new Date().toISOString(),
    } as ApiResponse);
    return;
  }

  if (!apiKey || apiKey !== validApiKey) {
    res.status(401).json({
      success: false,
      message: 'Invalid API key',
      error: 'Valid API key required',
      timestamp: new Date().toISOString(),
    } as ApiResponse);
    return;
  }

  next();
};

/**
 * Middleware to check rate limiting per user
 */
export const rateLimitPerUser = (maxRequests: number = 100, windowMs: number = 15 * 60 * 1000) => {
  const userRequests = new Map<string, { count: number; resetTime: number }>();

  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const userId = req.user?.uid || req.ip || 'anonymous';
    const now = Date.now();
    
    const userLimit = userRequests.get(userId);
    
    if (!userLimit || now > userLimit.resetTime) {
      userRequests.set(userId, {
        count: 1,
        resetTime: now + windowMs,
      });
      next();
      return;
    }

    if (userLimit.count >= maxRequests) {
      res.status(429).json({
        success: false,
        message: 'Rate limit exceeded',
        error: `Maximum ${maxRequests} requests per ${windowMs / 1000} seconds`,
        timestamp: new Date().toISOString(),
      } as ApiResponse);
      return;
    }

    userLimit.count++;
    next();
  };
};

/**
 * Middleware to log user actions for audit trail
 */
export const auditLog = (action: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const originalSend = res.send;
    
    res.send = function(data) {
      // Log the action after response is sent
      if (req.user) {
        console.log(`[AUDIT] ${new Date().toISOString()} - User: ${req.user.email} (${req.user.role}) - Action: ${action} - Method: ${req.method} - Path: ${req.path} - Status: ${res.statusCode}`);
      }
      
      return originalSend.call(this, data);
    };
    
    next();
  };
};

/**
 * Error handler for authentication middleware
 */
export const authErrorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.error('Authentication middleware error:', error);
  
  res.status(500).json({
    success: false,
    message: 'Internal authentication error',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Authentication service unavailable',
    timestamp: new Date().toISOString(),
  } as ApiResponse);
};

// Export all middleware functions
export default {
  authenticateToken,
  requireRole,
  requireAdmin,
  requireManagerOrAdmin,
  requireOwnershipOrAdmin,
  optionalAuth,
  validateApiKey,
  rateLimitPerUser,
  auditLog,
  authErrorHandler,
};