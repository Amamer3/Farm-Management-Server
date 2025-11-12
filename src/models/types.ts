import { Timestamp } from 'firebase-admin/firestore';
import { Request } from 'express';

// User roles enum
export enum UserRole {
  ADMIN = 'admin',
  MANAGER = 'manager',
  WORKER = 'worker'
}

// Shift types enum
export enum Shift {
  MORNING = 'Morning',
  AFTERNOON = 'Afternoon',
  EVENING = 'Evening'
}

// Egg grades enum
export enum EggGrade {
  AA = 'AA',
  A = 'A',
  B = 'B',
  C = 'C'
}

// Health status enum
export enum HealthStatus {
  HEALTHY = 'healthy',
  SICK = 'sick',
  QUARANTINE = 'quarantine'
}

// Core data interfaces
export interface EggCollection {
  id: string;
  date: string; // ISO date format: YYYY-MM-DD
  shift: Shift; // Morning, Afternoon, Evening
  pen: string;
  quantity: number; // Number of eggs collected
  grade: EggGrade; // AA, A, B, C
  avgWeight?: string; // Average weight per egg (e.g., "58g")
  collector: string; // Name of person who collected eggs
  notes?: string;
  farmId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  // Legacy fields for backward compatibility
  collected?: number; // Legacy field for quantity
  quality?: EggGrade; // Legacy field for grade
  weight?: string; // Legacy field for avgWeight
  collectedBy?: string; // Legacy field for collector
  broken?: number; // Number of broken eggs
}

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  dateOfBirth?: string; // Date of birth (ISO format or dd/mm/yyyy)
  address?: string; // User address
  bio?: string; // User bio/description
  avatar?: string; // Avatar/profile picture URL or path
  role: UserRole;
  farmId: string;
  passwordHash?: string; // For Better Auth - hashed password
  emailVerified?: boolean; // Email verification status
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  isActive?: boolean;
  lastLogin?: Timestamp;
}

export interface Bird {
  id: string;
  penId: string;
  breed: string;
  age: number;
  healthStatus?: HealthStatus;
  lastCheckup: string;
  quantity: number;
  farmId: string;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface FeedInventory {
  id: string;
  name: string;
  type: string; // layer, starter, grower, finisher, supplement
  category?: string;
  stock: number; // current stock quantity
  maxCapacity?: number; // maximum storage capacity
  unit: string; // kg, lbs, tons, etc.
  status?: 'In Stock' | 'Low Stock' | 'Out of Stock'; // calculated based on stock levels
  expiryDate?: string; // ISO date
  supplier: string;
  cost?: number; // total cost
  costPerUnit?: number; // cost per unit
  location?: string; // storage location
  batchNumber?: string;
  notes?: string;
  farmId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  // Legacy fields for backward compatibility
  feedType?: string;
  quantity?: number;
  minimumStock?: number;
}

export interface MedicineRecord {
  id: string;
  medicineName: string;
  type: 'vaccination' | 'treatment' | 'supplement';
  penId?: string;
  birdId?: string;
  dosage: string;
  administeredBy: string;
  administeredDate: string;
  nextDueDate?: string;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface VaccinationSchedule {
  id: string;
  vaccineName: string;
  penId: string;
  scheduledDate: string;
  status: 'pending' | 'completed' | 'overdue';
  administeredBy?: string;
  administeredDate?: string;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Request/Response interfaces
export interface CreateEggCollectionRequest {
  date: string; // Required, ISO date format: YYYY-MM-DD
  shift: Shift; // Required, Morning | Afternoon | Evening
  pen: string; // Required
  quantity?: number; // Required (or use collected/gradeA for legacy)
  grade?: EggGrade; // Required (or use quality for legacy)
  avgWeight?: string; // Optional, e.g., "58g"
  collector?: string; // Optional (or use collectedBy for legacy)
  notes?: string;
  farmId?: string; // Optional, will use user's farmId if not provided
  // Legacy fields for backward compatibility
  collected?: number; // Legacy field for quantity
  gradeA?: number; // Legacy: quantity for grade A
  gradeB?: number; // Legacy: quantity for grade B
  cracked?: number; // Legacy: broken eggs
  quality?: EggGrade; // Legacy field for grade
  weight?: string; // Legacy field for avgWeight
  collectedBy?: string; // Legacy field for collector
}

export interface UpdateEggCollectionRequest extends Partial<CreateEggCollectionRequest> {
  id: string;
}

export interface CreateUserRequest {
  email: string;
  name: string;
  phone?: string;
  role: UserRole;
  password: string;
  farmId?: string;
}

export interface UpdateUserRequest {
  name?: string;
  email?: string;
  phone?: string;
  role?: UserRole;
  status?: 'active' | 'inactive';
  isActive?: boolean;
  password?: string;
}

export interface CreateBirdRequest {
  penId: string;
  breed: string;
  age: number;
  quantity: number;
  farmId: string;
  healthStatus?: HealthStatus;
  notes?: string;
}

export interface UpdateBirdRequest extends Partial<CreateBirdRequest> {
  lastCheckup?: string;
}

export interface CreateFeedRequest {
  name: string; // required
  type: string; // required: layer, starter, grower, finisher, supplement
  supplier: string; // required
  quantity: number; // required (initial stock)
  unit: string; // required: kg, lbs, tons, etc.
  costPerUnit?: number;
  expiryDate?: string; // ISO date
  location?: string; // storage location
  batchNumber?: string;
  notes?: string;
  maxCapacity?: number; // maximum storage capacity
  farmId?: string;
  // Legacy fields for backward compatibility
  feedType?: string;
  minimumStock?: number;
}

export interface UpdateFeedRequest extends Partial<CreateFeedRequest> {
  stock?: number;
}

export interface FeedUsageRequest {
  feedId: string; // required
  quantity: number; // required
  pen: string; // required
  usedBy: string; // required, user ID
  date: string; // required, ISO date
  notes?: string;
}

export interface FeedReorderRequest {
  quantity: number; // required
  priority?: 'low' | 'medium' | 'high';
  notes?: string;
}

export interface CreateMedicineRequest {
  name: string; // Required: Medicine name
  type: 'vaccine' | 'antibiotic' | 'vitamin' | 'treatment'; // Required: Medicine type
  supplier: string; // Required: Supplier name
  quantity: number; // Required: Initial stock quantity
  unit: string; // Required: Unit of measurement (e.g., 'ml', 'tablets', 'vials')
  expiryDate: string; // Required: Expiration date (ISO date: YYYY-MM-DD)
  costPerUnit?: number; // Optional: Cost per unit
  location?: string; // Optional: Storage location
  batchNumber?: string; // Optional: Batch or lot number
  notes?: string; // Optional: Additional notes
  usage?: string; // Optional: Usage instructions (e.g., "Oral", "Injection")
  farmId?: string; // Optional: Farm ID (uses user's farmId if not provided)
  // Legacy fields for backward compatibility
  medicineName?: string; // Legacy field for name
  currentStock?: number; // Legacy field for quantity
  unitPrice?: number; // Legacy field for costPerUnit
  minimumStock?: number; // Minimum stock threshold
}

export interface UpdateMedicineRequest extends Partial<CreateMedicineRequest> {
  stock?: number; // Allow updating stock directly
}

export interface TreatmentRecord {
  id: string;
  medicineId: string; // Medicine ID
  birdGroup: string; // Bird group identifier
  dosage: string; // Dosage (e.g., '5ml', '2 tablets')
  administeredBy: string; // User ID or name
  date: string; // Treatment date (ISO date: YYYY-MM-DD)
  reason: string; // Treatment reason/notes
  outcome?: string; // Treatment outcome (optional)
  farmId: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  // Legacy/alternative field names for backward compatibility
  birdGroupId?: string; // Alternative field name for birdGroup
  treatment?: string; // Alternative field name for medicine name
  medicineName?: string; // Medicine name (for display)
  usedBy?: string; // Alternative field name for administeredBy
  adminBy?: string; // Alternative field name for administeredBy
}

export interface CreateTreatmentRequest {
  medicineId: string; // Required: Medicine ID
  birdGroup: string; // Required: Bird group identifier
  dosage: string; // Required: Dosage (e.g., '5ml', '2 tablets')
  administeredBy: string; // Required: User ID or name
  date: string; // Required: Treatment date (ISO date: YYYY-MM-DD)
  reason: string; // Required: Treatment reason/notes
  outcome?: string; // Optional: Treatment outcome
}

export interface MedicineInventory {
  id: string;
  name: string; // Medicine name
  type: 'vaccine' | 'antibiotic' | 'vitamin' | 'treatment'; // Medicine type
  stock: number; // Current stock quantity
  unit: string; // Unit of measurement (ml, tablets, vials, etc.)
  status?: 'In Stock' | 'Low Stock' | 'Out of Stock'; // Calculated status
  expiryDate?: string; // Expiration date (ISO format: YYYY-MM-DD)
  supplier?: string; // Supplier name
  usage?: string; // Usage instructions (e.g., "Oral", "Injection")
  costPerUnit?: number; // Cost per unit
  location?: string; // Storage location
  batchNumber?: string; // Batch or lot number
  notes?: string; // Additional notes
  farmId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  // Legacy fields for backward compatibility
  medicineName?: string; // Legacy field for name
  currentStock?: number; // Legacy field for stock
  unitPrice?: number; // Legacy field for costPerUnit
  minimumStock?: number; // Minimum stock threshold
}

// Statistics interfaces
export interface DailyStats {
  date: string;
  totalEggs: number;
  gradeDistribution: Record<EggGrade, number>;
  shiftDistribution: Record<Shift, number>;
  avgWeight: number;
  totalPens: number;
}

export interface WeeklyStats {
  weekStart: string;
  weekEnd: string;
  totalEggs: number;
  dailyAverage: number;
  gradeDistribution: Record<EggGrade, number>;
  topPerformingPens: Array<{ pen: string; total: number }>;
}

export interface MonthlyStats {
  month: string;
  year: number;
  totalEggs: number;
  dailyAverage: number;
  weeklyTrend: Array<{ week: number; total: number }>;
  gradeDistribution: Record<EggGrade, number>;
}

export interface ProductionTrend {
  period: string;
  eggs: number;
  change: number;
  changePercent: number;
}

// Authentication interfaces
export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email: string;
    role: UserRole;
    name: string;
  };
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
  };
}

// API Response interfaces
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Query interfaces
export interface QueryOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  startDate?: string;
  endDate?: string;
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface StatsQuery {
  farmId?: string;
  startDate?: string;
  endDate?: string;
  groupBy?: string;
  metric?: string;
}

export interface CollectionQueryOptions extends QueryOptions {
  farmId?: string;
  pen?: string;
  shift?: Shift;
  grade?: EggGrade;
  collector?: string;
}

export interface BirdQueryOptions extends QueryOptions {
  penId?: string;
  breed?: string;
  healthStatus?: HealthStatus;
}

// Report interfaces
export interface ReportOptions {
  startDate: string;
  endDate: string;
  format: 'pdf' | 'csv';
  includeStats?: boolean;
}

export interface CollectionReport {
  summary: {
    totalEggs: number;
    totalPens: number;
    avgDailyProduction: number;
    gradeDistribution: Record<EggGrade, number>;
  };
  collections: EggCollection[];
  generatedAt: string;
  period: {
    start: string;
    end: string;
  };
}

// Error interfaces
export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

export interface ApiError extends Error {
  statusCode: number;
  isOperational: boolean;
  validationErrors?: ValidationError[];
}

// Firebase interfaces
export interface FirebaseConfig {
  projectId: string;
  privateKey: string;
  clientEmail: string;
}

// Utility types
export type CreateRequest<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateRequest<T> = Partial<Omit<T, 'id' | 'createdAt'>> & { updatedAt?: Timestamp };
export type DatabaseDocument<T> = T & { id: string; createdAt: Timestamp; updatedAt: Timestamp };

// All types and interfaces are exported above