import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import cacheService from '../services/cacheService';

export interface PerformanceMetrics {
  requestCount: number;
  totalResponseTime: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  errorCount: number;
  successCount: number;
  cacheHitRate: number; 
  cacheMissCount: number;
  cacheHitCount: number;
}

export interface EndpointMetrics {
  [endpoint: string]: PerformanceMetrics;
}

class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetrics> = new Map();
  private cacheStats = {
    hits: 0,
    misses: 0
  };

  private initializeMetrics(endpoint: string): PerformanceMetrics {
    return {
      requestCount: 0,
      totalResponseTime: 0,
      averageResponseTime: 0,
      minResponseTime: Infinity,
      maxResponseTime: 0,
      errorCount: 0,
      successCount: 0,
      cacheHitRate: 0,
      cacheMissCount: 0,
      cacheHitCount: 0
    };
  }

  private updateMetrics(endpoint: string, responseTime: number, isError: boolean, isCacheHit: boolean): void {
    if (!this.metrics.has(endpoint)) {
      this.metrics.set(endpoint, this.initializeMetrics(endpoint));
    }

    const metrics = this.metrics.get(endpoint)!;
    
    metrics.requestCount++;
    metrics.totalResponseTime += responseTime;
    metrics.averageResponseTime = metrics.totalResponseTime / metrics.requestCount;
    metrics.minResponseTime = Math.min(metrics.minResponseTime, responseTime);
    metrics.maxResponseTime = Math.max(metrics.maxResponseTime, responseTime);

    if (isError) {
      metrics.errorCount++;
    } else {
      metrics.successCount++;
    }

    if (isCacheHit) {
      metrics.cacheHitCount++;
      this.cacheStats.hits++;
    } else {
      metrics.cacheMissCount++;
      this.cacheStats.misses++;
    }

    metrics.cacheHitRate = metrics.cacheHitCount / (metrics.cacheHitCount + metrics.cacheMissCount) * 100;
  }

  public recordRequest(endpoint: string, responseTime: number, isError: boolean, isCacheHit: boolean): void {
    this.updateMetrics(endpoint, responseTime, isError, isCacheHit);
  }

  public getMetrics(): EndpointMetrics {
    const result: EndpointMetrics = {};
    this.metrics.forEach((metrics, endpoint) => {
      result[endpoint] = { ...metrics };
    });
    return result;
  }

  public getOverallMetrics(): PerformanceMetrics {
    const overall: PerformanceMetrics = {
      requestCount: 0,
      totalResponseTime: 0,
      averageResponseTime: 0,
      minResponseTime: Infinity,
      maxResponseTime: 0,
      errorCount: 0,
      successCount: 0,
      cacheHitRate: 0,
      cacheMissCount: 0,
      cacheHitCount: 0
    };

    this.metrics.forEach(metrics => {
      overall.requestCount += metrics.requestCount;
      overall.totalResponseTime += metrics.totalResponseTime;
      overall.errorCount += metrics.errorCount;
      overall.successCount += metrics.successCount;
      overall.cacheHitCount += metrics.cacheHitCount;
      overall.cacheMissCount += metrics.cacheMissCount;
      overall.minResponseTime = Math.min(overall.minResponseTime, metrics.minResponseTime);
      overall.maxResponseTime = Math.max(overall.maxResponseTime, metrics.maxResponseTime);
    });

    if (overall.requestCount > 0) {
      overall.averageResponseTime = overall.totalResponseTime / overall.requestCount;
    }

    if (overall.cacheHitCount + overall.cacheMissCount > 0) {
      overall.cacheHitRate = overall.cacheHitCount / (overall.cacheHitCount + overall.cacheMissCount) * 100;
    }

    return overall;
  }

  public resetMetrics(): void {
    this.metrics.clear();
    this.cacheStats = { hits: 0, misses: 0 };
  }

  public getCacheStats() {
    return { ...this.cacheStats };
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Performance monitoring middleware
export const performanceMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  const endpoint = `${req.method} ${req.route?.path || req.path}`;
  
  // Track if this is a cache hit
  let isCacheHit = false;
  
  // Override res.json to track cache hits
  const originalJson = res.json;
  res.json = function(body: any) {
    // Check if response was served from cache
    if (res.getHeader('X-Cache') === 'HIT') {
      isCacheHit = true;
    }
    
    return originalJson.call(this, body);
  };

  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    const isError = res.statusCode >= 400;
    
    // Record the metrics
    performanceMonitor.recordRequest(endpoint, responseTime, isError, isCacheHit);
    
    // Log slow requests
    if (responseTime > 1000) {
      logger.warn('Slow request detected', {
        endpoint,
        responseTime: `${responseTime}ms`,
        statusCode: res.statusCode,
        method: req.method,
        url: req.url,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });
    }
    
    // Log performance metrics periodically
    if (Math.random() < 0.01) { // Log 1% of requests
      logger.info('Performance metrics', {
        endpoint,
        responseTime: `${responseTime}ms`,
        statusCode: res.statusCode,
        cacheHit: isCacheHit
      });
    }
  });

  next();
};

// Database performance monitoring
export const databasePerformanceMonitor = {
  async measureQuery<T>(
    operation: string,
    queryFn: () => Promise<T>,
    context?: any
  ): Promise<T> {
    const startTime = Date.now();
    
    try {
      const result = await queryFn();
      const duration = Date.now() - startTime;
      
      logger.info('Database query completed', {
        operation,
        duration: `${duration}ms`,
        context
      });
      
      // Log slow queries
      if (duration > 500) {
        logger.warn('Slow database query detected', {
          operation,
          duration: `${duration}ms`,
          context
        });
      }
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Database query failed', {
        operation,
        duration: `${duration}ms`,
        error: (error as Error).message,
        context
      });
      
      throw error;
    }
  }
};

// Memory monitoring
export const memoryMonitor = {
  getMemoryUsage(): any {
    const usage = process.memoryUsage();
    return {
      rss: `${Math.round(usage.rss / 1024 / 1024)} MB`,
      heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)} MB`,
      heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)} MB`,
      external: `${Math.round(usage.external / 1024 / 1024)} MB`,
      arrayBuffers: `${Math.round(usage.arrayBuffers / 1024 / 1024)} MB`
    };
  },

  logMemoryUsage(): void {
    const memoryUsage = this.getMemoryUsage();
    logger.info('Memory usage', memoryUsage);
  }
};

// System metrics collector
export const systemMetrics = {
  async collect(): Promise<any> {
    const memoryUsage = memoryMonitor.getMemoryUsage();
    const overallMetrics = performanceMonitor.getOverallMetrics();
    const cacheStats = performanceMonitor.getCacheStats();
    const redisStats = await cacheService.getStats();
    
    return {
      timestamp: new Date().toISOString(),
      memory: memoryUsage,
      performance: overallMetrics,
      cache: {
        ...cacheStats,
        redis: redisStats
      },
      uptime: process.uptime(),
      nodeVersion: process.version,
      platform: process.platform
    };
  },

  async logMetrics(): Promise<void> {
    try {
      const metrics = await this.collect();
      logger.info('System metrics', metrics);
    } catch (error) {
      logger.error('Failed to collect system metrics', { error: (error as Error).message });
    }
  }
};

// Health check with performance data
export const performanceHealthCheck = async (req: Request, res: Response): Promise<void> => {
  try {
    const metrics = await systemMetrics.collect();
    const isHealthy = metrics.memory.heapUsed < 500; // Less than 500MB heap usage
    
    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: metrics.timestamp,
      metrics: {
        memory: metrics.memory,
        performance: {
          averageResponseTime: metrics.performance.averageResponseTime,
          errorRate: metrics.performance.requestCount > 0 
            ? (metrics.performance.errorCount / metrics.performance.requestCount) * 100 
            : 0,
          cacheHitRate: metrics.performance.cacheHitRate
        },
        uptime: metrics.uptime
      }
    });
  } catch (error) {
    logger.error('Health check failed', { error: (error as Error).message });
    res.status(503).json({
      status: 'unhealthy',
      error: 'Health check failed'
    });
  }
};

// Metrics endpoint
export const metricsEndpoint = async (req: Request, res: Response): Promise<void> => {
  try {
    const metrics = await systemMetrics.collect();
    res.json({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get metrics', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve metrics'
    });
  }
};

export default performanceMonitor;
