import Redis from 'ioredis';
import { logger } from '../utils/logger';

export interface CacheConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  retryDelayOnFailover?: number;
  maxRetriesPerRequest?: number;
  lazyConnect?: boolean;
}

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string;
  serialize?: boolean;
}

class CacheService {
  private redis: Redis;
  private isConnected: boolean = false;
  private defaultTTL: number = 3600; // 1 hour
  private defaultPrefix: string = 'farm_management:';

  constructor(config?: CacheConfig) {
    const redisConfig: CacheConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      ...config
    };

    this.redis = new Redis(redisConfig);

    this.redis.on('connect', () => {
      this.isConnected = true;
      logger.info('Redis connected successfully');
    });

    this.redis.on('error', (error) => {
      this.isConnected = false;
      logger.error('Redis connection error', { error: error.message });
    });

    this.redis.on('close', () => {
      this.isConnected = false;
      logger.warn('Redis connection closed');
    });

    this.redis.on('reconnecting', () => {
      logger.info('Redis reconnecting...');
    });
  }

  private getKey(key: string, prefix?: string): string {
    const keyPrefix = prefix || this.defaultPrefix;
    return `${keyPrefix}${key}`;
  }

  private serialize(value: any): string {
    try {
      return JSON.stringify(value);
    } catch (error) {
      logger.error('Failed to serialize cache value', { error: (error as Error).message });
      throw new Error('Failed to serialize cache value');
    }
  }

  private deserialize<T>(value: string): T {
    try {
      return JSON.parse(value);
    } catch (error) {
      logger.error('Failed to deserialize cache value', { error: (error as Error).message });
      throw new Error('Failed to deserialize cache value');
    }
  }

  async get<T>(key: string, options?: CacheOptions): Promise<T | null> {
    if (!this.isConnected) {
      logger.warn('Redis not connected, skipping cache get', { key });
      return null;
    }

    try {
      const cacheKey = this.getKey(key, options?.prefix);
      const value = await this.redis.get(cacheKey);
      
      if (!value) {
        return null;
      }

      return options?.serialize !== false ? this.deserialize<T>(value) : value as T;
    } catch (error) {
      logger.error('Cache get error', { key, error: (error as Error).message });
      return null;
    }
  }

  async set(key: string, value: any, options?: CacheOptions): Promise<boolean> {
    if (!this.isConnected) {
      logger.warn('Redis not connected, skipping cache set', { key });
      return false;
    }

    try {
      const cacheKey = this.getKey(key, options?.prefix);
      const serializedValue = options?.serialize !== false ? this.serialize(value) : value;
      const ttl = options?.ttl || this.defaultTTL;

      await this.redis.setex(cacheKey, ttl, serializedValue);
      return true;
    } catch (error) {
      logger.error('Cache set error', { key, error: (error as Error).message });
      return false;
    }
  }

  async del(key: string, prefix?: string): Promise<boolean> {
    if (!this.isConnected) {
      logger.warn('Redis not connected, skipping cache delete', { key });
      return false;
    }

    try {
      const cacheKey = this.getKey(key, prefix);
      const result = await this.redis.del(cacheKey);
      return result > 0;
    } catch (error) {
      logger.error('Cache delete error', { key, error: (error as Error).message });
      return false;
    }
  }

  async exists(key: string, prefix?: string): Promise<boolean> {
    if (!this.isConnected) {
      return false;
    }

    try {
      const cacheKey = this.getKey(key, prefix);
      const result = await this.redis.exists(cacheKey);
      return result === 1;
    } catch (error) {
      logger.error('Cache exists error', { key, error: (error as Error).message });
      return false;
    }
  }

  async expire(key: string, ttl: number, prefix?: string): Promise<boolean> {
    if (!this.isConnected) {
      return false;
    }

    try {
      const cacheKey = this.getKey(key, prefix);
      const result = await this.redis.expire(cacheKey, ttl);
      return result === 1;
    } catch (error) {
      logger.error('Cache expire error', { key, error: (error as Error).message });
      return false;
    }
  }

  async ttl(key: string, prefix?: string): Promise<number> {
    if (!this.isConnected) {
      return -1;
    }

    try {
      const cacheKey = this.getKey(key, prefix);
      return await this.redis.ttl(cacheKey);
    } catch (error) {
      logger.error('Cache TTL error', { key, error: (error as Error).message });
      return -1;
    }
  }

  async flush(pattern?: string): Promise<boolean> {
    if (!this.isConnected) {
      return false;
    }

    try {
      if (pattern) {
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      } else {
        await this.redis.flushdb();
      }
      return true;
    } catch (error) {
      logger.error('Cache flush error', { pattern, error: (error as Error).message });
      return false;
    }
  }

  async getStats(): Promise<any> {
    if (!this.isConnected) {
      return null;
    }

    try {
      const info = await this.redis.info();
      const stats = {
        connected: this.isConnected,
        memory: {},
        keyspace: {},
        clients: {}
      };

      // Parse Redis INFO output
      const lines = info.split('\r\n');
      for (const line of lines) {
        if (line.includes('used_memory:')) {
          (stats.memory as any)['used_memory'] = line.split(':')[1];
        } else if (line.includes('used_memory_peak:')) {
          (stats.memory as any)['used_memory_peak'] = line.split(':')[1];
        } else if (line.includes('connected_clients:')) {
          (stats.clients as any)['connected_clients'] = line.split(':')[1];
        }
      }

      return stats;
    } catch (error) {
      logger.error('Cache stats error', { error: (error as Error).message });
      return null;
    }
  }

  // Cache patterns for common use cases
  async cacheUser(userId: string, userData: any, ttl: number = 1800): Promise<boolean> {
    return this.set(`user:${userId}`, userData, { ttl, prefix: 'users:' });
  }

  async getCachedUser(userId: string): Promise<any> {
    return this.get(`user:${userId}`, { prefix: 'users:' });
  }

  async cacheBirds(farmId: string, birds: any[], ttl: number = 600): Promise<boolean> {
    return this.set(`birds:${farmId}`, birds, { ttl, prefix: 'farm:' });
  }

  async getCachedBirds(farmId: string): Promise<any[]> {
    const result = await this.get(`birds:${farmId}`, { prefix: 'farm:' });
    return (result as any[]) || [];
  }

  async cacheStats(farmId: string, stats: any, ttl: number = 300): Promise<boolean> {
    return this.set(`stats:${farmId}`, stats, { ttl, prefix: 'farm:' });
  }

  async getCachedStats(farmId: string): Promise<any> {
    return this.get(`stats:${farmId}`, { prefix: 'farm:' });
  }

  async invalidateFarmCache(farmId: string): Promise<void> {
    const patterns = [
      `farm:birds:${farmId}`,
      `farm:stats:${farmId}`,
      `farm:collections:${farmId}`,
      `farm:feed:${farmId}`,
      `farm:medicine:${farmId}`
    ];

    for (const pattern of patterns) {
      await this.flush(pattern);
    }
  }

  async invalidateUserCache(userId: string): Promise<void> {
    await this.del(`user:${userId}`, 'users:');
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      await this.redis.ping();
      return this.isConnected;
    } catch (error) {
      logger.error('Redis health check failed', { error: (error as Error).message });
      return false;
    }
  }

  // Graceful shutdown
  async disconnect(): Promise<void> {
    try {
      await this.redis.quit();
      logger.info('Redis disconnected gracefully');
    } catch (error) {
      logger.error('Error disconnecting from Redis', { error: (error as Error).message });
    }
  }
}

// Singleton instance
export const cacheService = new CacheService();
export default cacheService;
