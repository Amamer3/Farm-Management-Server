import request from 'supertest';
import app from '../../src/app';

describe('End-to-End Workflow Tests', () => {
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    // Setup test data
    // This would typically involve creating test users and data
  });
 
  afterAll(async () => {
    // Cleanup test data
  });

  describe('Complete User Registration and Login Flow', () => {
    it('should complete full registration and login workflow', async () => {
      // Step 1: Register a new user (requires super admin token)
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .set('Authorization', 'Bearer super-admin-token')
        .send({
          email: 'e2e-test@example.com',
          password: 'password123',
          name: 'E2E Test User',
          role: 'FARM_WORKER',
          farmId: 'test-farm-123'
        });

      expect(registerResponse.status).toBe(201);
      expect(registerResponse.body.success).toBe(true);

      // Step 2: Login with the new user
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'e2e-test@example.com',
          password: 'password123'
        });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body.success).toBe(true);
      expect(loginResponse.body.data.token).toBeDefined();

      authToken = loginResponse.body.data.token;
      userId = loginResponse.body.data.user.id;
    });
  });

  describe('Complete Bird Management Workflow', () => {
    it('should complete bird creation and retrieval workflow', async () => {
      // Step 1: Create a new bird
      const createBirdResponse = await request(app)
        .post('/api/birds')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          penId: 'pen-1',
          breed: 'Rhode Island Red',
          age: 6,
          quantity: 50,
          farmId: 'test-farm-123'
        });

      expect(createBirdResponse.status).toBe(201);
      expect(createBirdResponse.body.success).toBe(true);

      const birdId = createBirdResponse.body.data.id;

      // Step 2: Retrieve the created bird
      const getBirdResponse = await request(app)
        .get(`/api/birds/${birdId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(getBirdResponse.status).toBe(200);
      expect(getBirdResponse.body.success).toBe(true);
      expect(getBirdResponse.body.data.id).toBe(birdId);

      // Step 3: Update the bird
      const updateBirdResponse = await request(app)
        .put(`/api/birds/${birdId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          quantity: 45,
          notes: 'Updated quantity after mortality'
        });

      expect(updateBirdResponse.status).toBe(200);
      expect(updateBirdResponse.body.success).toBe(true);
    });
  });

  describe('Complete Egg Collection Workflow', () => {
    it('should complete egg collection recording workflow', async () => {
      // Step 1: Record egg collection
      const collectionResponse = await request(app)
        .post('/api/collections')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          date: new Date().toISOString(),
          shift: 'Morning',
          pen: 'pen-1',
          quantity: 25,
          grade: 'A',
          avgWeight: '60g',
          collector: 'John Doe',
          farmId: 'test-farm-123'
        });

      expect(collectionResponse.status).toBe(201);
      expect(collectionResponse.body.success).toBe(true);

      const collectionId = collectionResponse.body.data.id;

      // Step 2: Get daily summary
      const summaryResponse = await request(app)
        .get('/api/collections/daily-summary')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          date: new Date().toISOString().split('T')[0]
        });

      expect(summaryResponse.status).toBe(200);
      expect(summaryResponse.body.success).toBe(true);
    });
  });

  describe('Complete Dashboard Workflow', () => {
    it('should retrieve dashboard statistics', async () => {
      // Step 1: Get dashboard stats
      const dashboardResponse = await request(app)
        .get('/api/stats/dashboard')
        .set('Authorization', `Bearer ${authToken}`);

      expect(dashboardResponse.status).toBe(200);
      expect(dashboardResponse.body.success).toBe(true);
      expect(dashboardResponse.body.data).toHaveProperty('totalBirds');
      expect(dashboardResponse.body.data).toHaveProperty('todayEggs');
    });
  });
});
