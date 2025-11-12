import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import path from 'path';
import { apiReference } from '@scalar/express-api-reference';
import { config } from './config/config';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { transformRequest } from './middleware/enhancedValidation';
import { 
  sanitizeInput, 
  requestSizeLimiter, 
  securityHeaders, 
  validateRequest, 
  auditLogger 
} from './middleware/securityMiddleware';
import { addRequestId, logPerformance } from './utils/enhancedLogger';
import { rateLimitConfig } from './middleware/rateLimiter';
import { requestLogger } from './middleware/requestLogger';
import { metricsMiddleware, metricsEndpoint, healthCheckWithMetrics, startMetricsCollection } from './middleware/metrics';
import { performanceMiddleware, performanceHealthCheck } from './middleware/performanceMonitor';
import openApiSpec from './openapi.json';

// Import routes
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import birdRoutes from './routes/birds';
import collectionRoutes from './routes/collections';
import eggsRoutes from './routes/eggs';
import feedRoutes from './routes/feed';
import medicineRoutes from './routes/medicine';
import statsRoutes from './routes/stats';
import reportsRoutes from './routes/reports';
import dashboardRoutes from './routes/dashboard';
import uploadRoutes from './routes/upload';
import dataBackupRoutes from './routes/dataBackup';
import dataExportRoutes from './routes/dataExport';

const app = express();

// CORS configuration - MUST be first to handle preflight requests
app.use(cors({
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (config.cors.allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Return error that will be handled by error handler middleware
    return callback(new Error('Not allowed by CORS policy'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
  optionsSuccessStatus: 200, // Some legacy browsers choke on 204
}));

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net"], // unsafe-eval needed for WebAssembly
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://fonts.scalar.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://cdn.jsdelivr.net"], // Allow connections to cdn.jsdelivr.net for API docs
    },
  },
  crossOriginEmbedderPolicy: false,
})); 

// Additional security middleware
app.use(securityHeaders);
app.use(validateRequest);
app.use(requestSizeLimiter('10mb'));
app.use(sanitizeInput);
app.use(transformRequest);
app.use(auditLogger);

// Compression middleware
app.use(compression());

// Rate limiting (skip in development if RATE_LIMIT_DISABLED is set)
if (process.env.RATE_LIMIT_DISABLED && !config.isProduction) {
  // Rate limiting disabled in development mode
} else {
  app.use(rateLimit(rateLimitConfig));
}

// Request logging and performance monitoring
app.use(addRequestId);
app.use(logPerformance);
app.use(morgan('combined'));
app.use(requestLogger);
app.use(performanceMiddleware);
app.use(metricsMiddleware);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files (avatars and uploads)
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Welcome to Farm Management Server API',
    version: '1.0.0',
    documentation: '/docs',
    api: '/api',
    health: '/health',
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint with performance data
app.get('/health', healthCheckWithMetrics);

// Metrics endpoint
app.get('/metrics', metricsEndpoint);

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/birds', birdRoutes);
app.use('/api/collections', collectionRoutes);
app.use('/api/eggs', eggsRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/medicine', medicineRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/data-export', dataExportRoutes);
app.use('/api/data-backup', dataBackupRoutes);

// API Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.nodeEnv,
    version: '1.0.0'
  });
});

// API documentation with Scalar
app.use('/docs', apiReference({
  content: openApiSpec, // Fixed: removed deprecated 'spec' prefix
  theme: 'purple',
  layout: 'modern',
  showSidebar: true,
  hideDownloadButton: false,
  searchHotKey: 'k',
  defaultHttpClient: {
    targetKey: 'javascript',
    clientKey: 'fetch'
  },
  withDefaultFonts: true,
  customCss: `
    .scalar-card {
      border-radius: 8px;
    }
  `
}));

// API documentation endpoint (legacy)
app.get('/api', (req, res) => {
  res.json({
    name: 'Farm Management API',
    version: '1.0.0',
    description: 'RESTful API for poultry farm management system',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      birds: '/api/birds',
      collections: '/api/collections',
      feed: '/api/feed',
      medicine: '/api/medicine',
      stats: '/api/stats',
      reports: '/api/reports',
      dashboard: '/api/dashboard',
      upload: '/api/upload',
    },
    documentation: '/docs',
    openapi: '/docs/openapi.json',
  });
});

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

export default app;