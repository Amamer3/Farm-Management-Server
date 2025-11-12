import { Request, Response } from 'express';
import { BaseController } from './baseController';
import { UserRole } from '../models/types';
import { createSuccessResponse, createErrorResponse } from '../utils/responseHelper';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export class DataBackupController extends BaseController {
  // Create full farm data backup
  async createBackup(req: Request, res: Response): Promise<void> {
    await this.handleRequest(
      req,
      res, 
      async () => {
        const { userId } = this.validateUser(req);
        const { farmId, includeArchived = false } = req.body;

        const user = await this.validateUserExists(userId);
        const targetFarmId = await this.validateFarmAccess(user, farmId);

        // Only super admins can create backups
        if (user.role !== UserRole.ADMIN) {
          throw new Error('Only super administrators can create data backups');
        }

        const backupId = uuidv4();
        const timestamp = new Date().toISOString();
        
        // Create backup directory
        const backupDir = path.join(process.cwd(), 'backups', backupId);
        if (!fs.existsSync(backupDir)) {
          fs.mkdirSync(backupDir, { recursive: true });
        }

        // Collect all farm data
        const [users, birds, collections, feedInventory, medicineInventory, feedConsumption, medicineUsage] = await Promise.all([
          (this.firestoreService as any).getUsersByFarm ? (this.firestoreService as any).getUsersByFarm(targetFarmId) : [],
          this.firestoreService.getBirds({ farmId: targetFarmId }),
          this.firestoreService.getEggCollections({ farmId: targetFarmId }),
          (this.firestoreService as any).getFeedInventory ? (this.firestoreService as any).getFeedInventory(targetFarmId) : [],
          (this.firestoreService as any).getMedicineInventory ? (this.firestoreService as any).getMedicineInventory(targetFarmId) : [],
          (this.firestoreService as any).getFeedConsumption ? (this.firestoreService as any).getFeedConsumption(targetFarmId) : [],
          (this.firestoreService as any).getMedicineUsage ? (this.firestoreService as any).getMedicineUsage(targetFarmId) : []
        ]);

        // Create backup metadata
        const backupMetadata = {
          backupId,
          farmId: targetFarmId,
          createdAt: timestamp,
          createdBy: userId,
          version: '1.0.0',
          dataTypes: {
            users: users.length,
            birds: birds.length,
            collections: collections.length,
            feedInventory: feedInventory.length,
            medicineInventory: medicineInventory.length,
            feedConsumption: feedConsumption.length,
            medicineUsage: medicineUsage.length
          },
          includeArchived
        };

        // Save backup data
        const backupData = {
          metadata: backupMetadata,
          data: {
            users,
            birds,
            collections,
            feedInventory,
            medicineInventory,
            feedConsumption,
            medicineUsage
          }
        };

        const backupFilePath = path.join(backupDir, 'backup.json');
        fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2));

        // Create backup archive
        const archivePath = path.join(process.cwd(), 'backups', `${backupId}.tar.gz`);
        // Note: In a real implementation, you would use a library like tar to create the archive
        
        // Audit log
        await this.auditLog(userId, 'BACKUP_CREATED', 'BACKUP', backupId, {
          farmId: targetFarmId,
          dataTypes: backupMetadata.dataTypes
        });

        return {
          backupId,
          backupPath: backupFilePath,
          archivePath,
          metadata: backupMetadata,
          downloadUrl: `/api/backup/download/${backupId}`
        };
      },
      'Backup created successfully'
    );
  }

  // Restore farm data from backup
  async restoreBackup(req: Request, res: Response): Promise<void> {
    await this.handleRequest(
      req,
      res,
      async () => {
        const { userId } = this.validateUser(req);
        const { backupId, farmId, restoreOptions = {} } = req.body;

        const user = await this.validateUserExists(userId);
        const targetFarmId = await this.validateFarmAccess(user, farmId);

        // Only super admins can restore backups
        if (user.role !== UserRole.ADMIN) {
          throw new Error('Only super administrators can restore data backups');
        }

        // Load backup data
        const backupFilePath = path.join(process.cwd(), 'backups', backupId, 'backup.json');
        
        if (!fs.existsSync(backupFilePath)) {
          throw new Error('Backup file not found');
        }

        const backupData = JSON.parse(fs.readFileSync(backupFilePath, 'utf8'));
        
        // Validate backup metadata
        if (backupData.metadata.version !== '1.0.0') {
          throw new Error('Unsupported backup version');
        }

        const { data } = backupData;
        const restoreResults = {
          users: 0,
          birds: 0,
          collections: 0,
          feedInventory: 0,
          medicineInventory: 0,
          feedConsumption: 0,
          medicineUsage: 0,
          errors: [] as string[]
        };

        try {
          // Restore users
          if (restoreOptions.includeUsers !== false) {
            for (const userData of data.users) {
              try {
                await this.firestoreService.createUser(userData);
                restoreResults.users++;
              } catch (error) {
                restoreResults.errors.push(`User ${userData.email}: ${(error as Error).message}`);
              }
            }
          }

          // Restore birds
          if (restoreOptions.includeBirds !== false) {
            for (const birdData of data.birds) {
              try {
                await this.firestoreService.createBird(birdData);
                restoreResults.birds++;
              } catch (error) {
                restoreResults.errors.push(`Bird ${birdData.penId}: ${(error as Error).message}`);
              }
            }
          }

          // Restore collections
          if (restoreOptions.includeCollections !== false) {
            for (const collectionData of data.collections) {
              try {
                await this.firestoreService.createEggCollection(collectionData);
                restoreResults.collections++;
              } catch (error) {
                restoreResults.errors.push(`Collection ${collectionData.id}: ${(error as Error).message}`);
              }
            }
          }

          // Restore feed inventory
          if (restoreOptions.includeFeedInventory !== false) {
            for (const feedData of data.feedInventory) {
              try {
                if ((this.firestoreService as any).createFeedInventory) {
                  await (this.firestoreService as any).createFeedInventory(feedData);
                }
                restoreResults.feedInventory++;
              } catch (error) {
                restoreResults.errors.push(`Feed ${feedData.feedType}: ${(error as Error).message}`);
              }
            }
          }

          // Restore medicine inventory
          if (restoreOptions.includeMedicineInventory !== false) {
            for (const medicineData of data.medicineInventory) {
              try {
                if ((this.firestoreService as any).createMedicineInventory) {
                  await (this.firestoreService as any).createMedicineInventory(medicineData);
                }
                restoreResults.medicineInventory++;
              } catch (error) {
                restoreResults.errors.push(`Medicine ${medicineData.medicineName}: ${(error as Error).message}`);
              }
            }
          }

          // Restore feed consumption
          if (restoreOptions.includeFeedConsumption !== false) {
            for (const consumptionData of data.feedConsumption) {
              try {
                if ((this.firestoreService as any).createFeedConsumption) {
                  await (this.firestoreService as any).createFeedConsumption(consumptionData);
                }
                restoreResults.feedConsumption++;
              } catch (error) {
                restoreResults.errors.push(`Feed consumption ${consumptionData.id}: ${(error as Error).message}`);
              }
            }
          }

          // Restore medicine usage
          if (restoreOptions.includeMedicineUsage !== false) {
            for (const usageData of data.medicineUsage) {
              try {
                if ((this.firestoreService as any).createMedicineUsage) {
                  await (this.firestoreService as any).createMedicineUsage(usageData);
                }
                restoreResults.medicineUsage++;
              } catch (error) {
                restoreResults.errors.push(`Medicine usage ${usageData.id}: ${(error as Error).message}`);
              }
            }
          }

        } catch (error) {
          throw new Error(`Restore failed: ${(error as Error).message}`);
        }

        // Audit log
        await this.auditLog(userId, 'BACKUP_RESTORED', 'BACKUP', backupId, {
          farmId: targetFarmId,
          restoreResults
        });

        return {
          backupId,
          farmId: targetFarmId,
          restoreResults,
          success: restoreResults.errors.length === 0
        };
      },
      'Backup restored successfully'
    );
  }

  // List available backups
  async listBackups(req: Request, res: Response): Promise<void> {
    await this.handleRequest(
      req,
      res,
      async () => {
        const { userId } = this.validateUser(req);
        const { farmId } = req.query;

        const user = await this.validateUserExists(userId);
        const targetFarmId = await this.validateFarmAccess(user, farmId as string);

        // Only super admins can list backups
        if (user.role !== UserRole.ADMIN) {
          throw new Error('Only super administrators can list backups');
        }

        const backupsDir = path.join(process.cwd(), 'backups');
        
        if (!fs.existsSync(backupsDir)) {
          return [];
        }

        const backupDirs = fs.readdirSync(backupsDir, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory())
          .map(dirent => dirent.name);

        const backups = [];

        for (const backupId of backupDirs) {
          const backupFilePath = path.join(backupsDir, backupId, 'backup.json');
          
          if (fs.existsSync(backupFilePath)) {
            try {
              const backupData = JSON.parse(fs.readFileSync(backupFilePath, 'utf8'));
              
              // Filter by farm if specified
              if (!farmId || backupData.metadata.farmId === targetFarmId) {
                backups.push({
                  backupId,
                  farmId: backupData.metadata.farmId,
                  createdAt: backupData.metadata.createdAt,
                  createdBy: backupData.metadata.createdBy,
                  dataTypes: backupData.metadata.dataTypes,
                  size: this.getBackupSize(backupFilePath)
                });
              }
            } catch (error) {
              console.error(`Error reading backup ${backupId}:`, error);
            }
          }
        }

        // Sort by creation date (newest first)
        backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        return backups;
      },
      'Backups listed successfully'
    );
  }

  // Download backup
  async downloadBackup(req: Request, res: Response): Promise<void> {
    await this.handleRequest(
      req,
      res,
      async () => {
        const { userId } = this.validateUser(req);
        const { backupId } = req.params;

        const user = await this.validateUserExists(userId);

        // Only super admins can download backups
        if (user.role !== UserRole.ADMIN) {
          throw new Error('Only super administrators can download backups');
        }

        const backupFilePath = path.join(process.cwd(), 'backups', backupId, 'backup.json');
        
        if (!fs.existsSync(backupFilePath)) {
          throw new Error('Backup file not found');
        }

        // Set response headers for file download
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="backup-${backupId}.json"`);

        // Stream the file
        const fileStream = fs.createReadStream(backupFilePath);
        fileStream.pipe(res);

        // Audit log
        await this.auditLog(userId, 'BACKUP_DOWNLOADED', 'BACKUP', backupId);

        return null; // File is streamed directly
      },
      'Backup downloaded successfully'
    );
  }

  // Delete backup
  async deleteBackup(req: Request, res: Response): Promise<void> {
    await this.handleRequest(
      req,
      res,
      async () => {
        const { userId } = this.validateUser(req);
        const { backupId } = req.params;

        const user = await this.validateUserExists(userId);

        // Only super admins can delete backups
        if (user.role !== UserRole.ADMIN) {
          throw new Error('Only super administrators can delete backups');
        }

        const backupDir = path.join(process.cwd(), 'backups', backupId);
        
        if (!fs.existsSync(backupDir)) {
          throw new Error('Backup not found');
        }

        // Remove backup directory
        fs.rmSync(backupDir, { recursive: true, force: true });

        // Audit log
        await this.auditLog(userId, 'BACKUP_DELETED', 'BACKUP', backupId);

        return { backupId, deleted: true };
      },
      'Backup deleted successfully'
    );
  }

  // Private helper methods
  private getBackupSize(filePath: string): number {
    try {
      const stats = fs.statSync(filePath);
      return stats.size;
    } catch (error) {
      return 0;
    }
  }
}

export default DataBackupController;
