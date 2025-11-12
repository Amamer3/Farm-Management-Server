import request from 'supertest';
import app from '../../src/app';

// Mock Firebase services
jest.mock('../../src/services/firebaseService');
jest.mock('../../src/services/firestoreService');

describe('API Integration Tests', () => {
  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({ 
        status: 'OK',
        environment: expect.any(String),
        version: '1.0.0'
      });
    });
  });

  describe('API Info', () => {
    it('should return API information', async () => {
      const response = await request(app)
        .get('/api')
        .expect(200);

      expect(response.body).toMatchObject({
        name: 'Farm Management API',
        version: '1.0.0',
        description: 'RESTful API for poultry farm management system'
      });
    });
  });

  describe('Authentication Endpoints', () => {
    describe('POST /api/auth/login', () => {
      it('should reject login without credentials', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({})
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('Missing required fields');
      });

      it('should reject login with invalid email format', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: 'invalid-email',
            password: 'password123'
          })
          .expect(400);

        expect(response.body.success).toBe(false);
      });
    });

    describe('POST /api/auth/register', () => {
      it('should reject registration without authentication', async () => {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            email: 'test@example.com',
            password: 'password123',
            name: 'Test User',
            role: 'FARM_WORKER'
          })
          .expect(401);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('Authorization header is required');
      });
    });
  });

  describe('Protected Endpoints', () => {
    it('should reject access to protected endpoints without token', async () => {
      const response = await request(app)
        .get('/api/birds')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Authorization header is required');
    });

    it('should reject access with invalid token', async () => {
      const response = await request(app)
        .get('/api/birds')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Validation', () => {
    it('should validate pagination parameters', async () => {
      const response = await request(app)
        .get('/api/birds?page=invalid&limit=abc')
        .set('Authorization', 'Bearer valid-token')
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });
});
