import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import {
  EggCollection,
  User,
  Bird,
  FeedInventory,
  MedicineRecord,
  VaccinationSchedule,
  QueryOptions,
  CollectionQueryOptions,
  BirdQueryOptions,
  CreateRequest,
  UpdateRequest,
  PaginatedResponse,
  ApiResponse
} from '../models/types';
import { v4 as uuidv4 } from 'uuid';

class FirestoreService {
  private static instance: FirestoreService;
  private db: admin.firestore.Firestore;

  private constructor() {
    this.initializeFirebase();
    this.db = admin.firestore();
    this.db.settings({ ignoreUndefinedProperties: true });
  }

  private initializeFirebase(): void {
    try {
      // Check if Firebase is already initialized
      if (admin.apps.length === 0) {
        const serviceAccount = this.getServiceAccountConfig();
        
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: process.env.FIREBASE_PROJECT_ID,
        });

        console.log('Firebase Admin SDK initialized successfully for Firestore');
      }
    } catch (error) {
      console.error('Error initializing Firebase Admin SDK:', error);
      throw new Error('Failed to initialize Firebase Admin SDK');
    }
  }

  private getServiceAccountConfig(): admin.ServiceAccount {
    // Try to load from environment variables first
    if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
      return {
        projectId: process.env.FIREBASE_PROJECT_ID!,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      };
    }

    // Fallback to service account file
    try {
      const serviceAccount = require('../../firebase-service-account.json');
      return serviceAccount as admin.ServiceAccount;
    } catch (error) {
      throw new Error(
        'Firebase service account configuration not found. Please provide either environment variables or firebase-service-account.json file.'
      );
    }
  }

  public static getInstance(): FirestoreService {
    if (!FirestoreService.instance) {
      FirestoreService.instance = new FirestoreService();
    }
    return FirestoreService.instance;
  }

  // Generic CRUD operations
  private async create<T>(
    collection: string,
    data: CreateRequest<T>,
    customId?: string
  ): Promise<T & { id: string }> {
    try {
      const id = customId || uuidv4();
      const timestamp = admin.firestore.Timestamp.now();
      const docData = {
        ...data,
        id,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      await this.db.collection(collection).doc(id).set(docData);
      return docData as unknown as T & { id: string };
    } catch (error) {
      console.error(`Error creating document in ${collection}:`, error);
      throw error;
    }
  }

  private async getById<T>(collection: string, id: string): Promise<T | null> {
    try {
      const doc = await this.db.collection(collection).doc(id).get();
      if (!doc.exists) {
        return null;
      }
      return doc.data() as T;
    } catch (error) {
      console.error(`Error getting document from ${collection}:`, error);
      throw error;
    }
  }

  private async update<T>(
    collection: string,
    id: string,
    data: UpdateRequest<T>
  ): Promise<T | null> {
    try {
      const updateData = {
        ...data,
        updatedAt: admin.firestore.Timestamp.now(),
      };

      await this.db.collection(collection).doc(id).update(updateData);
      return this.getById<T>(collection, id);
    } catch (error) {
      console.error(`Error updating document in ${collection}:`, error);
      throw error;
    }
  }

  private async delete(collection: string, id: string): Promise<void> {
    try {
      await this.db.collection(collection).doc(id).delete();
    } catch (error) {
      console.error(`Error deleting document from ${collection}:`, error);
      throw error;
    }
  }

  private async getAll<T>(
    collection: string,
    options: QueryOptions = {}
  ): Promise<PaginatedResponse<T>> {
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        startDate,
        endDate,
      } = options;

      let query = this.db.collection(collection) as admin.firestore.Query;

      // Date filtering
      if (startDate) {
        query = query.where('createdAt', '>=', new Date(startDate));
      }
      if (endDate) {
        query = query.where('createdAt', '<=', new Date(endDate));
      }

      // Sorting
      query = query.orderBy(sortBy, sortOrder);

      // Get total count for pagination
      const totalSnapshot = await query.get();
      const total = totalSnapshot.size;

      // Apply pagination
      const offset = (page - 1) * limit;
      query = query.offset(offset).limit(limit);

      const snapshot = await query.get();
      const data = snapshot.docs.map(doc => doc.data() as T);

      const totalPages = Math.ceil(total / limit);

      return {
        success: true,
        message: 'Data retrieved successfully',
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`Error getting all documents from ${collection}:`, error);
      throw error;
    }
  }

  // Egg Collection operations
  public async createEggCollection(
    data: CreateRequest<EggCollection>
  ): Promise<EggCollection> {
    return this.create<EggCollection>('eggCollections', data);
  }

  public async getEggCollectionById(id: string): Promise<EggCollection | null> {
    return this.getById<EggCollection>('eggCollections', id);
  }

  public async updateEggCollection(
    id: string,
    data: UpdateRequest<EggCollection>
  ): Promise<EggCollection | null> {
    return this.update<EggCollection>('eggCollections', id, data);
  }

  public async deleteEggCollection(id: string): Promise<void> {
    return this.delete('eggCollections', id);
  }

  public async getEggCollections(
    options: CollectionQueryOptions = {}
  ): Promise<PaginatedResponse<EggCollection>> {
    try {
      const { pen, shift, grade, collector, ...baseOptions } = options;
      let query = this.db.collection('eggCollections') as admin.firestore.Query;

      // Apply filters
      if (pen) query = query.where('pen', '==', pen);
      if (shift) query = query.where('shift', '==', shift);
      if (grade) query = query.where('grade', '==', grade);
      if (collector) query = query.where('collector', '==', collector);

      // Apply base options (pagination, sorting, date range)
      const {
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        startDate,
        endDate,
      } = baseOptions;

      if (startDate) {
        query = query.where('date', '>=', startDate);
      }
      if (endDate) {
        query = query.where('date', '<=', endDate);
      }

      // If we're filtering by date, we should order by date to avoid index issues
      // Otherwise use the specified sortBy
      const finalSortBy = (startDate || endDate) && sortBy === 'createdAt' ? 'date' : sortBy;
      query = query.orderBy(finalSortBy, sortOrder);

      const totalSnapshot = await query.get();
      const total = totalSnapshot.size;

      const offset = (page - 1) * limit;
      query = query.offset(offset).limit(limit);

      const snapshot = await query.get();
      const data = snapshot.docs.map(doc => doc.data() as EggCollection);

      const totalPages = Math.ceil(total / limit);

      return {
        success: true,
        message: 'Egg collections retrieved successfully',
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error getting egg collections:', error);
      throw error;
    }
  }

  // User operations
  public async createUser(data: CreateRequest<User>, uid: string): Promise<User> {
    return this.create<User>('users', data, uid);
  }

  public async getUserById(id: string): Promise<User | null> {
    return this.getById<User>('users', id);
  }

  public async getUserByEmail(email: string): Promise<User | null> {
    try {
      // Normalize email: lowercase and trim
      const normalizedEmail = email.toLowerCase().trim();
      
      console.log('[FIRESTORE] getUserByEmail - searching for', { 
        normalizedEmail,
        emailLength: normalizedEmail.length 
      });
      
      // Try exact match first (case-sensitive for backward compatibility)
      let snapshot = await this.db
        .collection('users')
        .where('email', '==', normalizedEmail)
        .limit(1)
        .get();

      console.log('[FIRESTORE] getUserByEmail - exact match result', { 
        found: !snapshot.empty,
        count: snapshot.size 
      });

      // If not found, try case-insensitive search by getting all users and filtering
      if (snapshot.empty) {
        console.log('[FIRESTORE] getUserByEmail - trying case-insensitive search');
        const allUsersSnapshot = await this.db
          .collection('users')
          .get();
        
        console.log('[FIRESTORE] getUserByEmail - total users in collection', { 
          totalUsers: allUsersSnapshot.size 
        });
        
        const matchingUser = allUsersSnapshot.docs.find(doc => {
          const userData = doc.data() as User;
          const userEmailNormalized = userData.email?.toLowerCase().trim();
          const matches = userEmailNormalized === normalizedEmail;
          if (matches) {
            console.log('[FIRESTORE] getUserByEmail - found match in case-insensitive search', {
              userId: userData.id,
              storedEmail: userData.email,
              normalizedStoredEmail: userEmailNormalized
            });
          }
          return matches;
        });

        if (matchingUser) {
          return matchingUser.data() as User;
        }
        
        console.log('[FIRESTORE] getUserByEmail - no user found', { normalizedEmail });
        return null;
      }

      const user = snapshot.docs[0].data() as User;
      console.log('[FIRESTORE] getUserByEmail - user found via exact match', {
        userId: user.id,
        email: user.email
      });
      return user;
    } catch (error) {
      console.error('[FIRESTORE] Error getting user by email:', error);
      throw error;
    }
  }

  public async updateUser(id: string, data: UpdateRequest<User>): Promise<User | null> {
    return this.update<User>('users', id, data);
  }

  public async deleteUser(id: string): Promise<void> {
    return this.delete('users', id);
  }

  public async getUsers(options: QueryOptions & { role?: string; isActive?: boolean; search?: string } = {}): Promise<PaginatedResponse<User>> {
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        role,
        isActive,
        search,
      } = options;

      let query = this.db.collection('users') as admin.firestore.Query;

      // Apply filters
      // Note: We'll filter by role in memory since Firestore 'in' queries have limitations
      // and we need to support both old and new role names

      if (isActive !== undefined) {
        query = query.where('isActive', '==', isActive);
      }

      // Sorting
      query = query.orderBy(sortBy, sortOrder);

      // Get all matching documents for filtering
      const allSnapshot = await query.get();
      let allUsers = allSnapshot.docs.map(doc => doc.data() as User);

      // Apply role filter in memory (to support both old and new role names)
      if (role) {
        const normalizedRole = role.toLowerCase();
        allUsers = allUsers.filter(user => {
          const userRole = (user.role || '').toLowerCase();
          if (normalizedRole === 'admin') {
            return userRole === 'admin' || userRole === 'super_admin';
          } else if (normalizedRole === 'manager') {
            return userRole === 'manager' || userRole === 'farm_manager';
          } else if (normalizedRole === 'worker') {
            return userRole === 'worker' || userRole === 'farm_worker';
          } else {
            return userRole === normalizedRole;
          }
        });
      }

      // Apply search filter in memory (Firestore doesn't support full-text search)
      if (search) {
        const searchLower = search.toLowerCase();
        allUsers = allUsers.filter(user => 
          user.name?.toLowerCase().includes(searchLower) ||
          user.email?.toLowerCase().includes(searchLower) ||
          user.phone?.toLowerCase().includes(searchLower)
        );
      }

      const total = allUsers.length;

      // Apply pagination
      const offset = (page - 1) * limit;
      const paginatedUsers = allUsers.slice(offset, offset + limit);

      const totalPages = Math.ceil(total / limit);

      return {
        success: true,
        message: 'Users retrieved successfully',
        data: paginatedUsers,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error getting users:', error);
      throw error;
    }
  }

  // Bird operations
  public async createBird(data: CreateRequest<Bird>): Promise<Bird> {
    return this.create<Bird>('birds', data);
  }

  public async getBirdById(id: string): Promise<Bird | null> {
    return this.getById<Bird>('birds', id);
  }

  public async updateBird(id: string, data: UpdateRequest<Bird>): Promise<Bird | null> {
    return this.update<Bird>('birds', id, data);
  }

  public async deleteBird(id: string): Promise<void> {
    return this.delete('birds', id);
  }

  public async getBirds(options: BirdQueryOptions = {}): Promise<PaginatedResponse<Bird>> {
    try {
      const { penId, breed, healthStatus, ...baseOptions } = options;
      let query = this.db.collection('birds') as admin.firestore.Query;

      if (penId) query = query.where('penId', '==', penId);
      if (breed) query = query.where('breed', '==', breed);
      if (healthStatus) query = query.where('healthStatus', '==', healthStatus);

      const {
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = baseOptions;

      query = query.orderBy(sortBy, sortOrder);

      const totalSnapshot = await query.get();
      const total = totalSnapshot.size;

      const offset = (page - 1) * limit;
      query = query.offset(offset).limit(limit);

      const snapshot = await query.get();
      const data = snapshot.docs.map(doc => doc.data() as Bird);

      const totalPages = Math.ceil(total / limit);

      return {
        success: true,
        message: 'Birds retrieved successfully',
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error getting birds:', error);
      throw error;
    }
  }

  // Feed Inventory operations
  public async createFeedInventory(data: CreateRequest<FeedInventory>): Promise<FeedInventory> {
    return this.create<FeedInventory>('feedInventory', data);
  }

  public async getFeedInventoryById(id: string): Promise<FeedInventory | null> {
    return this.getById<FeedInventory>('feedInventory', id);
  }

  public async updateFeedInventory(
    id: string,
    data: UpdateRequest<FeedInventory>
  ): Promise<FeedInventory | null> {
    return this.update<FeedInventory>('feedInventory', id, data);
  }

  public async deleteFeedInventory(id: string): Promise<void> {
    return this.delete('feedInventory', id);
  }

  public async getFeedInventory(
    options: QueryOptions = {}
  ): Promise<PaginatedResponse<FeedInventory>> {
    return this.getAll<FeedInventory>('feedInventory', options);
  }

  // Medicine Record operations
  public async createMedicineRecord(
    data: CreateRequest<MedicineRecord>
  ): Promise<MedicineRecord> {
    return this.create<MedicineRecord>('medicineRecords', data);
  }

  public async getMedicineRecordById(id: string): Promise<MedicineRecord | null> {
    return this.getById<MedicineRecord>('medicineRecords', id);
  }

  public async updateMedicineRecord(
    id: string,
    data: UpdateRequest<MedicineRecord>
  ): Promise<MedicineRecord | null> {
    return this.update<MedicineRecord>('medicineRecords', id, data);
  }

  public async deleteMedicineRecord(id: string): Promise<void> {
    return this.delete('medicineRecords', id);
  }

  public async getMedicineRecords(
    options: QueryOptions = {}
  ): Promise<PaginatedResponse<MedicineRecord>> {
    return this.getAll<MedicineRecord>('medicineRecords', options);
  }

  // Vaccination Schedule operations
  public async createVaccinationSchedule(
    data: CreateRequest<VaccinationSchedule>
  ): Promise<VaccinationSchedule> {
    return this.create<VaccinationSchedule>('vaccinationSchedules', data);
  }

  public async getVaccinationScheduleById(id: string): Promise<VaccinationSchedule | null> {
    return this.getById<VaccinationSchedule>('vaccinationSchedules', id);
  }

  public async updateVaccinationSchedule(
    id: string,
    data: UpdateRequest<VaccinationSchedule>
  ): Promise<VaccinationSchedule | null> {
    return this.update<VaccinationSchedule>('vaccinationSchedules', id, data);
  }

  public async deleteVaccinationSchedule(id: string): Promise<void> {
    return this.delete('vaccinationSchedules', id);
  }

  public async getVaccinationSchedules(
    options: QueryOptions = {}
  ): Promise<PaginatedResponse<VaccinationSchedule>> {
    return this.getAll<VaccinationSchedule>('vaccinationSchedules', options);
  }

  // Batch operations
  public async batchWrite(operations: Array<{
    operation: 'create' | 'update' | 'delete';
    collection: string;
    id: string;
    data?: any;
  }>): Promise<void> {
    try {
      const batch = this.db.batch();

      operations.forEach(({ operation, collection, id, data }) => {
        const docRef = this.db.collection(collection).doc(id);

        switch (operation) {
          case 'create':
            batch.set(docRef, {
              ...data,
              id,
              createdAt: admin.firestore.Timestamp.now(),
              updatedAt: admin.firestore.Timestamp.now(),
            });
            break;
          case 'update':
            batch.update(docRef, {
              ...data,
              updatedAt: admin.firestore.Timestamp.now(),
            });
            break;
          case 'delete':
            batch.delete(docRef);
            break;
        }
      });

      await batch.commit();
    } catch (error) {
      console.error('Error in batch write:', error);
      throw error;
    }
  }

  // Utility methods
  public getDb(): admin.firestore.Firestore {
    return this.db;
  }

  public async runTransaction<T>(
    updateFunction: (transaction: admin.firestore.Transaction) => Promise<T>
  ): Promise<T> {
    return this.db.runTransaction(updateFunction);
  }

  // Stats and reporting methods
  public async generateStatsReport(
    farmId: string,
    startDate: Date,
    endDate: Date
  ): Promise<any> {
    try {
      // Get collections data for the date range
      const collectionsQuery = this.db
        .collection('eggCollections')
        .where('farmId', '==', farmId)
        .where('date', '>=', startDate.toISOString().split('T')[0])
        .where('date', '<=', endDate.toISOString().split('T')[0]);
      
      const collectionsSnapshot = await collectionsQuery.get();
      const collections = collectionsSnapshot.docs.map(doc => doc.data());
      
      // Calculate basic stats
      const totalEggs = collections.reduce((sum, collection) => sum + (collection.quantity || 0), 0);
      const avgDailyProduction = collections.length > 0 ? totalEggs / collections.length : 0;
      
      return {
        totalEggs,
        avgDailyProduction,
        totalCollections: collections.length,
        dateRange: {
          start: startDate.toISOString().split('T')[0],
          end: endDate.toISOString().split('T')[0]
        }
      };
    } catch (error) {
      console.error('Error generating stats report:', error);
      throw error;
    }
  }

  public async getDailyCollectionSummary(farmId: string, date: Date): Promise<any> {
    try {
      const dateStr = date.toISOString().split('T')[0];
      const collectionsQuery = this.db
        .collection('eggCollections')
        .where('farmId', '==', farmId)
        .where('date', '==', dateStr);
      
      const snapshot = await collectionsQuery.get();
      const collections = snapshot.docs.map(doc => doc.data());
      
      const totalEggs = collections.reduce((sum, collection) => sum + (collection.quantity || 0), 0);
      
      return {
        date: dateStr,
        totalEggs,
        totalCollections: collections.length,
        collections
      };
    } catch (error) {
      console.error('Error getting daily collection summary:', error);
      throw error;
    }
  }

  public async getBirdStatistics(farmId: string): Promise<any> {
    try {
      // If farmId is empty or undefined, return default stats
      if (!farmId || farmId.trim() === '') {
        console.warn('getBirdStatistics called with empty farmId');
        return {
          totalBirds: 0,
          healthyBirds: 0,
          sickQuarantineBirds: 0,
          avgEggProduction: 0
        };
      }

      // Get all birds for the farm
      let birdsQuery = this.db.collection('birds') as admin.firestore.Query;
      
      // Only filter by farmId if it's provided and not empty
      if (farmId && farmId.trim() !== '') {
        birdsQuery = birdsQuery.where('farmId', '==', farmId);
      }
      
      const birdsSnapshot = await birdsQuery.get();
      const allBirds = birdsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];
      
      // Filter by farmId in memory (in case some birds don't have farmId set)
      const birds = allBirds.filter((bird: any) => {
        // If farmId is provided, only include birds with matching farmId
        // If farmId is empty, include all birds (for debugging)
        if (farmId && farmId.trim() !== '') {
          return bird.farmId === farmId;
        }
        return true; // Include all birds if no farmId filter
      });
      
      console.log(`getBirdStatistics: Found ${allBirds.length} total birds, ${birds.length} matching farmId: ${farmId}`);
      if (birds.length > 0) {
        console.log('Sample bird data:', JSON.stringify(birds[0], null, 2));
      }
      
      // Calculate total birds (sum of quantity, or count as 1 if quantity is missing)
      const totalBirds = birds.reduce((sum: number, bird: any) => {
        // If quantity field exists, use it; otherwise count the bird as 1
        const qty = bird.quantity || bird.count || 1;
        return sum + qty;
      }, 0);
      
      // Calculate healthy birds (sum quantity where healthStatus is 'healthy')
      const healthyBirds = birds
        .filter((bird: any) => bird.healthStatus === 'healthy')
        .reduce((sum: number, bird: any) => {
          const qty = bird.quantity || bird.count || 1;
          return sum + qty;
        }, 0);
      
      // Calculate sick/quarantine birds (sum quantity where healthStatus is 'sick' or 'quarantine')
      const sickQuarantineBirds = birds
        .filter((bird: any) => bird.healthStatus === 'sick' || bird.healthStatus === 'quarantine')
        .reduce((sum: number, bird: any) => {
          const qty = bird.quantity || bird.count || 1;
          return sum + qty;
        }, 0);
      
      // Calculate average egg production per bird per year
      // Get egg collections from the last year
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const oneYearAgoStr = oneYearAgo.toISOString().split('T')[0]; // Format as YYYY-MM-DD
      
      // Query only by farmId to avoid composite index requirement
      // Then filter by date in memory
      const collectionsQuery = this.db
        .collection('eggCollections')
        .where('farmId', '==', farmId);
      
      const collectionsSnapshot = await collectionsQuery.get();
      const allCollections = collectionsSnapshot.docs.map(doc => doc.data());
      
      // Filter collections from the last year in memory
      const collections = allCollections.filter(collection => {
        const collectionDate = collection.date;
        return collectionDate && collectionDate >= oneYearAgoStr;
      });
      
      // Sum total eggs collected in the last year
      const totalEggsCollected = collections.reduce((sum, collection) => sum + (collection.quantity || 0), 0);
      
      // Calculate average eggs per bird per year
      // If no birds, return 0; otherwise divide total eggs by total birds
      const avgEggProduction = totalBirds > 0 ? totalEggsCollected / totalBirds : 0;
      
      return {
        totalBirds,
        healthyBirds,
        sickQuarantineBirds,
        avgEggProduction: Math.round(avgEggProduction * 100) / 100 // Round to 2 decimal places
      };
    } catch (error) {
      console.error('Error getting bird statistics:', error);
      throw error;
    }
  }

  public async getFeedConsumptionHistory(
    filters: any,
    page: number = 1,
    limit: number = 10
  ): Promise<PaginatedResponse<any>> {
    try {
      // This is a placeholder implementation
      // In a real application, you would have a feedConsumption collection
      return {
        success: true,
        message: 'Feed consumption history retrieved successfully',
        data: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting feed consumption history:', error);
      throw error;
    }
  }

  public async getLowStockAlerts(farmId: string): Promise<any[]> {
    try {
      const feedQuery = this.db
        .collection('feedInventory')
        .where('farmId', '==', farmId);
      
      const snapshot = await feedQuery.get();
      const feedItems = snapshot.docs.map(doc => doc.data());
      
      // Filter items that are below minimum stock
      const lowStockItems = feedItems.filter(item => 
        item.minimumStock && item.quantity <= item.minimumStock
      );
      
      return lowStockItems;
    } catch (error) {
      console.error('Error getting low stock alerts:', error);
      throw error;
    }
  }

  public async bulkUpdateBirds(updates: any[]): Promise<void> {
    try {
      const batch = this.db.batch();
      
      updates.forEach(update => {
        const docRef = this.db.collection('birds').doc(update.id);
        batch.update(docRef, update.data);
      });
      
      await batch.commit();
    } catch (error) {
      console.error('Error bulk updating birds:', error);
      throw error;
    }
  }

  public async getComparativeAnalysis(
    farmId: string,
    comparisonFarmId: string,
    startDate: Date,
    endDate: Date
  ): Promise<any> {
    try {
      // Get data for both farms
      const [farmData, comparisonData] = await Promise.all([
        this.generateStatsReport(farmId, startDate, endDate),
        this.generateStatsReport(comparisonFarmId, startDate, endDate)
      ]);
      
      return {
        primaryFarm: {
          farmId,
          data: farmData
        },
        comparisonFarm: {
          farmId: comparisonFarmId,
          data: comparisonData
        },
        comparison: {
          eggProductionDifference: farmData.totalEggs - comparisonData.totalEggs,
          avgProductionDifference: farmData.avgDailyProduction - comparisonData.avgDailyProduction,
          performanceRatio: comparisonData.totalEggs > 0 ? farmData.totalEggs / comparisonData.totalEggs : 0
        }
      };
    } catch (error) {
      console.error('Error getting comparative analysis:', error);
      throw error;
    }
  }

  public async recordMedicineUsage(usageData: any): Promise<void> {
    try {
      const usageRecord = {
        ...usageData,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };
      
      await this.db.collection('medicineUsage').add(usageRecord);
    } catch (error) {
      console.error('Error recording medicine usage:', error);
      throw error;
    }
  }

  public async getPerformanceMetrics(farmId: string, dateRange: any): Promise<any> {
    try {
      // Get basic stats for the date range
      const stats = await this.generateStatsReport(farmId, dateRange.startDate, dateRange.endDate);
      const birdStats = await this.getBirdStatistics(farmId);
      
      // Calculate performance metrics
      const daysInRange = Math.ceil((dateRange.endDate.getTime() - dateRange.startDate.getTime()) / (1000 * 60 * 60 * 24));
      const expectedProduction = birdStats.totalBirds * 0.8 * daysInRange; // Assuming 80% production rate
      
      return {
        productionEfficiency: expectedProduction > 0 ? (stats.totalEggs / expectedProduction) * 100 : 0,
        avgDailyProduction: stats.avgDailyProduction,
        totalProduction: stats.totalEggs,
        birdUtilization: birdStats.healthPercentage,
        performanceScore: {
          production: expectedProduction > 0 ? Math.min((stats.totalEggs / expectedProduction) * 100, 100) : 0,
          health: birdStats.healthPercentage,
          overall: 0 // Will be calculated based on weighted average
        },
        trends: {
          dailyAverage: stats.avgDailyProduction,
          weeklyTrend: 'stable', // Placeholder
          monthlyTrend: 'stable' // Placeholder
        }
      };
    } catch (error) {
      console.error('Error getting performance metrics:', error);
      throw error;
    }
  }

  public async getFinancialSummary(farmId: string, dateRange: any): Promise<any> {
    try {
      // Get basic stats for financial calculations
      const stats = await this.generateStatsReport(farmId, dateRange.startDate, dateRange.endDate);
      const feedInventory = await this.getFeedInventory();
      const medicineRecords = await this.getMedicineRecords();
      
      // Calculate financial metrics
      const eggRevenue = stats.totalEggs * 0.5; // Assuming $0.5 per egg
      const feedCosts = feedInventory.data ? feedInventory.data.reduce((total: number, item: any) => total + (item.quantity * item.unitPrice), 0) : 0;
      const medicineCosts = medicineRecords.data ? medicineRecords.data.reduce((total: number, item: any) => total + (item.quantity * item.unitPrice), 0) : 0;
      const totalCosts = feedCosts + medicineCosts;
      const profit = eggRevenue - totalCosts;
      
      return {
        revenue: {
          eggs: eggRevenue,
          total: eggRevenue
        },
        costs: {
          feed: feedCosts,
          medicine: medicineCosts,
          total: totalCosts
        },
        profit: profit,
        profitMargin: eggRevenue > 0 ? (profit / eggRevenue) * 100 : 0,
        roi: totalCosts > 0 ? (profit / totalCosts) * 100 : 0
      };
    } catch (error) {
      console.error('Error getting financial summary:', error);
      throw error;
    }
  }

  public async getMedicineUsageTrends(farmId: string, dateRange: any): Promise<any> {
    try {
      // Get medicine usage data for the date range
      const medicineRecords = await this.getMedicineRecords();
      
      // Calculate trends (simplified implementation)
      return {
        totalUsage: medicineRecords.data ? medicineRecords.data.length : 0,
        avgDailyUsage: 0, // Placeholder
        trendDirection: 'stable', // Placeholder
        mostUsedMedicine: 'N/A' // Placeholder
      };
    } catch (error) {
      console.error('Error getting medicine usage trends:', error);
      throw error;
    }
  }

  public async getEggProductionTrends(farmId: string, dateRange: any): Promise<any> {
    try {
      // Get egg production data for the date range using getEggCollections
      const startDateStr = dateRange.startDate instanceof Date 
        ? dateRange.startDate.toISOString().split('T')[0]
        : new Date(dateRange.startDate).toISOString().split('T')[0];
      const endDateStr = dateRange.endDate instanceof Date
        ? dateRange.endDate.toISOString().split('T')[0]
        : new Date(dateRange.endDate).toISOString().split('T')[0];

      const collectionsResponse = await this.getEggCollections({
        startDate: startDateStr,
        endDate: endDateStr,
        sortBy: 'date',
        limit: 10000
      });

      // Filter by farmId in memory
      const collections = (collectionsResponse.data || []).filter((c: any) => c.farmId === farmId);
      
      // Group by date for chart data
      const dailyData: Record<string, number> = {};
      collections.forEach((collection: any) => {
        const date = collection.date || collection.createdAt?.toDate?.()?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0];
        dailyData[date] = (dailyData[date] || 0) + (collection.quantity || 0);
      });

      // Convert to array format for charts
      const chartData = Object.entries(dailyData)
        .map(([date, quantity]) => ({ date, quantity }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Calculate trends
      const totalProduction = collections.reduce((sum: number, c: any) => sum + (c.quantity || 0), 0);
      const daysInRange = Math.ceil((new Date(endDateStr).getTime() - new Date(startDateStr).getTime()) / (1000 * 60 * 60 * 24)) || 1;
      const avgDailyProduction = totalProduction / daysInRange;

      // Calculate trend direction (compare first half vs second half)
      const midpoint = Math.floor(chartData.length / 2);
      const firstHalf = chartData.slice(0, midpoint).reduce((sum, d) => sum + d.quantity, 0) / (midpoint || 1);
      const secondHalf = chartData.slice(midpoint).reduce((sum, d) => sum + d.quantity, 0) / (chartData.length - midpoint || 1);
      const trendDirection = secondHalf > firstHalf ? 'increasing' : secondHalf < firstHalf ? 'decreasing' : 'stable';

      // Find peak production day
      const peakDay = chartData.reduce((max, d) => d.quantity > max.quantity ? d : max, chartData[0] || { date: 'N/A', quantity: 0 });

      return {
        totalProduction,
        avgDailyProduction: parseFloat(avgDailyProduction.toFixed(2)),
        trendDirection,
        peakProductionDay: peakDay.date,
        chartData,
        dateRange: {
          start: startDateStr,
          end: endDateStr
        }
      };
    } catch (error) {
      console.error('Error getting egg production trends:', error);
      throw error;
    }
  }

  public async getEggCollectionStats(farmId: string, dateRange: any, groupBy: string): Promise<any> {
    try {
      // Get egg collection data for the date range
      const collections = await this.getEggCollections();
      const stats = await this.generateStatsReport(farmId, dateRange.startDate, dateRange.endDate);
      
      // Calculate collection stats (simplified implementation)
      return {
        totalCollections: collections.data ? collections.data.length : 0,
        totalEggs: stats.totalEggs,
        avgEggsPerCollection: collections.data && collections.data.length > 0 ? stats.totalEggs / collections.data.length : 0,
        groupedData: [] // Placeholder for grouped data
      };
    } catch (error) {
      console.error('Error getting egg collection stats:', error);
      throw error;
    }
  }

  public async getFeedConsumptionTrends(farmId: string, dateRange: any): Promise<any> {
    try {
      // Get feed consumption data for the date range
      const feedHistory = await this.getFeedConsumptionHistory({}, 1, 100);
      
      // Calculate trends (simplified implementation)
      return {
        totalConsumption: feedHistory.data ? feedHistory.data.length : 0,
        avgDailyConsumption: 0, // Placeholder
        trendDirection: 'stable', // Placeholder
        mostConsumedFeed: 'N/A' // Placeholder
      };
    } catch (error) {
      console.error('Error getting feed consumption trends:', error);
      throw error;
    }
  }

  public async getMedicineInventoryStats(farmId: string): Promise<any> {
    try {
      // Get medicine inventory data
      const medicineInventory = await this.getMedicineRecords();
      
      // Calculate inventory stats (simplified implementation)
      const totalItems = medicineInventory.data ? medicineInventory.data.length : 0;
      const totalValue = medicineInventory.data ? medicineInventory.data.reduce((total: number, item: any) => total + (item.quantity * item.unitPrice || 0), 0) : 0;
      
      return {
        totalItems,
        totalValue,
        expiringSoon: 0, // Placeholder
        avgItemValue: totalItems > 0 ? totalValue / totalItems : 0
      };
    } catch (error) {
      console.error('Error getting medicine inventory stats:', error);
      throw error;
    }
  }

  public async getMedicineUsageHistory(queryOptions: any, page: number, limit: number): Promise<any> {
    try {
      const {
        farmId,
        medicineId,
        birdId,
        startDate,
        endDate,
        ...otherOptions
      } = queryOptions || {};

      let query = this.db.collection('medicineUsage') as admin.firestore.Query;

      // Only filter by farmId if provided (avoid composite index requirement)
      // We'll filter by other fields and sort in memory
      if (farmId && typeof farmId === 'string' && farmId.trim() !== '') {
        query = query.where('farmId', '==', farmId);
      }

      // Get all matching documents (we'll filter and sort in memory)
      let snapshot;
      try {
        snapshot = await query.get();
      } catch (error: any) {
        // If collection doesn't exist or query fails, return empty results
        console.error('Error querying medicineUsage collection:', error);
        console.error('Error details:', {
          message: error?.message,
          code: error?.code,
          stack: error?.stack
        });
        return {
          success: true,
          message: 'Medicine usage history retrieved successfully',
          data: [],
          pagination: {
            page: page || 1,
            limit: limit || 50,
            total: 0,
            totalPages: 0,
            hasNext: false,
            hasPrev: false
          },
          timestamp: new Date().toISOString()
        };
      }

      let allUsage = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Filter by medicineId in memory if provided
      if (medicineId) {
        allUsage = allUsage.filter((item: any) => item.medicineId === medicineId);
      }

      // Filter by birdId in memory if provided
      if (birdId) {
        allUsage = allUsage.filter((item: any) => {
          const birdIds = item.birdIds || item.birdGroup || [];
          return Array.isArray(birdIds) ? birdIds.includes(birdId) : false;
        });
      }

      // Filter by date range in memory if provided
      if (startDate || endDate) {
        allUsage = allUsage.filter((item: any) => {
          let administeredAt: Date | null = null;
          
          // Handle Firestore Timestamp
          if (item.administeredAt?.toDate) {
            administeredAt = item.administeredAt.toDate();
          } else if (item.administeredAt?.toMillis) {
            administeredAt = new Date(item.administeredAt.toMillis());
          } else if (item.administeredAt?.seconds) {
            administeredAt = new Date(item.administeredAt.seconds * 1000);
          } else if (item.administeredAt) {
            administeredAt = new Date(item.administeredAt);
          }
          
          if (!administeredAt || isNaN(administeredAt.getTime())) return false;
          
          if (startDate && administeredAt < startDate) return false;
          if (endDate && administeredAt > endDate) return false;
          
          return true;
        });
      }

      // Sort by administeredAt in memory (descending)
      allUsage.sort((a: any, b: any) => {
        const aTime = a.administeredAt?.toMillis?.() || a.administeredAt?.seconds || 0;
        const bTime = b.administeredAt?.toMillis?.() || b.administeredAt?.seconds || 0;
        return bTime - aTime;
      });

      // Get total count after filtering
      const total = allUsage.length;

      // Apply pagination
      const offset = (page - 1) * limit;
      const data = allUsage.slice(offset, offset + limit);

      return {
        success: true,
        message: 'Medicine usage history retrieved successfully',
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: offset + limit < total,
          hasPrev: page > 1
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting medicine usage history:', error);
      throw error;
    }
  }

  public async getMedicineExpiringIn(days: number): Promise<any> {
    try {
      // Get all medicine records
      const medicineRecords = await this.getMedicineRecords();
      
      // Filter for medicines expiring within the specified days (simplified implementation)
      const currentDate = new Date();
      const targetDate = new Date(currentDate.getTime() + (days * 24 * 60 * 60 * 1000));
      
      // For now, return empty array as placeholder since we don't have expiry date field in medicine records
      return {
        data: [],
        total: 0,
        pagination: {
          page: 1,
          limit: 10,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false
        }
      };
    } catch (error) {
      console.error('Error getting expiring medicines:', error);
      throw error;
    }
  }

  public async updateMedicine(medicineId: string, updateData: any): Promise<void> {
    try {
      const medicineRef = this.db.collection('medicineInventory').doc(medicineId);
      await medicineRef.update({
        ...updateData,
        updatedAt: Timestamp.now()
      });
    } catch (error) {
      console.error('Error updating medicine:', error);
      throw error;
    }
  }

  public async getExpiredMedicine(farmId: string): Promise<any> {
    try {
      // Get all medicine records for the farm
      const medicineRecords = await this.getMedicineRecords();
      
      // For now, return empty array as placeholder since we don't have expiry date field
      return {
        data: [],
        total: 0,
        pagination: {
          page: 1,
          limit: 10,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false
        }
      };
    } catch (error) {
      console.error('Error getting expired medicine:', error);
      throw error;
    }
  }

  public async getMedicineById(medicineId: string): Promise<any> {
    try {
      const medicineRef = this.db.collection('medicineInventory').doc(medicineId);
      const doc = await medicineRef.get();
      
      if (!doc.exists) {
        throw new Error('Medicine not found');
      }
      
      return {
        id: doc.id,
        ...doc.data()
      };
    } catch (error) {
      console.error('Error getting medicine by ID:', error);
      throw error;
    }
  }

  public async deleteMedicine(medicineId: string): Promise<void> {
    try {
      const medicineRef = this.db.collection('medicineInventory').doc(medicineId);
      await medicineRef.delete();
    } catch (error) {
      console.error('Error deleting medicine:', error);
      throw error;
    }
  }

  public async addMedicine(medicineData: any): Promise<string> {
    try {
      const medicineRef = await this.db.collection('medicineInventory').add({
        ...medicineData,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });
      return medicineRef.id;
    } catch (error) {
      console.error('Error adding medicine:', error);
      throw error;
    }
  }

  public async getMedicineInventory(queryOptions?: any, page?: number, limit?: number): Promise<any> {
    try {
      const {
        page: queryPage = page || 1,
        limit: queryLimit = limit || 50,
        farmId,
        type,
        ...otherOptions
      } = queryOptions || {};

      let query = this.db.collection('medicineInventory') as admin.firestore.Query;

      // Only filter by farmId if provided (avoid composite index requirement)
      // We'll filter by type and sort in memory
      if (farmId && farmId.trim() !== '') {
        query = query.where('farmId', '==', farmId);
      }

      // Get all matching documents (we'll filter and sort in memory)
      const snapshot = await query.get();
      let allMedicines = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Filter by type in memory if provided
      if (type) {
        allMedicines = allMedicines.filter((item: any) => item.type === type);
      }

      // Sort by createdAt in memory (descending)
      allMedicines.sort((a: any, b: any) => {
        const aTime = a.createdAt?.toMillis?.() || a.createdAt?.seconds || 0;
        const bTime = b.createdAt?.toMillis?.() || b.createdAt?.seconds || 0;
        return bTime - aTime;
      });

      // Get total count after filtering
      const total = allMedicines.length;

      // Apply pagination
      const offset = (queryPage - 1) * queryLimit;
      const data = allMedicines.slice(offset, offset + queryLimit);

      return {
        success: true,
        message: 'Medicine inventory retrieved successfully',
        data,
        pagination: {
          page: queryPage,
          limit: queryLimit,
          total,
          totalPages: Math.ceil(total / queryLimit),
          hasNext: offset + queryLimit < total,
          hasPrev: queryPage > 1
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting medicine inventory:', error);
      throw error;
    }
  }

  public async getFeedById(feedId: string): Promise<any> {
    try {
      const feedRef = this.db.collection('feedInventory').doc(feedId);
      const doc = await feedRef.get();
      
      if (!doc.exists) {
        throw new Error('Feed item not found');
      }
      
      return {
        id: doc.id,
        ...doc.data()
      };
    } catch (error) {
      console.error('Error getting feed by ID:', error);
      throw error;
    }
  }

  public async recordFeedConsumption(consumptionData: any): Promise<void> {
    try {
      await this.db.collection('feedConsumption').add({
        ...consumptionData,
        createdAt: admin.firestore.Timestamp.now()
      });
    } catch (error) {
      console.error('Error recording feed consumption:', error);
      throw error;
    }
  }

  public async updateFeed(feedId: string, updateData: any): Promise<void> {
    try {
      const feedRef = this.db.collection('feedInventory').doc(feedId);
      await feedRef.update({
        ...updateData,
        updatedAt: admin.firestore.Timestamp.now()
      });
    } catch (error) {
      console.error('Error updating feed:', error);
      throw error;
    }
  }

  public async deleteFeed(feedId: string): Promise<void> {
    try {
      const feedRef = this.db.collection('feedInventory').doc(feedId);
      await feedRef.delete();
    } catch (error) {
      console.error('Error deleting feed:', error);
      throw error;
    }
  }

  public async getLowStockFeed(farmId: string): Promise<any> {
    try {
      // Get all feed inventory for the farm
      const feedInventory = await this.getFeedInventory();
      
      // Filter for low stock items (simplified implementation)
      const lowStockItems = feedInventory.data ? feedInventory.data.filter((item: any) => 
        item.quantity <= (item.minimumStock || 10)
      ) : [];
      
      return {
        data: lowStockItems,
        total: lowStockItems.length,
        pagination: {
          page: 1,
          limit: 10,
          total: lowStockItems.length,
          totalPages: Math.ceil(lowStockItems.length / 10),
          hasNext: false,
          hasPrev: false
        }
      };
    } catch (error) {
      console.error('Error getting low stock feed:', error);
      throw error;
    }
  }

  async addFeed(feedData: Omit<FeedInventory, 'id'>): Promise<string> {
    try {
      const docRef = await this.db.collection('feedInventory').add({
        ...feedData,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });
      return docRef.id;
    } catch (error) {
      console.error('Error adding feed:', error);
      throw error;
    }
  }

  public async getFeedUsageHistory(filters: {
    feedId?: string;
    dateFrom?: Date;
    dateTo?: Date;
    farmId?: string;
  } = {}): Promise<any[]> {
    try {
      let query = this.db.collection('feedConsumption') as admin.firestore.Query;

      if (filters.feedId) {
        query = query.where('feedId', '==', filters.feedId);
      }

      if (filters.farmId) {
        query = query.where('farmId', '==', filters.farmId);
      }

      if (filters.dateFrom) {
        query = query.where('consumedAt', '>=', admin.firestore.Timestamp.fromDate(filters.dateFrom));
      }

      if (filters.dateTo) {
        query = query.where('consumedAt', '<=', admin.firestore.Timestamp.fromDate(filters.dateTo));
      }

      query = query.orderBy('consumedAt', 'desc');

      const snapshot = await query.get();
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error getting feed usage history:', error);
      throw error;
    }
  }

  public async createFeedReorder(feedId: string, reorderData: {
    quantity: number;
    priority?: 'low' | 'medium' | 'high';
    notes?: string;
    farmId: string;
  }): Promise<string> {
    try {
      const docRef = await this.db.collection('feedReorderRequests').add({
        feedId,
        ...reorderData,
        status: 'pending',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });
      return docRef.id;
    } catch (error) {
      console.error('Error creating feed reorder:', error);
      throw error;
    }
  }

  public async getFeedInventoryStats(farmId: string): Promise<any> {
    try {
      let query = this.db.collection('feedInventory') as admin.firestore.Query;
      
      // Only filter by farmId if it's provided and not empty
      if (farmId && farmId.trim() !== '') {
        query = query.where('farmId', '==', farmId);
      }

      const snapshot = await query.get();
      const allFeed = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Calculate status for each item
      const feedWithStatus = allFeed.map((item: any) => {
        const stock = item.stock || item.quantity || 0;
        const maxCapacity = item.maxCapacity || (item.minimumStock ? item.minimumStock * 3 : 1000);
        const threshold = maxCapacity * 0.3;

        let status: 'In Stock' | 'Low Stock' | 'Out of Stock';
        if (stock <= 0) {
          status = 'Out of Stock';
        } else if (stock < threshold) {
          status = 'Low Stock';
        } else {
          status = 'In Stock';
        }

        return { ...item, status, stock };
      });

      const totalItems = feedWithStatus.length;
      const lowStockItems = feedWithStatus.filter((item: any) => item.status === 'Low Stock').length;
      const outOfStockItems = feedWithStatus.filter((item: any) => item.status === 'Out of Stock').length;
      
      const totalValue = feedWithStatus.reduce((sum: number, item: any) => {
        const stock = item.stock || item.quantity || 0;
        const costPerUnit = item.costPerUnit || item.cost || 0;
        return sum + (stock * costPerUnit);
      }, 0);

      const totalStock = feedWithStatus.reduce((sum: number, item: any) => {
        return sum + (item.stock || item.quantity || 0);
      }, 0);

      // Calculate daily consumption from usage history (last 30 days)
      // Only if farmId is provided
      let dailyConsumption = 0;
      if (farmId && farmId.trim() !== '') {
        try {
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          const usageHistory = await this.getFeedUsageHistory({
            farmId,
            dateFrom: thirtyDaysAgo
          });
          
          const totalConsumption = usageHistory.reduce((sum: number, record: any) => {
            return sum + (record.quantityUsed || record.quantity || 0);
          }, 0);
          dailyConsumption = totalConsumption / 30;
        } catch (usageError) {
          // If usage history fails, just set to 0
          console.warn('Error calculating daily consumption:', usageError);
          dailyConsumption = 0;
        }
      }

      return {
        totalItems,
        lowStockItems,
        outOfStockItems,
        totalValue,
        totalStock,
        dailyConsumption: Math.round(dailyConsumption * 100) / 100
      };
    } catch (error) {
      console.error('Error getting feed inventory stats:', error);
      throw error;
    }
  }
}

export default FirestoreService.getInstance();