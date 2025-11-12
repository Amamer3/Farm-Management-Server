import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import admin from 'firebase-admin';
import { initializeApp, getApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, UserCredential } from 'firebase/auth';

class FirebaseService {
  private static instance: FirebaseService;
  private app: admin.app.App;
  private auth: admin.auth.Auth;
  private clientApp: any;
  private clientAuth: any;

  private constructor() {
    this.initializeFirebase();
    this.initializeClientFirebase();
    this.app = admin.app();
    this.auth = admin.auth();
  }

  public static getInstance(): FirebaseService {
    if (!FirebaseService.instance) {
      FirebaseService.instance = new FirebaseService();
    }
    return FirebaseService.instance;
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

        console.log('Firebase Admin SDK initialized successfully');
      }
    } catch (error) {
      console.error('Error initializing Firebase Admin SDK:', error);
      throw new Error('Failed to initialize Firebase Admin SDK');
    }
  }

  private initializeClientFirebase(): void {
    try {
      if (!process.env.FIREBASE_API_KEY) {
        console.warn('FIREBASE_API_KEY not found. Email/password authentication will not be available.');
        return;
      }

      const firebaseConfig = {
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: `${process.env.FIREBASE_PROJECT_ID}.firebaseapp.com`,
        projectId: process.env.FIREBASE_PROJECT_ID,
      };

      this.clientApp = initializeApp(firebaseConfig, 'client');
      this.clientAuth = getAuth(this.clientApp);
      
      console.log('Firebase Client SDK initialized successfully');
    } catch (error) {
      console.error('Error initializing Firebase Client SDK:', error);
      console.warn('Email/password authentication will not be available.');
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

  // Authentication methods
  public async verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
    try {
      const decodedToken = await this.auth.verifyIdToken(idToken);
      return decodedToken;
    } catch (error) {
      console.error('Error verifying ID token:', error);
      throw new Error('Invalid or expired token');
    }
  }

  public async signInWithEmailAndPassword(email: string, password: string): Promise<{ uid: string; email: string; getIdToken: () => Promise<string>; getRefreshToken: () => Promise<string> }> {
    try {
      if (!this.clientAuth) {
        throw new Error('Firebase Client SDK not initialized. Please set FIREBASE_API_KEY in environment variables.');
      }

      const userCredential = await signInWithEmailAndPassword(this.clientAuth, email, password);
      const user = userCredential.user;
      
      // Get refresh token from user's internal state
      // In Firebase v9+, refresh token is stored in user's stsTokenManager
      const getRefreshToken = async (): Promise<string> => {
        // Access the refresh token from the user's internal state
        // Note: This is accessing internal Firebase SDK properties
        const stsTokenManager = (user as any).stsTokenManager;
        if (stsTokenManager && stsTokenManager.refreshToken) {
          return stsTokenManager.refreshToken;
        }
        
        // Fallback: Use Firebase REST API to get refresh token
        // This requires making a request to Firebase Auth REST API
        const apiKey = process.env.FIREBASE_API_KEY;
        if (!apiKey) {
          throw new Error('FIREBASE_API_KEY is required to get refresh token');
        }
        
        const response = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email,
              password,
              returnSecureToken: true
            })
          }
        );
        
        const data = await response.json() as { refreshToken?: string; error?: { message: string } };
        if (!response.ok) {
          throw new Error(data.error?.message || 'Failed to get refresh token');
        }
        
        if (!data.refreshToken) {
          throw new Error('Refresh token not found in response');
        }
        
        return data.refreshToken;
      };
      
      return {
        uid: user.uid,
        email: user.email || email,
        getIdToken: () => user.getIdToken(),
        getRefreshToken
      };
    } catch (error: any) {
      console.error('Error signing in with email/password:', error);
      
      // Extract error code from various possible formats
      let errorCode = error.code;
      if (!errorCode && error.message) {
        // Handle format like "Firebase: Error (auth/invalid-credential)."
        const match = error.message.match(/auth\/([a-z-]+)/i);
        if (match) {
          errorCode = `auth/${match[1]}`;
        }
      }
      
      // Convert Firebase auth errors to more user-friendly messages
      if (errorCode === 'auth/user-not-found' || 
          errorCode === 'auth/wrong-password' || 
          errorCode === 'auth/invalid-credential') {
        throw new Error('Invalid email or password');
      } else if (errorCode === 'auth/invalid-email') {
        throw new Error('Invalid email address');
      } else if (errorCode === 'auth/user-disabled') {
        throw new Error('User account has been disabled');
      } else if (errorCode === 'auth/too-many-requests') {
        throw new Error('Too many failed login attempts. Please try again later');
      } else if (errorCode && errorCode.startsWith('auth/')) {
        // Generic auth error
        throw new Error('Authentication failed. Please check your credentials and try again.');
      }
      
      throw new Error(error.message || 'Authentication failed');
    }
  }

  public async createUser(userData: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<admin.auth.UserRecord> {
    try {
      const userRecord = await this.auth.createUser({
        email: userData.email,
        password: userData.password,
        displayName: userData.displayName,
        emailVerified: false,
      });
      return userRecord;
    } catch (error: any) {
      console.error('Error creating user:', error);
      
      // Provide more helpful error messages for permission issues
      if (error.message && (error.message.includes('PERMISSION_DENIED') || error.message.includes('serviceusage'))) {
        const projectId = process.env.FIREBASE_PROJECT_ID || 'your-project-id';
        const errorWithInstructions = new Error(
          `Service account lacks required permissions to use Firebase Authentication API. ` +
          `Please grant the "Service Usage Consumer" role (roles/serviceusage.serviceUsageConsumer) ` +
          `to your service account in Google Cloud Console: ` +
          `https://console.cloud.google.com/iam-admin/iam?project=${projectId}. ` +
          `See firebase-setup.md for detailed instructions.`
        );
        errorWithInstructions.name = error.name || 'PermissionError';
        throw errorWithInstructions;
      }
      
      throw error;
    }
  }

  public async updateUser(
    uid: string,
    userData: Partial<{
      email: string;
      displayName: string;
      disabled: boolean;
      password: string;
    }>
  ): Promise<admin.auth.UserRecord> {
    try {
      const userRecord = await this.auth.updateUser(uid, userData);
      return userRecord;
    } catch (error: any) {
      console.error('Error updating user:', error);
      
      // Provide more helpful error messages for permission issues
      if (error.message && (error.message.includes('PERMISSION_DENIED') || error.message.includes('serviceusage'))) {
        const projectId = process.env.FIREBASE_PROJECT_ID || 'your-project-id';
        const errorWithInstructions = new Error(
          `Service account lacks required permissions to use Firebase Authentication API. ` +
          `Please grant the "Service Usage Consumer" role (roles/serviceusage.serviceUsageConsumer) ` +
          `to your service account in Google Cloud Console: ` +
          `https://console.cloud.google.com/iam-admin/iam?project=${projectId}. ` +
          `See firebase-setup.md for detailed instructions.`
        );
        errorWithInstructions.name = error.name || 'PermissionError';
        throw errorWithInstructions;
      }
      
      throw error;
    }
  }

  /**
   * Attempts to update Firebase Auth user, but doesn't throw on permission errors.
   * This allows the application to continue functioning even if Firebase Auth permissions are missing.
   * Firestore remains the source of truth.
   * 
   * @param uid - User ID
   * @param userData - User data to update
   * @returns UserRecord if successful, null if permission error, throws for other errors
   */
  public async updateUserGraceful(
    uid: string,
    userData: Partial<{
      email: string;
      displayName: string;
      disabled: boolean;
      password: string;
    }>
  ): Promise<admin.auth.UserRecord | null> {
    try {
      const userRecord = await this.auth.updateUser(uid, userData);
      return userRecord;
    } catch (error: any) {
      // If it's a permission error, log warning but don't throw
      if (error.message && (error.message.includes('PERMISSION_DENIED') || error.message.includes('serviceusage'))) {
        const projectId = process.env.FIREBASE_PROJECT_ID || 'your-project-id';
        console.warn(
          `[Firebase Auth Update Skipped] Service account lacks permissions. ` +
          `Firestore was updated successfully, but Firebase Auth update was skipped. ` +
          `Grant "Service Usage Consumer" role at: ` +
          `https://console.cloud.google.com/iam-admin/iam?project=${projectId}`,
          { uid, userData }
        );
        return null;
      }
      
      // For other errors, still throw (these are real issues)
      console.error('Error updating user in Firebase Auth:', error);
      throw error;
    }
  }

  public async deleteUser(uid: string): Promise<void> {
    try {
      await this.auth.deleteUser(uid);
    } catch (error) {
      console.error('Error deleting user:', error);
      throw error;
    }
  }

  public async getUserByEmail(email: string): Promise<admin.auth.UserRecord> {
    try {
      const userRecord = await this.auth.getUserByEmail(email);
      return userRecord;
    } catch (error) {
      console.error('Error getting user by email:', error);
      throw error;
    }
  }

  public async getUserById(uid: string): Promise<admin.auth.UserRecord> {
    try {
      const userRecord = await this.auth.getUser(uid);
      return userRecord;
    } catch (error) {
      console.error('Error getting user by ID:', error);
      throw error;
    }
  }

  public async setCustomUserClaims(uid: string, customClaims: object): Promise<void> {
    try {
      await this.auth.setCustomUserClaims(uid, customClaims);
    } catch (error) {
      console.error('Error setting custom user claims:', error);
      throw error;
    }
  }

  public async listUsers(maxResults: number = 1000): Promise<admin.auth.ListUsersResult> {
    try {
      const listUsersResult = await this.auth.listUsers(maxResults);
      return listUsersResult;
    } catch (error) {
      console.error('Error listing users:', error);
      throw error;
    }
  }

  // Utility methods
  public getAuth(): admin.auth.Auth {
    return this.auth;
  }

  public getApp(): admin.app.App {
    return this.app;
  }

  public async generateCustomToken(uid: string, additionalClaims?: object): Promise<string> {
    try {
      const customToken = await this.auth.createCustomToken(uid, additionalClaims);
      return customToken;
    } catch (error) {
      console.error('Error generating custom token:', error);
      throw error;
    }
  }

  // Password reset
  public async generatePasswordResetLink(email: string): Promise<string> {
    try {
      const link = await this.auth.generatePasswordResetLink(email);
      return link;
    } catch (error) {
      console.error('Error generating password reset link:', error);
      throw error;
    }
  }

  // Email verification
  public async generateEmailVerificationLink(email: string): Promise<string> {
    try {
      const link = await this.auth.generateEmailVerificationLink(email);
      return link;
    } catch (error) {
      console.error('Error generating email verification link:', error);
      throw error;
    }
  }

  public async revokeRefreshTokens(uid: string): Promise<void> {
    try {
      await this.auth.revokeRefreshTokens(uid);
    } catch (error) {
      console.error('Error revoking refresh tokens:', error);
      throw error;
    }
  }
}

export default FirebaseService.getInstance();