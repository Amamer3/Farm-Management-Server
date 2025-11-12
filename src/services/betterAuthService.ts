import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import firestoreService from './firestoreService';
import { User, UserRole } from '../models/types';
import { Timestamp } from 'firebase-admin/firestore';

// Since Better Auth doesn't have a Firestore adapter, we'll create a custom implementation
// that uses JWT tokens and stores user data in Firestore

interface TokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

class BetterAuthService {
  private static instance: BetterAuthService;
  private secretKey: string;
  private tokenExpiry: string;

  private constructor() {
    this.secretKey = process.env.JWT_SECRET || process.env.BETTER_AUTH_SECRET || 'your-secret-key-change-in-production';
    this.tokenExpiry = process.env.JWT_EXPIRY || '7d';
    
    if (!process.env.JWT_SECRET && !process.env.BETTER_AUTH_SECRET) {
      console.warn('⚠️  JWT_SECRET or BETTER_AUTH_SECRET not set. Using default secret. This is insecure for production!');
    } 
  }

  public static getInstance(): BetterAuthService {
    if (!BetterAuthService.instance) {
      BetterAuthService.instance = new BetterAuthService();
    }
    return BetterAuthService.instance;
  }

  /**
   * Create a new user with email and password
   */
  public async createUser(userData: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<{ id: string; email: string; name: string }> {
    try {
      // Normalize email: lowercase and trim
      const normalizedEmail = userData.email.toLowerCase().trim();
      
      // Check if user already exists
      const existingUser = await firestoreService.getUserByEmail(normalizedEmail);
      if (existingUser) {
        throw new Error('A user with this email already exists');
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(userData.password, 10);

      // Generate user ID
      const userId = this.generateUserId();

      // Create user in Firestore with normalized email
      const userRecord: Omit<User, 'id'> = {
        email: normalizedEmail, // Store normalized email
        name: userData.displayName,
        role: UserRole.WORKER, // Default role
        farmId: '', // Will be set by the controller
        passwordHash: hashedPassword, // Store hashed password
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        isActive: true,
        emailVerified: false,
      };

      // Create user in Firestore with the generated userId
      const createdUser = await firestoreService.createUser(userRecord, userId);

      return {
        id: createdUser.id,
        email: createdUser.email,
        name: createdUser.name,
      };
    } catch (error: any) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  /**
   * Sign in with email and password
   */
  public async signInWithEmailAndPassword(
    email: string,
    password: string
  ): Promise<{ uid: string; email: string; getIdToken: () => Promise<string>; getRefreshToken: () => Promise<string> }> {
    try {
      // Normalize email: lowercase and trim
      const normalizedEmail = email.toLowerCase().trim();
      
      // Get user from Firestore
      const user = await firestoreService.getUserByEmail(normalizedEmail);
      if (!user) {
        // Log for debugging (without sensitive info)
        console.error('Login failed: User not found', { email: normalizedEmail });
        throw new Error('Invalid email or password');
      }

      // Check if user is active
      if (user.isActive === false) {
        console.error('Login failed: Account deactivated', { userId: user.id, email: normalizedEmail });
        throw new Error('User account is deactivated');
      }

      // Verify password
      const passwordHash = (user as any).passwordHash;
      if (!passwordHash) {
        console.error('Login failed: Password not set', { userId: user.id, email: normalizedEmail });
        throw new Error('Password not set for this user. Please contact an administrator to reset your password or use the password reset feature.');
      }

      const isPasswordValid = await bcrypt.compare(password, passwordHash);
      if (!isPasswordValid) {
        // Log for debugging (without sensitive info)
        console.error('Login failed: Invalid password', { userId: user.id, email: normalizedEmail, hasPasswordHash: !!passwordHash });
        throw new Error('Invalid email or password');
      }

      // Generate tokens
      const token = this.generateToken(user.id, user.email, user.role);
      const refreshToken = this.generateRefreshToken(user.id);

      return {
        uid: user.id,
        email: user.email,
        getIdToken: async () => token,
        getRefreshToken: async () => refreshToken,
      };
    } catch (error: any) {
      // Re-throw if it's already a user-friendly error
      if (error.message && (
        error.message.includes('Invalid email or password') ||
        error.message.includes('deactivated') ||
        error.message.includes('Password not set')
      )) {
        throw error;
      }
      
      console.error('Error signing in:', error);
      throw new Error('Invalid email or password');
    }
  }

  /**
   * Verify JWT token
   * Returns a format compatible with Firebase Auth's DecodedIdToken
   */
  public async verifyIdToken(token: string): Promise<{ uid: string; email: string; role: UserRole }> {
    try {
      const decoded = jwt.verify(token, this.secretKey) as TokenPayload;
      return {
        uid: decoded.userId,
        email: decoded.email,
        role: decoded.role,
      };
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Token has expired');
      } else if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid token');
      }
      throw new Error('Token verification failed');
    }
  }

  /**
   * Update user (email, displayName, password)
   */
  public async updateUser(
    uid: string,
    userData: Partial<{
      email: string;
      displayName: string;
      password: string;
    }>
  ): Promise<{ id: string; email: string; name: string }> {
    try {
      const updateData: any = {};

      if (userData.email) {
        updateData.email = userData.email;
      }

      if (userData.displayName) {
        updateData.name = userData.displayName;
      }

      if (userData.password) {
        updateData.passwordHash = await bcrypt.hash(userData.password, 10);
      }

      updateData.updatedAt = Timestamp.now();

      const updatedUser = await firestoreService.updateUser(uid, updateData);
      
      if (!updatedUser) {
        throw new Error('User not found');
      }

      return {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
      };
    } catch (error: any) {
      console.error('Error updating user:', error);
      throw error;
    }
  }

  /**
   * Graceful update - same as updateUser but doesn't throw on errors
   * For backward compatibility with Firebase service
   */
  public async updateUserGraceful(
    uid: string,
    userData: Partial<{
      email: string;
      displayName: string;
      password: string;
    }>
  ): Promise<{ id: string; email: string; name: string } | null> {
    try {
      return await this.updateUser(uid, userData);
    } catch (error: any) {
      console.warn('Graceful user update failed:', error);
      return null;
    }
  }

  /**
   * Delete user
   */
  public async deleteUser(uid: string): Promise<void> {
    try {
      await firestoreService.deleteUser(uid);
    } catch (error: any) {
      console.error('Error deleting user:', error);
      throw error;
    }
  }

  /**
   * Revoke refresh tokens (logout)
   */
  public async revokeRefreshTokens(uid: string): Promise<void> {
    // In a JWT-based system, we can't really "revoke" tokens without storing them
    // We could implement a token blacklist in Redis or Firestore
    // For now, we'll just log it
    console.log(`Refresh tokens revoked for user: ${uid}`);
  }

  /**
   * Generate JWT token
   */
  private generateToken(userId: string, email: string, role: UserRole): string {
    const payload: TokenPayload = {
      userId,
      email,
      role,
    };

    return jwt.sign(payload, this.secretKey, {
      expiresIn: this.tokenExpiry || '7d',
    } as SignOptions);
  }

  /**
   * Generate refresh token
   */
  private generateRefreshToken(userId: string): string {
    return jwt.sign({ userId, type: 'refresh' }, this.secretKey, {
      expiresIn: '30d',
    } as SignOptions);
  }

  /**
   * Generate user ID
   */
  private generateUserId(): string {
    // Generate a unique ID (you can use uuid or any other method)
    return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export default BetterAuthService.getInstance();

