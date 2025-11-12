import { Request, Response } from 'express';
import { createSuccessResponse, createErrorResponse } from '../utils/responseHelper';
import { UserRole } from '../models/types';
import FirestoreService from '../services/firestoreService';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const firestoreService = FirestoreService;

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images and documents
    const allowedMimes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

export class UploadController {
  // Upload image files
  async uploadImage(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      if (!currentUser) {
        res.status(404).json(createErrorResponse('User not found'));
        return;
      }

      // Use multer middleware
      return new Promise<void>((resolve, reject) => {
        upload.single('image')(req, res, (err: any) => {
          if (err) {
            res.status(400).json(createErrorResponse(err.message || 'File upload failed'));
            return resolve();
          }

          if (!req.file) {
            res.status(400).json(createErrorResponse('No file uploaded'));
            return resolve();
          }

          // Validate file type for images
          const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
          if (!allowedImageTypes.includes(req.file.mimetype)) {
            // Delete the uploaded file
            fs.unlinkSync(req.file.path);
            res.status(400).json(createErrorResponse('Invalid image file type'));
            return resolve();
          }

          const fileInfo = {
            id: req.file.filename,
            originalName: req.file.originalname,
            filename: req.file.filename,
            path: req.file.path,
            size: req.file.size,
            mimetype: req.file.mimetype,
            uploadedBy: userId,
            uploadedAt: new Date(),
            type: 'image'
          };

          res.status(200).json(createSuccessResponse('Image uploaded successfully', fileInfo));
          resolve();
        });
      });
    } catch (error: any) {
      console.error('Upload image error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to upload image'));
    }
  }

  // Upload document files
  async uploadDocument(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      if (!currentUser) {
        res.status(404).json(createErrorResponse('User not found'));
        return;
      }

      // Use multer middleware
      return new Promise<void>((resolve, reject) => {
        upload.single('document')(req, res, (err: any) => {
          if (err) {
            res.status(400).json(createErrorResponse(err.message || 'File upload failed'));
            return resolve();
          }

          if (!req.file) {
            res.status(400).json(createErrorResponse('No file uploaded'));
            return resolve();
          }

          // Validate file type for documents
          const allowedDocTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          ];
          
          if (!allowedDocTypes.includes(req.file.mimetype)) {
            // Delete the uploaded file
            fs.unlinkSync(req.file.path);
            res.status(400).json(createErrorResponse('Invalid document file type'));
            return resolve();
          }

          const fileInfo = {
            id: req.file.filename,
            originalName: req.file.originalname,
            filename: req.file.filename,
            path: req.file.path,
            size: req.file.size,
            mimetype: req.file.mimetype,
            uploadedBy: userId,
            uploadedAt: new Date(),
            type: 'document'
          };

          res.status(200).json(createSuccessResponse('Document uploaded successfully', fileInfo));
          resolve();
        });
      });
    } catch (error: any) {
      console.error('Upload document error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to upload document'));
    }
  }

  // Delete uploaded file
  async deleteFile(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.uid;
      const { fileId } = req.params;
      
      if (!userId) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      const currentUser = await firestoreService.getUserById(userId);
      if (!currentUser) {
        res.status(404).json(createErrorResponse('User not found'));
        return;
      }

      // Only managers and admins can delete files
      if (currentUser.role !== UserRole.MANAGER && currentUser.role !== UserRole.ADMIN) {
        res.status(403).json(createErrorResponse('Insufficient permissions to delete files'));
        return;
      }

      // Construct file path
      const filePath = path.join(process.cwd(), 'uploads', fileId);
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        res.status(404).json(createErrorResponse('File not found'));
        return;
      }

      // Delete the file
      fs.unlinkSync(filePath);

      res.status(200).json(createSuccessResponse('File deleted successfully', { fileId }));
    } catch (error: any) {
      console.error('Delete file error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to delete file'));
    }
  }
}

export default UploadController;