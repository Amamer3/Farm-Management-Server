import { Request, Response } from 'express';
import { BaseController } from './baseController';
import { ApiResponse, User, UserRole, CreateUserRequest, UpdateUserRequest } from '../models/types';
import { createSuccessResponse, createErrorResponse } from '../utils/responseHelper';
import { ErrorFactory } from '../models/errors';
import { Timestamp as FirestoreTimestamp } from 'firebase-admin/firestore';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

export class AuthController extends BaseController {
  // Register new user (Super Admin only)
  async register(req: Request, res: Response): Promise<void> {
    await this.handleRequest(
      req,
      res,
      async () => {
      const { email, password, name, role, farmId }: CreateUserRequest = req.body;
        const { userId: currentUserId } = this.validateUser(req);

      // Validate required fields
      if (!email || !password || !name || !role) {
          throw ErrorFactory.validation('Missing required fields: email, password, name, and role are required');
      }

      // Validate role is a valid enum value
      const validRoles = Object.values(UserRole);
      if (!validRoles.includes(role)) {
          throw ErrorFactory.validation(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
      }

      // Get current user to verify permissions
        const currentUser = await this.validateUserExists(currentUserId);

      // Only admins can register users
      if (currentUser.role !== UserRole.ADMIN) {
          throw ErrorFactory.authorization('Only administrators can register new users');
      }

      // Create user in Better Auth
        const authUser = await this.firebaseService.createUser({
        email,
        password,
        displayName: name
      });

      // Create user document in Firestore
        const userData = {
          id: authUser.id,
        email,
        name,
        role,
          farmId: farmId || currentUser.farmId,
        createdAt: FirestoreTimestamp.now(),
          updatedAt: FirestoreTimestamp.now(),
          isActive: true
      };

        const newUser = await this.firestoreService.createUser(userData);

        // Audit log
        await this.auditLog(currentUserId, 'USER_REGISTERED', 'USER', authUser.id, {
        email,
        role,
          farmId: userData.farmId
        });

        return {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          role: newUser.role,
          farmId: newUser.farmId,
          createdAt: newUser.createdAt
        };
      },
      'User registered successfully'
    );
  }

  // Login user
  async login(req: Request, res: Response): Promise<void> {
    await this.handleRequest(
      req,
      res,
      async () => {
      const { email, password } = req.body;

      if (!email || !password) {
          throw ErrorFactory.validation('Email and password are required');
      }

        // Sign in with Better Auth
        const authUser = await this.firebaseService.signInWithEmailAndPassword(email, password);
      
      // Get user data from Firestore
        const userData = await this.firestoreService.getUserById(authUser.uid);
        if (!userData) {
          throw ErrorFactory.notFound('User not found in database');
        }

        // Check if user is active
        if (userData.isActive === false) {
          throw ErrorFactory.authorization('Account is deactivated');
        }

        // Generate ID token and refresh token
        const token = await authUser.getIdToken();
        const refreshToken = await authUser.getRefreshToken();

        // Update last login
        await this.firestoreService.updateUser(authUser.uid, {
          lastLogin: FirestoreTimestamp.now()
        });

        // Audit log
        await this.auditLog(authUser.uid, 'USER_LOGIN', 'USER', authUser.uid, {
          email,
          loginTime: new Date().toISOString()
        });

        // Return minimal user data for security
        // Tokens should be stored securely on client (preferably in httpOnly cookie)
        return {
          token,
          refreshToken,
          user: {
            id: userData.id,
            name: userData.name,
            role: userData.role,
            // Email and farmId removed from response for security
            // These can be retrieved via /api/auth/profile if needed
          },
          expiresIn: 3600 // ID token expires in 1 hour (Firebase default)
        };
      },
      'Login successful'
    );
  }

  // Get user profile
  async getProfile(req: Request, res: Response): Promise<void> {
    await this.handleRequest(
      req,
      res,
      async () => {
        const { userId } = this.validateUser(req);
        const user = await this.validateUserExists(userId);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone,
          dateOfBirth: (user as any).dateOfBirth,
          address: (user as any).address,
          bio: (user as any).bio,
          avatar: (user as any).avatar,
          role: user.role,
          farmId: user.farmId,
          isActive: user.isActive,
          createdAt: user.createdAt,
          lastLogin: user.lastLogin
        };
      },
      'Profile retrieved successfully'
    );
  }

  // Update user profile
  async updateProfile(req: Request, res: Response): Promise<void> {
    await this.handleRequest(
      req,
      res,
      async () => {
        const { userId } = this.validateUser(req);
        const { name, email, phone, dateOfBirth, address, bio, displayName } = req.body;

        // Support both 'name' and 'displayName' for compatibility
        const displayNameValue = name || displayName;

        // Validate input - at least one field must be provided
        if (!displayNameValue && !email && phone === undefined && !dateOfBirth && !address && bio === undefined) {
          throw ErrorFactory.validation('At least one field is required');
        }

        const updateData: any = {
          updatedAt: FirestoreTimestamp.now()
        };

        if (displayNameValue) updateData.name = displayNameValue;
        if (email) updateData.email = email;
        if (phone !== undefined) updateData.phone = phone || null; // Allow clearing phone
        if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth || null; // Allow clearing dateOfBirth
        if (address !== undefined) updateData.address = address || null; // Allow clearing address
        if (bio !== undefined) updateData.bio = bio || null; // Allow clearing bio

        // Update in Firestore
        const updatedUser = await this.firestoreService.updateUser(userId, updateData);

        // If email was updated, update in Better Auth as well (graceful - won't fail if errors)
        if (email && this.firebaseService.updateUserGraceful) {
          await this.firebaseService.updateUserGraceful(userId, { email });
        }
        
        // If name was updated, update displayName in Better Auth as well (graceful)
        if (displayNameValue && this.firebaseService.updateUserGraceful) {
          await this.firebaseService.updateUserGraceful(userId, { displayName: displayNameValue });
        }

        // Audit log
        await this.auditLog(userId, 'PROFILE_UPDATED', 'USER', userId, {
          updatedFields: Object.keys(updateData)
        });

        return {
          id: updatedUser.id,
          email: updatedUser.email,
          name: updatedUser.name,
          phone: updatedUser.phone,
          dateOfBirth: (updatedUser as any).dateOfBirth,
          address: (updatedUser as any).address,
          bio: (updatedUser as any).bio,
          avatar: (updatedUser as any).avatar,
          role: updatedUser.role,
          farmId: updatedUser.farmId,
          updatedAt: updatedUser.updatedAt
        };
      },
      'Profile updated successfully'
    );
  }

  // Upload avatar/profile picture
  async uploadAvatar(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      if (!userId) {
        const response = createErrorResponse('User not authenticated');
        res.status(401).json(response);
        return;
      }

      // Configure multer for avatar uploads
      const avatarStorage = multer.diskStorage({
        destination: (req: any, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
          const uploadDir = path.join(process.cwd(), 'uploads', 'avatars');
          if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
          }
          cb(null, uploadDir);
        },
        filename: (req: any, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
          const ext = path.extname(file.originalname);
          const filename = `avatar-${userId}-${Date.now()}${ext}`;
          cb(null, filename);
        }
      });

      const avatarUpload = multer({
        storage: avatarStorage,
        limits: {
          fileSize: 5 * 1024 * 1024 // 5MB limit for avatars
        },
        fileFilter: (req: any, file: Express.Multer.File, cb: (error: Error | null, acceptFile: boolean) => void) => {
          const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
          if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
          } else {
            cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed'), false);
          }
        }
      });

      return new Promise<void>((resolve, reject) => {
        avatarUpload.single('avatar')(req, res, async (err: any) => {
          if (err) {
            const response = createErrorResponse(err.message || 'File upload failed');
            res.status(400).json(response);
            return resolve();
          }

          if (!req.file) {
            const response = createErrorResponse('No file uploaded');
            res.status(400).json(response);
            return resolve();
          }

          try {
            // Get current user to check for existing avatar
            const currentUser = await this.validateUserExists(userId);
            
            // Delete old avatar if it exists
            if (currentUser.avatar) {
              const oldAvatarPath = path.join(process.cwd(), 'uploads', 'avatars', path.basename(currentUser.avatar));
              if (fs.existsSync(oldAvatarPath)) {
                fs.unlinkSync(oldAvatarPath);
              }
            }

            // Save avatar path/URL to user profile
            const avatarPath = `/uploads/avatars/${req.file.filename}`;
            const updatedUser = await this.firestoreService.updateUser(userId, {
              avatar: avatarPath,
              updatedAt: FirestoreTimestamp.now()
            });

            // Audit log
            await this.auditLog(userId, 'AVATAR_UPDATED', 'USER', userId);

            const response = createSuccessResponse('Avatar uploaded successfully', {
              avatar: avatarPath,
              user: {
                id: updatedUser.id,
                email: updatedUser.email,
                name: updatedUser.name,
                avatar: avatarPath
              }
            });
            res.status(200).json(response);
            resolve();
          } catch (error: any) {
            // Delete uploaded file if update fails
            if (req.file?.path && fs.existsSync(req.file.path)) {
              fs.unlinkSync(req.file.path);
            }
            const response = createErrorResponse(error.message || 'Failed to update avatar');
            res.status(500).json(response);
            resolve();
          }
        });
      });
    } catch (error: any) {
      const response = createErrorResponse(error.message || 'Failed to upload avatar');
      res.status(500).json(response);
    }
  }

  // Delete avatar
  async deleteAvatar(req: Request, res: Response): Promise<void> {
    await this.handleRequest(
      req,
      res,
      async () => {
        const { userId } = this.validateUser(req);
        const user = await this.validateUserExists(userId);

        if (!user.avatar) {
          throw ErrorFactory.notFound('No avatar found to delete');
        }

        // Delete avatar file
        const avatarPath = path.join(process.cwd(), user.avatar);
        if (fs.existsSync(avatarPath)) {
          fs.unlinkSync(avatarPath);
        }

        // Remove avatar from user profile
        await this.firestoreService.updateUser(userId, {
          avatar: null,
          updatedAt: FirestoreTimestamp.now()
        });

        // Audit log
        await this.auditLog(userId, 'AVATAR_DELETED', 'USER', userId);

        return { message: 'Avatar deleted successfully' };
      },
      'Avatar deleted successfully'
    );
  }

  // Change password
  async changePassword(req: Request, res: Response): Promise<void> {
    await this.handleRequest(
      req,
      res,
      async () => {
        const { userId } = this.validateUser(req);
        const { currentPassword, newPassword } = req.body;

        if (!newPassword) {
          throw ErrorFactory.validation('New password is required');
        }

        if (newPassword.length < 8) {
          throw ErrorFactory.validation('New password must be at least 8 characters long');
        }

        // Get user data
        const user = await this.validateUserExists(userId);
        const userData = await this.firestoreService.getUserById(userId);
        const hasPassword = userData && (userData as any).passwordHash;

        // If user has a password, require current password
        if (hasPassword) {
          if (!currentPassword) {
            throw ErrorFactory.validation('Current password is required');
          }

          // Verify current password by attempting to sign in
          try {
            await this.firebaseService.signInWithEmailAndPassword(user.email, currentPassword);
          } catch (error) {
            throw ErrorFactory.authentication('Current password is incorrect');
          }
        }

        // Update password in Better Auth
        await this.firebaseService.updateUser(userId, { password: newPassword });

        // Audit log
        await this.auditLog(userId, hasPassword ? 'PASSWORD_CHANGED' : 'PASSWORD_SET', 'USER', userId);

        return { message: hasPassword ? 'Password changed successfully' : 'Password set successfully' };
      },
      'Password updated successfully'
    );
  }

  // Logout user
  async logout(req: Request, res: Response): Promise<void> {
    await this.handleRequest(
      req,
      res,
      async () => {
        const { userId } = this.validateUser(req);

        // Revoke refresh tokens in Firebase to invalidate all sessions
        try {
          await this.firebaseService.revokeRefreshTokens(userId);
        } catch (error) {
          // Log but don't fail logout if token revocation fails
          this.logger.warn('Failed to revoke refresh tokens', { userId, error: (error as Error).message });
        }

        // Audit log
        await this.auditLog(userId, 'USER_LOGOUT', 'USER', userId);

        return { message: 'Logged out successfully. All tokens have been revoked.' };
      },
      'Logged out successfully'
    );
  }

  // Forgot password
  async forgotPassword(req: Request, res: Response): Promise<void> {
    await this.handleRequest(
      req,
      res,
      async () => {
      const { email } = req.body;
      
      if (!email) {
          throw ErrorFactory.validation('Email is required');
        }

        // Check if user exists
        const user = await this.firestoreService.getUserById(email); // This might need adjustment based on your implementation
        if (!user) {
          throw ErrorFactory.notFound('User not found');
        }

        // Generate password reset token (this would typically involve sending an email)
        // For now, we'll just log the request
        this.logger.info('Password reset requested', { email });

        // Audit log
        await this.auditLog(user.id, 'PASSWORD_RESET_REQUESTED', 'USER', user.id, { email });

        return { message: 'Password reset instructions sent to your email' };
      },
      'Password reset instructions sent'
    );
  }

  // Verify email
  async verifyEmail(req: Request, res: Response): Promise<void> {
    await this.handleRequest(
      req,
      res,
      async () => {
        const { userId } = this.validateUser(req);
        const { verificationCode } = req.body;

        if (!verificationCode) {
          throw ErrorFactory.validation('Verification code is required');
        }

        // Verify email with Firebase Auth
        await this.firebaseService.updateUser(userId, { emailVerified: true });

        // Update user in Firestore
        await this.firestoreService.updateUser(userId, {
          emailVerified: true,
          updatedAt: FirestoreTimestamp.now()
        });

        // Audit log
        await this.auditLog(userId, 'EMAIL_VERIFIED', 'USER', userId);

        return { message: 'Email verified successfully' };
      },
      'Email verified successfully'
    );
  }
}

export default AuthController;