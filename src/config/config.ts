// Load dotenv first to ensure env vars are available
import * as dotenv from 'dotenv';
dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

// Validate required environment variables in production
// Note: This validation happens at module load time
// Make sure environment variables are set before importing this module
if (isProduction) {
  const requiredVars = [
    'FIREBASE_PROJECT_ID',
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_CLIENT_EMAIL',
    'JWT_SECRET'
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:', missingVars.join(', '));
    console.error('Please set all required environment variables before starting the server in production mode.');
    console.error('Required variables:', requiredVars.join(', '));
    process.exit(1);
  }

  // Validate JWT secret is not the default
  if (process.env.JWT_SECRET === 'your-jwt-secret-key') {
    console.error('❌ JWT_SECRET must be changed from the default value in production');
    process.exit(1);
  }
  
  console.log('✅ Environment variables validated successfully');
}

export const config = {
  port: process.env.PORT || 3000,
  nodeEnv,
  isProduction,
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    databaseURL: process.env.FIREBASE_DATABASE_URL
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'your-jwt-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  },
  cors: {
    allowedOrigins: process.env.CORS_ORIGIN 
      ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
      : isProduction 
        ? [] // No default origins in production - must be explicitly set
        : ['http://localhost:8080', 'http://localhost:3000', 'http://127.0.0.1:8080', 'http://127.0.0.1:3000', 'https://farm-management-system-five.vercel.app'],
    credentials: true
  },
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
  }
};