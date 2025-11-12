import { register, collectDefaultMetrics, Counter, Histogram, Gauge, Summary } from 'prom-client';
import { Request, Response } from 'express';

// Clear the registry to avoid conflicts
register.clear();

// Enable default metrics collection
collectDefaultMetrics({
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
  eventLoopMonitoringPrecision: 10
}); 

// Custom metrics
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
});

export const httpRequestTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

export const httpRequestErrors = new Counter({
  name: 'http_request_errors_total',
  help: 'Total number of HTTP request errors',
  labelNames: ['method', 'route', 'error_type']
});

export const activeConnections = new Gauge({
  name: 'active_connections',
  help: 'Number of active connections'
});

export const cacheHitRate = new Gauge({
  name: 'cache_hit_rate',
  help: 'Cache hit rate percentage'
});

export const cacheOperations = new Counter({
  name: 'cache_operations_total',
  help: 'Total number of cache operations',
  labelNames: ['operation', 'result']
});

export const databaseOperations = new Counter({
  name: 'database_operations_total',
  help: 'Total number of database operations',
  labelNames: ['operation', 'collection', 'result']
});

export const databaseOperationDuration = new Histogram({
  name: 'database_operation_duration_seconds',
  help: 'Duration of database operations in seconds',
  labelNames: ['operation', 'collection'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});

export const businessMetrics = {
  totalUsers: new Gauge({
    name: 'farm_users_total',
    help: 'Total number of users'
  }),
  
  totalBirds: new Gauge({
    name: 'farm_birds_total',
    help: 'Total number of birds'
  }),
  
  totalEggsCollected: new Counter({
    name: 'farm_eggs_collected_total',
    help: 'Total number of eggs collected',
    labelNames: ['farm_id', 'grade']
  }),
  
  dailyEggProduction: new Gauge({
    name: 'farm_daily_egg_production',
    help: 'Daily egg production',
    labelNames: ['farm_id']
  }),
  
  feedConsumption: new Counter({
    name: 'farm_feed_consumption_total',
    help: 'Total feed consumption',
    labelNames: ['farm_id', 'feed_type']
  }),
  
  medicineUsage: new Counter({
    name: 'farm_medicine_usage_total',
    help: 'Total medicine usage',
    labelNames: ['farm_id', 'medicine_type']
  })
};

export const systemMetrics = {
  memoryUsage: new Gauge({
    name: 'nodejs_memory_usage_bytes',
    help: 'Node.js memory usage in bytes',
    labelNames: ['type']
  }),
  
  cpuUsage: new Gauge({
    name: 'nodejs_cpu_usage_percent',
    help: 'Node.js CPU usage percentage'
  }),
  
  eventLoopLag: new Gauge({
    name: 'farm_api_eventloop_lag_seconds',
    help: 'Farm API event loop lag in seconds'
  }),
  
  heapSize: new Gauge({
    name: 'farm_api_heap_size_bytes',
    help: 'Farm API heap size in bytes',
    labelNames: ['type']
  })
};

// Metrics collection middleware
export const metricsMiddleware = (req: Request, res: Response, next: Function): void => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path;
    
    httpRequestDuration
      .labels(req.method, route, res.statusCode.toString())
      .observe(duration);
    
    httpRequestTotal
      .labels(req.method, route, res.statusCode.toString())
      .inc();
    
    if (res.statusCode >= 400) {
      httpRequestErrors
        .labels(req.method, route, getErrorType(res.statusCode))
        .inc();
    }
  });
  
  next();
};

// Helper function to categorize error types
const getErrorType = (statusCode: number): string => {
  if (statusCode >= 500) return 'server_error';
  if (statusCode >= 400) return 'client_error';
  return 'unknown';
};

// Cache metrics helpers
export const cacheMetrics = {
  recordHit: (operation: string): void => {
    cacheOperations.labels(operation, 'hit').inc();
  },
  
  recordMiss: (operation: string): void => {
    cacheOperations.labels(operation, 'miss').inc();
  },
  
  recordError: (operation: string): void => {
    cacheOperations.labels(operation, 'error').inc();
  },
  
  updateHitRate: (rate: number): void => {
    cacheHitRate.set(rate);
  }
};

// Database metrics helpers
export const dbMetrics = {
  recordOperation: (operation: string, collection: string, success: boolean): void => {
    databaseOperations
      .labels(operation, collection, success ? 'success' : 'error')
      .inc();
  },
  
  recordDuration: (operation: string, collection: string, duration: number): void => {
    databaseOperationDuration
      .labels(operation, collection)
      .observe(duration);
  }
};

// Business metrics helpers
export const businessMetricsHelpers = {
  updateUserCount: (count: number): void => {
    businessMetrics.totalUsers.set(count);
  },
  
  updateBirdCount: (count: number): void => {
    businessMetrics.totalBirds.set(count);
  },
  
  recordEggCollection: (farmId: string, grade: string, quantity: number): void => {
    businessMetrics.totalEggsCollected
      .labels(farmId, grade)
      .inc(quantity);
  },
  
  updateDailyProduction: (farmId: string, production: number): void => {
    businessMetrics.dailyEggProduction
      .labels(farmId)
      .set(production);
  },
  
  recordFeedConsumption: (farmId: string, feedType: string, quantity: number): void => {
    businessMetrics.feedConsumption
      .labels(farmId, feedType)
      .inc(quantity);
  },
  
  recordMedicineUsage: (farmId: string, medicineType: string, quantity: number): void => {
    businessMetrics.medicineUsage
      .labels(farmId, medicineType)
      .inc(quantity);
  }
};

// System metrics collection
export const collectSystemMetrics = (): void => {
  const memUsage = process.memoryUsage();
  
  systemMetrics.memoryUsage.labels('rss').set(memUsage.rss);
  systemMetrics.memoryUsage.labels('heapTotal').set(memUsage.heapTotal);
  systemMetrics.memoryUsage.labels('heapUsed').set(memUsage.heapUsed);
  systemMetrics.memoryUsage.labels('external').set(memUsage.external);
  systemMetrics.memoryUsage.labels('arrayBuffers').set(memUsage.arrayBuffers);
  
  systemMetrics.heapSize.labels('total').set(memUsage.heapTotal);
  systemMetrics.heapSize.labels('used').set(memUsage.heapUsed);
};

// Metrics endpoint
export const metricsEndpoint = async (req: Request, res: Response): Promise<void> => {
  try {
    // Collect system metrics
    collectSystemMetrics();
    
    // Set content type
    res.set('Content-Type', register.contentType);
    
    // Get metrics
    const metrics = await register.metrics();
    
    res.end(metrics);
  } catch (error) {
    res.status(500).end('Error collecting metrics');
  }
};

// Health check with metrics
export const healthCheckWithMetrics = async (req: Request, res: Response): Promise<void> => {
  try {
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();
    
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: uptime,
      memory: {
        rss: `${Math.round(memUsage.rss / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`,
        external: `${Math.round(memUsage.external / 1024 / 1024)} MB`
      },
      metrics: {
        endpoint: '/metrics',
        prometheus: true
      }
    };
    
    res.json(health);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: 'Health check failed'
    });
  }
};

// Start metrics collection interval
export const startMetricsCollection = (): void => {
  // Collect system metrics every 30 seconds
  setInterval(collectSystemMetrics, 30000);
  
  // Update business metrics every 5 minutes
  setInterval(async () => {
    try {
      // This would typically fetch from your database
      // businessMetricsHelpers.updateUserCount(await getUserCount());
      // businessMetricsHelpers.updateBirdCount(await getBirdCount());
    } catch (error) {
      console.error('Error updating business metrics:', error);
    }
  }, 300000);
};

export default {
  register,
  metricsMiddleware,
  cacheMetrics,
  dbMetrics,
  businessMetricsHelpers,
  metricsEndpoint,
  healthCheckWithMetrics,
  startMetricsCollection
};
