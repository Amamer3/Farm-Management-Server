import { Request, Response, NextFunction } from 'express';
import cacheService from '../services/cacheService';
import { logger } from '../utils/enhancedLogger';

export interface CacheMiddlewareOptions {
  ttl?: number;
  keyGenerator?: (req: Request) => string;
  skipCache?: (req: Request) => boolean;
  prefix?: string;
} 

// Default cache key generator
const defaultKeyGenerator = (req: Request): string => {
  const { method, url, query, params } = req;
  const userId = (req as any).user?.uid || 'anonymous';
  const farmId = (req as any).user?.farmId || 'no-farm';
  
  // Create a unique key based on request details
  const keyData = {
    method,
    url,
    query: JSON.stringify(query),
    params: JSON.stringify(params),
    userId,
    farmId
  };
  
  return Buffer.from(JSON.stringify(keyData)).toString('base64');
};

// Default skip cache function
const defaultSkipCache = (req: Request): boolean => {
  // Skip cache for non-GET requests
  if (req.method !== 'GET') {
    return true;
  }
  
  // Skip cache for requests with no-cache header
  if (req.headers['cache-control']?.includes('no-cache')) {
    return true;
  }
  
  // Skip cache for admin operations
  if (req.url.includes('/admin/')) {
    return true;
  }
  
  return false;
};

export const cacheMiddleware = (options: CacheMiddlewareOptions = {}) => {
  const {
    ttl = 300, // 5 minutes default
    keyGenerator = defaultKeyGenerator,
    skipCache = defaultSkipCache,
    prefix = 'api:'
  } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Skip caching if conditions are met
    if (skipCache(req)) {
      return next();
    }

    try {
      const cacheKey = keyGenerator(req);
      const fullKey = `${prefix}${cacheKey}`;

      // Try to get from cache
      const cachedData = await cacheService.get(fullKey);
      
      if (cachedData) {
        logger.info('Cache hit', {
          key: fullKey,
          url: req.url,
          method: req.method
        });
        
        res.json(cachedData);
        return;
      }

      // Cache miss - continue to next middleware
      logger.info('Cache miss', {
        key: fullKey,
        url: req.url,
        method: req.method
      });

      // Override res.json to cache the response
      const originalJson = res.json;
      res.json = function(body: any) {
        // Cache the response
        cacheService.set(fullKey, body, { ttl }).catch(error => {
        logger.error('Failed to cache response', {
          key: fullKey,
          error: (error as Error).message
        });
        });

        // Call original json method
        return originalJson.call(this, body);
      };

      next();
    } catch (error) {
      logger.error('Cache middleware error', {
        error: (error as Error).message,
        url: req.url,
        method: req.method
      });
      
      // Continue without caching on error
      next();
    }
  };
};

// Specific cache middleware for different endpoints
export const birdCacheMiddleware = cacheMiddleware({
  ttl: 600, // 10 minutes
  prefix: 'birds:',
  keyGenerator: (req: Request) => {
    const userId = (req as any).user?.uid || 'anonymous';
    const farmId = (req as any).user?.farmId || 'no-farm';
    const { query } = req;
    
    return `farm:${farmId}:user:${userId}:${JSON.stringify(query)}`;
  }
});

export const statsCacheMiddleware = cacheMiddleware({
  ttl: 300, // 5 minutes
  prefix: 'stats:',
  keyGenerator: (req: Request) => {
    const userId = (req as any).user?.uid || 'anonymous';
    const farmId = (req as any).user?.farmId || 'no-farm';
    const { query } = req;
    
    return `farm:${farmId}:user:${userId}:${JSON.stringify(query)}`;
  }
});

export const userCacheMiddleware = cacheMiddleware({
  ttl: 1800, // 30 minutes
  prefix: 'users:',
  keyGenerator: (req: Request) => {
    const userId = (req as any).user?.uid || 'anonymous';
    return `profile:${userId}`;
  }
});

// Cache invalidation middleware
export const invalidateCache = (patterns: string[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Store original response methods
      const originalJson = res.json;
      const originalSend = res.send;

      // Override response methods to invalidate cache after successful operations
      res.json = function(body: any) {
        // Only invalidate cache for successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          patterns.forEach(pattern => {
            cacheService.flush(pattern).catch(error => {
              logger.error('Failed to invalidate cache', {
                pattern,
                error: (error as Error).message
              });
            });
          });
        }
        
        return originalJson.call(this, body);
      };

      res.send = function(body: any) {
        // Only invalidate cache for successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          patterns.forEach(pattern => {
            cacheService.flush(pattern).catch(error => {
              logger.error('Failed to invalidate cache', {
                pattern,
                error: (error as Error).message
              });
            });
          });
        }
        
        return originalSend.call(this, body);
      };

      next();
    } catch (error) {
      logger.error('Cache invalidation middleware error', {
        error: (error as Error).message
      });
      next();
    }
  };
};

// Cache warming middleware
export const warmCache = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // This could be used to pre-warm frequently accessed data
    const userId = (req as any).user?.uid;
    const farmId = (req as any).user?.farmId;

    if (userId && farmId) {
      // Warm user cache
      const userCacheKey = `users:user:${userId}`;
      const cachedUser = await cacheService.getCachedUser(userId);
      
      if (!cachedUser) {
        // User not in cache, could trigger background fetch
        logger.info('User cache miss detected, could warm cache', { userId });
      }

      // Warm farm stats cache
      const statsCacheKey = `farm:stats:${farmId}`;
      const cachedStats = await cacheService.getCachedStats(farmId);
      
      if (!cachedStats) {
        logger.info('Stats cache miss detected, could warm cache', { farmId });
      }
    }

    next();
  } catch (error) {
      logger.error('Cache warming error', { error: (error as Error).message });
    next();
  }
};
