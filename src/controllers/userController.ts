import { Request, Response } from 'express';
import authService from '../services/betterAuthService';
import FirestoreService from '../services/firestoreService';
import { ApiResponse, User, UserRole, CreateUserRequest, UpdateUserRequest, PaginatedResponse } from '../models/types';
import { createSuccessResponse, createErrorResponse } from '../utils/responseHelper';
import { Timestamp as FirestoreTimestamp } from 'firebase-admin/firestore';

const firestoreService = FirestoreService;

// Helper function to normalize role values for backward compatibility
const normalizeRole = (role: string): UserRole => {
  if (!role) return UserRole.WORKER; // Default to worker if no role
  
  const roleLower = role.toLowerCase().trim();
  const roleMap: Record<string, UserRole> = {
    'super_admin': UserRole.ADMIN,
    'farm_manager': UserRole.MANAGER,
    'farm_worker': UserRole.WORKER,
    'admin': UserRole.ADMIN,
    'manager': UserRole.MANAGER,
    'worker': UserRole.WORKER,
  };
  return roleMap[roleLower] || role as UserRole;
};

export class UserController {
  // Get all users with pagination and filtering
  async getUsers(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { page = 1, limit = 10, farmId, role, status, search } = req.query;
      
      if (!userId) {
        const response = createErrorResponse('User not authenticated');
        res.status(401).json(response);
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      if (!currentUser) {
        const response = createErrorResponse('User not found');
        res.status(404).json(response);
        return;
      }

      // Normalize role for backward compatibility
      const normalizedRole = normalizeRole(currentUser.role);

      // Only managers and admins can view users
      if (normalizedRole !== UserRole.MANAGER && normalizedRole !== UserRole.ADMIN) {
        const response = createErrorResponse('Insufficient permissions to view users');
        res.status(403).json(response);
        return;
      }

      const filters: any = {
        page: parseInt(page as string),
        limit: parseInt(limit as string)
      };
      
      // Role filter - normalize to handle both old and new role names
      if (role) {
        const roleStr = (role as string).toLowerCase();
        if (roleStr === 'admin') {
          filters.role = 'admin';
        } else if (roleStr === 'manager') {
          filters.role = 'manager';
        } else if (roleStr === 'worker') {
          filters.role = 'worker';
        } else {
          filters.role = role as string;
        }
      }

      // Status filter - convert "active"/"inactive" to boolean
      if (status) {
        if (status === 'active') {
          filters.isActive = true;
        } else if (status === 'inactive') {
          filters.isActive = false;
        }
      } else if (status === '') {
        // Empty string means no filter
      }

      // Search filter
      if (search) {
        filters.search = search as string;
      }

      const users = await firestoreService.getUsers(filters);

      const response = createSuccessResponse('Users retrieved successfully', users);

      res.status(200).json(response);
    } catch (error: any) {
      console.error('Get users error:', error);
      const response = createErrorResponse('Failed to get users', error.message);
      res.status(500).json(response);
    }
  }

  // Get user by ID
  async getUserById(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { id } = req.params;
      
      if (!userId) {
        const response = createErrorResponse('User not authenticated');
        res.status(401).json(response);
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      const targetUser = await firestoreService.getUserById(id);
      
      if (!currentUser || !targetUser) {
        const response = createErrorResponse('User not found');
        res.status(404).json(response);
        return;
      }

      // Users can view their own profile, managers can view users in their farm, admins can view anyone
      const canView = userId === id || 
                     currentUser.role === UserRole.ADMIN ||
                     currentUser.role === UserRole.MANAGER;

      if (!canView) {
        const response = createErrorResponse('Access denied to view this user');
        res.status(403).json(response);
        return;
      }

      const response = createSuccessResponse('User retrieved successfully', targetUser);

      res.status(200).json(response);
    } catch (error: any) {
      console.error('Get user by ID error:', error);
      const response = createErrorResponse('Failed to get user', error.message);
      res.status(500).json(response);
    }
  }

  // Create new user (admin only)
  async createUser(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const userData: CreateUserRequest = req.body;
      
      if (!userId) {
        const response = createErrorResponse('User not authenticated');
        res.status(401).json(response);
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      if (!currentUser) {
        const response = createErrorResponse('User not found');
        res.status(404).json(response);
        return;
      }

      // Normalize role for backward compatibility
      const normalizedRole = normalizeRole(currentUser.role);

      // Only managers and admins can create users
      if (normalizedRole !== UserRole.MANAGER && normalizedRole !== UserRole.ADMIN) {
        const response = createErrorResponse('Insufficient permissions to create users');
        res.status(403).json(response);
        return;
      }

      // Managers cannot create other managers or admins
      if (normalizedRole === UserRole.MANAGER) {
        if (userData.role === UserRole.MANAGER || userData.role === UserRole.ADMIN) {
          const response = createErrorResponse('Cannot create users with manager or admin roles');
          res.status(403).json(response);
          return;
        }
      }

      // Create user in Firebase Auth
      const firebaseUser = await authService.createUser({
        email: userData.email,
        password: userData.password,
        displayName: userData.name
      });

      // Create user document in Firestore
      const now = FirestoreTimestamp.now();
      
      // Determine farmId based on current user's role
      let farmId: string;
      if (normalizedRole === UserRole.ADMIN) {
        // Admin can specify farmId in request body or use their own
        farmId = (userData as any).farmId || currentUser.farmId;
      } else {
        // Managers create users for their own farm
        farmId = currentUser.farmId;
      }
      
      const newUserData: Omit<User, 'id'> = {
        email: userData.email,
        name: userData.name,
        phone: userData.phone,
        role: userData.role || UserRole.WORKER,
        farmId,
        isActive: true,
        createdAt: now,
        updatedAt: now
      };

      const newUserId = await firestoreService.createUser(newUserData, firebaseUser.id);

      const response = createSuccessResponse('User created successfully', {
        id: newUserId,
        email: userData.email
      });

      res.status(201).json(response);
    } catch (error: any) {
      console.error('Create user error:', error);
      
      // Preserve detailed error messages from Firebase service (especially permission errors)
      let errorMessage = error.message || 'Failed to create user';
      
      // Only override for specific Firebase auth errors, but preserve permission error details
      if (error.code === 'auth/email-already-exists') {
        errorMessage = 'A user with this email already exists';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address format';
      } else if (error.code === 'auth/invalid-password') {
        errorMessage = 'Password must be at least 6 characters long';
      } else if (error.message && (error.message.includes('PERMISSION_DENIED') || error.message.includes('serviceusage'))) {
        // Keep the detailed error message from firebaseService which includes the console link
        // Don't override it with a shorter message
        errorMessage = error.message;
      }
      
      const response = createErrorResponse('Failed to create user', errorMessage);
      res.status(500).json(response);
    }
  }

  // Update user
  async updateUser(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { id } = req.params;
      const updateData: UpdateUserRequest = req.body;
      
      if (!userId) {
        const response = createErrorResponse('User not authenticated');
        res.status(401).json(response);
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      const targetUser = await firestoreService.getUserById(id);
      
      if (!currentUser || !targetUser) {
        const response = createErrorResponse('User not found');
        res.status(404).json(response);
        return;
      }

      // Normalize role for backward compatibility
      const normalizedRole = normalizeRole(currentUser.role);

      // Check permissions
      const canUpdate = userId === id || 
                     normalizedRole === UserRole.ADMIN ||
                     normalizedRole === UserRole.MANAGER;

      if (!canUpdate) {
        const response = createErrorResponse('Access denied to update this user');
        res.status(403).json(response);
        return;
      }

      // Users can only update their own basic info (not role, status, or farm)
      if (userId === id) {
        const allowedFields = ['name', 'email', 'phone'];
        const hasRestrictedFields = Object.keys(updateData).some(key => 
          !allowedFields.includes(key) && key !== 'status' && key !== 'isActive'
        );
        
        if (hasRestrictedFields) {
          const response = createErrorResponse('Can only update name, email, and phone for your own profile');
          res.status(403).json(response);
          return;
        }
      }

      // Managers cannot change roles to manager or admin
      if (normalizedRole === UserRole.MANAGER && updateData.role) {
        if (updateData.role === UserRole.MANAGER || updateData.role === UserRole.ADMIN) {
          const response = createErrorResponse('Cannot assign manager or admin roles');
          res.status(403).json(response);
          return;
        }
      }

      // Prepare update data
      const updateFields: any = {
        updatedAt: FirestoreTimestamp.now()
      };

      // Handle status field - convert to isActive
      if (updateData.status !== undefined) {
        updateFields.isActive = updateData.status === 'active';
      } else if (updateData.isActive !== undefined) {
        updateFields.isActive = updateData.isActive;
      }

      // Handle other fields
      if (updateData.name !== undefined) updateFields.name = updateData.name;
      if (updateData.email !== undefined) updateFields.email = updateData.email;
      if (updateData.phone !== undefined) updateFields.phone = updateData.phone;
      if (updateData.role !== undefined) updateFields.role = updateData.role;

      // Handle password update (admins only)
      const authUpdates: any = {};
      if (updateData.password && (normalizedRole === UserRole.ADMIN || normalizedRole === UserRole.MANAGER)) {
        if (updateData.password.length < 8) {
          const response = createErrorResponse('Password must be at least 8 characters long');
          res.status(400).json(response);
          return;
        }
        authUpdates.password = updateData.password;
      } else if (updateData.password) {
        const response = createErrorResponse('Only admins and managers can set passwords for users');
        res.status(403).json(response);
        return;
      }

      // Update Firebase Auth if email, name, or password changed (graceful - won't fail if permissions missing)
      if (updateData.email) authUpdates.email = updateData.email;
      if (updateData.name) authUpdates.displayName = updateData.name;
      
      if (Object.keys(authUpdates).length > 0) {
        await authService.updateUserGraceful(id, authUpdates);
      }

      // Update user in Firestore
      const updatedUser = await firestoreService.updateUser(id, updateFields);

      const response = createSuccessResponse('User updated successfully', updatedUser);
      res.status(200).json(response);
    } catch (error: any) {
      console.error('Update user error:', error);
      const response = createErrorResponse(error.message || 'Failed to update user');
      res.status(500).json(response);
    }
  }

  // Deactivate user
  async deactivateUser(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { id } = req.params;
      
      if (!userId) {
        const response = createErrorResponse('User not authenticated');
        res.status(401).json(response);
        return;
      }

      if (userId === id) {
        const response = createErrorResponse('Cannot deactivate your own account');
        res.status(400).json(response);
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      const targetUser = await firestoreService.getUserById(id);
      
      if (!currentUser || !targetUser) {
        const response = createErrorResponse('User not found');
        res.status(404).json(response);
        return;
      }

      // Normalize role for backward compatibility
      const normalizedRole = normalizeRole(currentUser.role);

      // Only managers and admins can deactivate users
      if (normalizedRole !== UserRole.MANAGER && normalizedRole !== UserRole.ADMIN) {
        const response = createErrorResponse('Insufficient permissions to deactivate users');
        res.status(403).json(response);
        return;
      }

      // Update user status
      await firestoreService.updateUser(id, {
        isActive: false,
        updatedAt: FirestoreTimestamp.now()
      });

      // Disable user in Firebase Auth
      // Note: Better Auth doesn't have a disabled field, we'll handle this via isActive in Firestore
      // await authService.updateUser(id, { disabled: true });

      const response = createSuccessResponse('User deactivated successfully');

      res.status(200).json(response);
    } catch (error: any) {
      console.error('Deactivate user error:', error);
      const response = createErrorResponse(error.message || 'Failed to deactivate user');
      res.status(500).json(response);
    }
  }

  // Reactivate user
  async reactivateUser(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { id } = req.params;
      
      if (!userId) {
        const response = createErrorResponse('User not authenticated');
        res.status(401).json(response);
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      const targetUser = await firestoreService.getUserById(id);
      
      if (!currentUser || !targetUser) {
        const response = createErrorResponse('User not found');
        res.status(404).json(response);
        return;
      }

      // Normalize role for backward compatibility
      const normalizedRole = normalizeRole(currentUser.role);

      // Only managers and admins can reactivate users
      if (normalizedRole !== UserRole.MANAGER && normalizedRole !== UserRole.ADMIN) {
        const response = createErrorResponse('Insufficient permissions to reactivate users');
        res.status(403).json(response);
        return;
      }

      // Update user status
      await firestoreService.updateUser(id, {
        isActive: true,
        updatedAt: FirestoreTimestamp.now()
      });

      // Enable user in Firebase Auth
      // Note: Better Auth doesn't have a disabled field, we'll handle this via isActive in Firestore
      // await authService.updateUser(id, { disabled: false });

      const response = createSuccessResponse('User reactivated successfully');

      res.status(200).json(response);
    } catch (error: any) {
      console.error('Reactivate user error:', error);
      const response = createErrorResponse(error.message || 'Failed to reactivate user');
      res.status(500).json(response);
    }
  }

  // Bulk import users (placeholder)
  async bulkImportUsers(req: Request, res: Response): Promise<void> {
    res.status(501).json(createErrorResponse('Bulk import not implemented yet'));
  }

  // Get user audit logs (placeholder)
  async getUserAuditLogs(req: Request, res: Response): Promise<void> {
    res.status(501).json(createErrorResponse('Audit logs not implemented yet'));
  }

  // Delete user (placeholder)
  async deleteUser(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { id } = req.params;
      
      if (!userId) {
        const response = createErrorResponse('User not authenticated');
        res.status(401).json(response);
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      if (!currentUser) {
        const response = createErrorResponse('User not found');
        res.status(404).json(response);
        return;
      }

      // Normalize role for backward compatibility
      const normalizedRole = normalizeRole(currentUser.role);

      // Only admins can delete users
      if (normalizedRole !== UserRole.ADMIN) {
        const response = createErrorResponse('Only admins can delete users');
        res.status(403).json(response);
        return;
      }

      // Prevent self-deletion
      if (userId === id) {
        const response = createErrorResponse('Cannot delete your own account');
        res.status(400).json(response);
        return;
      }

      // Check if target user exists
      const targetUser = await firestoreService.getUserById(id);
      if (!targetUser) {
        const response = createErrorResponse('User to delete not found');
        res.status(404).json(response);
        return;
      }

      // Delete user from Firestore
      await firestoreService.deleteUser(id);

      // Delete user from Firebase Auth
      try {
        await authService.deleteUser(id);
      } catch (error: any) {
        console.error('Error deleting user from Firebase Auth:', error);
        // Continue even if Firebase Auth deletion fails
      }

      const response = createSuccessResponse('User deleted successfully');
      res.status(200).json(response);
    } catch (error: any) {
      console.error('Delete user error:', error);
      const response = createErrorResponse('Failed to delete user', error.message);
      res.status(500).json(response);
    }
  }

  // Update user role
  async updateUserRole(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { id } = req.params;
      const { role } = req.body;
      
      if (!userId) {
        const response = createErrorResponse('User not authenticated');
        res.status(401).json(response);
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      if (!currentUser) {
        const response = createErrorResponse('User not found');
        res.status(404).json(response);
        return;
      }

      // Normalize role for backward compatibility
      const normalizedRole = normalizeRole(currentUser.role);

      if (normalizedRole !== UserRole.ADMIN) {
        const response = createErrorResponse('Only admins can update user roles');
        res.status(403).json(response);
        return;
      }

      await firestoreService.updateUser(id, {
        role,
        updatedAt: FirestoreTimestamp.now()
      });

      const response = createSuccessResponse('User role updated successfully');
      res.status(200).json(response);
    } catch (error: any) {
      console.error('Update user role error:', error);
      const response = createErrorResponse('Failed to update user role', error.message);
      res.status(500).json(response);
    }
  }

  // Get current user profile
  async getCurrentUserProfile(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      
      if (!userId) {
        const response = createErrorResponse('User not authenticated');
        res.status(401).json(response);
        return;
      }

      const user = await firestoreService.getUserById(userId);
      if (!user) {
        const response = createErrorResponse('User not found');
        res.status(404).json(response);
        return;
      }

      const response = createSuccessResponse('Profile retrieved successfully', user);
      res.status(200).json(response);
    } catch (error: any) {
      console.error('Get current user profile error:', error);
      const response = createErrorResponse('Failed to get profile', error.message);
      res.status(500).json(response);
    }
  }

  // Get user statistics
  async getUserStats(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      
      if (!userId) {
        const response = createErrorResponse('User not authenticated');
        res.status(401).json(response);
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      if (!currentUser) {
        const response = createErrorResponse('User not found');
        res.status(404).json(response);
        return;
      }

      // Normalize role for backward compatibility
      const normalizedRole = normalizeRole(currentUser.role);

      // Only managers and admins can view user statistics
      if (normalizedRole !== UserRole.MANAGER && normalizedRole !== UserRole.ADMIN) {
        const response = createErrorResponse('Insufficient permissions to view user statistics');
        res.status(403).json(response);
        return;
      }

      // Get all users to calculate statistics
      const allUsers = await firestoreService.getUsers({ limit: 10000 });
      const users = allUsers.data || [];

      const stats = {
        total: users.length,
        byRole: {
          admin: users.filter((u: any) => {
            const role = u.role?.toLowerCase() || '';
            return role === 'admin' || role === 'super_admin';
          }).length,
          manager: users.filter((u: any) => {
            const role = u.role?.toLowerCase() || '';
            return role === 'manager' || role === 'farm_manager';
          }).length,
          worker: users.filter((u: any) => {
            const role = u.role?.toLowerCase() || '';
            return role === 'worker' || role === 'farm_worker';
          }).length,
        },
        active: users.filter((u: any) => u.isActive !== false).length,
        inactive: users.filter((u: any) => u.isActive === false).length,
        byFarm: {} as Record<string, number>
      };

      // Count users by farm
      users.forEach((u: any) => {
        const farmId = u.farmId || 'unknown';
        stats.byFarm[farmId] = (stats.byFarm[farmId] || 0) + 1;
      });

      const response = createSuccessResponse('User statistics retrieved successfully', stats);
      res.status(200).json(response);
    } catch (error: any) {
      console.error('Get user stats error:', error);
      const response = createErrorResponse('Failed to get user statistics', error.message);
      res.status(500).json(response);
    }
  }

  // Update current user profile
  async updateCurrentUserProfile(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const updateData = req.body;
      
      if (!userId) {
        const response = createErrorResponse('User not authenticated');
        res.status(401).json(response);
        return;
      }

      // Users can only update their own basic info
      const allowedFields = ['name', 'email'];
      const hasRestrictedFields = Object.keys(updateData).some(key => !allowedFields.includes(key));
      
      if (hasRestrictedFields) {
        const response = createErrorResponse('Can only update name and email');
        res.status(403).json(response);
        return;
      }

      const updatedUser = await firestoreService.updateUser(userId, {
        ...updateData,
        updatedAt: FirestoreTimestamp.now()
      });

      // Update Firebase Auth profile if name or email changed (graceful - won't fail if permissions missing)
      const authUpdates: any = {};
      if (updateData.name) authUpdates.displayName = updateData.name;
      if (updateData.email) authUpdates.email = updateData.email;
      
      if (Object.keys(authUpdates).length > 0) {
        await authService.updateUserGraceful(userId, authUpdates);
      }

      const response = createSuccessResponse('Profile updated successfully', updatedUser);
      res.status(200).json(response);
    } catch (error: any) {
      console.error('Update current user profile error:', error);
      const response = createErrorResponse('Failed to update profile', error.message);
      res.status(500).json(response);
    }
  }
}

export default UserController;