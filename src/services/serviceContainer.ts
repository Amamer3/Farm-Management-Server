// Dependency Injection Container
export interface ServiceContainer {
  get<T>(key: string): T;
  set<T>(key: string, service: T): void;
  has(key: string): boolean;
  remove(key: string): boolean;
}

class DIContainer implements ServiceContainer {
  private services = new Map<string, any>();

  get<T>(key: string): T {
    if (!this.services.has(key)) {
      throw new Error(`Service '${key}' not found`);
    }
    return this.services.get(key); 
  }

  set<T>(key: string, service: T): void {
    this.services.set(key, service);
  }

  has(key: string): boolean {
    return this.services.has(key);
  }

  remove(key: string): boolean {
    return this.services.delete(key);
  }
}

// Service keys
export const SERVICE_KEYS = {
  AUTH_SERVICE: 'authService', // Changed from FIREBASE_SERVICE
  FIRESTORE_SERVICE: 'firestoreService',
  CACHE_SERVICE: 'cacheService',
  LOGGER: 'logger',
  EMAIL_SERVICE: 'emailService',
  NOTIFICATION_SERVICE: 'notificationService',
  REPORT_SERVICE: 'reportService'
} as const;

// Global container instance
export const container = new DIContainer();

// Service interfaces
export interface IAuthService {
  createUser(userData: any): Promise<any>;
  verifyIdToken(token: string): Promise<any>;
  signInWithEmailAndPassword(email: string, password: string): Promise<{ uid: string; email: string; getIdToken: () => Promise<string>; getRefreshToken: () => Promise<string> }>;
  updateUser(uid: string, userData: any): Promise<any>;
  updateUserGraceful?(uid: string, userData: any): Promise<any>;
  deleteUser(uid: string): Promise<void>;
  revokeRefreshTokens(uid: string): Promise<void>;
}

// Keep IFirebaseService as alias for backward compatibility during migration
export interface IFirebaseService extends IAuthService {}

export interface IFirestoreService {
  getUserById(id: string): Promise<any>;
  createUser(userData: any): Promise<any>;
  updateUser(id: string, userData: any): Promise<any>;
  deleteUser(id: string): Promise<void>;
  getBirds(filters?: any): Promise<any[]>;
  createBird(birdData: any): Promise<any>;
  updateBird(id: string, birdData: any): Promise<any>;
  deleteBird(id: string): Promise<void>;
  getEggCollections(filters?: any): Promise<any[]>;
  createEggCollection(collectionData: any): Promise<any>;
  updateEggCollection(id: string, collectionData: any): Promise<any>;
  deleteEggCollection(id: string): Promise<void>;
}

export interface ICacheService {
  get<T>(key: string, options?: any): Promise<T | null>;
  set(key: string, value: any, options?: any): Promise<boolean>;
  del(key: string, prefix?: string): Promise<boolean>;
  exists(key: string, prefix?: string): Promise<boolean>;
  flush(pattern?: string): Promise<boolean>;
  healthCheck(): Promise<boolean>;
}

export interface ILogger {
  info(message: string, meta?: any): void;
  error(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  debug(message: string, meta?: any): void;
}

export interface IEmailService {
  sendEmail(to: string, subject: string, body: string): Promise<boolean>;
  sendWelcomeEmail(user: any): Promise<boolean>;
  sendPasswordResetEmail(user: any, resetToken: string): Promise<boolean>;
}

export interface INotificationService {
  sendNotification(userId: string, message: string, type: string): Promise<boolean>;
  sendBulkNotification(userIds: string[], message: string, type: string): Promise<boolean>;
}

export interface IReportService {
  generateReport(type: string, data: any, options?: any): Promise<any>;
  exportToPDF(data: any, options?: any): Promise<Buffer>;
  exportToCSV(data: any, options?: any): Promise<string>;
}

// Service factory
export class ServiceFactory {
  static createAuthService(): IAuthService {
    // Use Better Auth service instead of Firebase
    const authService = require('../services/betterAuthService').default;
    return authService;
  }

  // Keep for backward compatibility during migration
  static createFirebaseService(): IFirebaseService {
    return ServiceFactory.createAuthService();
  }

  static createFirestoreService(): IFirestoreService {
    // Return actual Firestore service implementation
    const firestoreService = require('../services/firestoreService').default;
    return firestoreService;
  }

  static createCacheService(): ICacheService {
    try {
      // Return actual cache service implementation
      const CacheService = require('../services/cacheService').default;
      return CacheService;
    } catch (error) {
      console.error('Failed to create cache service:', error);
      // Return a mock cache service that doesn't actually cache
      return {
        get: async () => null,
        set: async () => true,
        del: async () => true,
        exists: async () => false,
        flush: async () => true,
        healthCheck: async () => false
      };
    }
  }

  static createLogger(): ILogger {
    // Return actual logger implementation
    const logger = require('../utils/enhancedLogger').logger;
    return logger;
  }

  static createEmailService(): IEmailService {
    // Mock email service for now
    return {
      sendEmail: async (to: string, subject: string, body: string): Promise<boolean> => {
        console.log(`Sending email to ${to}: ${subject}`);
        return true;
      },
      sendWelcomeEmail: async (user: any): Promise<boolean> => {
        console.log(`Sending welcome email to ${user.email}`);
        return true;
      },
      sendPasswordResetEmail: async (user: any, resetToken: string): Promise<boolean> => {
        console.log(`Sending password reset email to ${user.email}`);
        return true;
      }
    };
  }

  static createNotificationService(): INotificationService {
    // Mock notification service for now
    return {
      sendNotification: async (userId: string, message: string, type: string): Promise<boolean> => {
        console.log(`Sending ${type} notification to user ${userId}: ${message}`);
        return true;
      },
      sendBulkNotification: async (userIds: string[], message: string, type: string): Promise<boolean> => {
        console.log(`Sending ${type} notification to ${userIds.length} users: ${message}`);
        return true;
      }
    };
  }

  static createReportService(): IReportService {
    // Mock report service for now
    return {
      generateReport: async (type: string, data: any, options?: any): Promise<any> => {
        console.log(`Generating ${type} report`);
        return { success: true, data };
      },
      exportToPDF: async (data: any, options?: any): Promise<Buffer> => {
        console.log('Exporting to PDF');
        return Buffer.from('PDF content');
      },
      exportToCSV: async (data: any, options?: any): Promise<string> => {
        console.log('Exporting to CSV');
        return 'CSV content';
      }
    };
  }
}

// Initialize services
export const initializeServices = (): void => {
  container.set(SERVICE_KEYS.AUTH_SERVICE, ServiceFactory.createAuthService());
  // Keep FIREBASE_SERVICE key for backward compatibility
  container.set('firebaseService', ServiceFactory.createAuthService());
  container.set(SERVICE_KEYS.FIRESTORE_SERVICE, ServiceFactory.createFirestoreService());
  container.set(SERVICE_KEYS.CACHE_SERVICE, ServiceFactory.createCacheService());
  container.set(SERVICE_KEYS.LOGGER, ServiceFactory.createLogger());
  container.set(SERVICE_KEYS.EMAIL_SERVICE, ServiceFactory.createEmailService());
  container.set(SERVICE_KEYS.NOTIFICATION_SERVICE, ServiceFactory.createNotificationService());
  container.set(SERVICE_KEYS.REPORT_SERVICE, ServiceFactory.createReportService());
};

// Service decorator for dependency injection
export const inject = (serviceKey: string) => {
  return (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) => {
    // Note: This is a simplified implementation without reflect-metadata
    // In a real implementation, you would use reflect-metadata package
    console.log(`Injecting service ${serviceKey} at parameter ${parameterIndex}`);
  };
};

// Service resolver
export const resolveService = <T>(serviceKey: string): T => {
  return container.get<T>(serviceKey);
};

export default container;
