import { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import * as createCsvWriter from 'csv-writer';
import fs from 'fs';
import path from 'path';
import { BaseController } from './baseController';
import { EggCollection, Bird, FeedInventory, MedicineRecord, UserRole } from '../models/types';
import { createSuccessResponse, createErrorResponse } from '../utils/responseHelper';

export class DataExportController extends BaseController {
  // Export egg collections to PDF
  async exportCollectionsToPDF(req: Request, res: Response): Promise<void> {
    await this.handleRequest(
      req,
      res, 
      async () => {
        const { userId } = this.validateUser(req);
        const { farmId, startDate, endDate, format = 'pdf' } = req.body;

        const user = await this.validateUserExists(userId);
        const targetFarmId = await this.validateFarmAccess(user, farmId);

        // Get collections data
        const collections = await this.firestoreService.getEggCollections({
          farmId: targetFarmId,
          startDate,
          endDate
        });

        if (collections.length === 0) {
          throw new Error('No collections found for the specified date range');
        }

        // Generate PDF
        const pdfBuffer = await this.generateCollectionsPDF(collections, {
          farmId: targetFarmId,
          startDate,
          endDate,
          generatedBy: user.name,
          generatedAt: new Date().toISOString()
        });

        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="egg-collections-${Date.now()}.pdf"`);
        res.setHeader('Content-Length', pdfBuffer.length);

        return pdfBuffer;
      },
      'Collections exported to PDF successfully'
    );
  }

  // Export egg collections to CSV
  async exportCollectionsToCSV(req: Request, res: Response): Promise<void> {
    await this.handleRequest(
      req,
      res,
      async () => {
        const { userId } = this.validateUser(req);
        const { farmId, startDate, endDate } = req.body;

        const user = await this.validateUserExists(userId);
        const targetFarmId = await this.validateFarmAccess(user, farmId);

        // Get collections data
        const collections = await this.firestoreService.getEggCollections({
          farmId: targetFarmId,
          startDate,
          endDate
        });

        if (collections.length === 0) {
          throw new Error('No collections found for the specified date range');
        }

        // Generate CSV
        const csvContent = await this.generateCollectionsCSV(collections);

        // Set response headers
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="egg-collections-${Date.now()}.csv"`);

        return csvContent;
      },
      'Collections exported to CSV successfully'
    );
  }

  // Export birds data
  async exportBirdsData(req: Request, res: Response): Promise<void> {
    await this.handleRequest(
      req,
      res,
      async () => {
        const { userId } = this.validateUser(req);
        const { farmId, format = 'csv' } = req.body;

        const user = await this.validateUserExists(userId);
        const targetFarmId = await this.validateFarmAccess(user, farmId);

        // Get birds data
        const birds = await this.firestoreService.getBirds({ farmId: targetFarmId });

        if (birds.length === 0) {
          throw new Error('No birds found for this farm');
        }

        if (format === 'pdf') {
          const pdfBuffer = await this.generateBirdsPDF(birds, {
            farmId: targetFarmId,
            generatedBy: user.name,
            generatedAt: new Date().toISOString()
          });

          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="birds-data-${Date.now()}.pdf"`);
          res.setHeader('Content-Length', pdfBuffer.length);

          return pdfBuffer;
        } else {
          const csvContent = await this.generateBirdsCSV(birds);

          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', `attachment; filename="birds-data-${Date.now()}.csv"`);

          return csvContent;
        }
      },
      'Birds data exported successfully'
    );
  }

  // Export feed inventory
  async exportFeedInventory(req: Request, res: Response): Promise<void> {
    await this.handleRequest(
      req,
      res,
      async () => {
        const { userId } = this.validateUser(req);
        const { farmId, format = 'csv' } = req.body;

        const user = await this.validateUserExists(userId);
        const targetFarmId = await this.validateFarmAccess(user, farmId);

        // Get feed inventory data
        const feedInventory = (this.firestoreService as any).getFeedInventory ? await (this.firestoreService as any).getFeedInventory(targetFarmId) : [];

        if (feedInventory.length === 0) {
          throw new Error('No feed inventory found for this farm');
        }

        if (format === 'pdf') {
          const pdfBuffer = await this.generateFeedPDF(feedInventory, {
            farmId: targetFarmId,
            generatedBy: user.name,
            generatedAt: new Date().toISOString()
          });

          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="feed-inventory-${Date.now()}.pdf"`);
          res.setHeader('Content-Length', pdfBuffer.length);

          return pdfBuffer;
        } else {
          const csvContent = await this.generateFeedCSV(feedInventory);

          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', `attachment; filename="feed-inventory-${Date.now()}.csv"`);

          return csvContent;
        }
      },
      'Feed inventory exported successfully'
    );
  }

  // Export comprehensive farm report
  async exportFarmReport(req: Request, res: Response): Promise<void> {
    await this.handleRequest(
      req,
      res,
      async () => {
        const { userId } = this.validateUser(req);
        const { farmId, startDate, endDate, format = 'pdf' } = req.body;

        const user = await this.validateUserExists(userId);
        const targetFarmId = await this.validateFarmAccess(user, farmId);

        // Get all farm data
        const [collections, birds, feedInventory, medicineInventory] = await Promise.all([
          this.firestoreService.getEggCollections({
            farmId: targetFarmId,
            startDate,
            endDate
          }),
          this.firestoreService.getBirds({ farmId: targetFarmId }),
          (this.firestoreService as any).getFeedInventory ? (this.firestoreService as any).getFeedInventory(targetFarmId) : [],
          (this.firestoreService as any).getMedicineInventory ? (this.firestoreService as any).getMedicineInventory(targetFarmId) : []
        ]);

        // Generate comprehensive report
        const pdfBuffer = await this.generateFarmReportPDF({
          collections,
          birds,
          feedInventory,
          medicineInventory,
          metadata: {
            farmId: targetFarmId,
            startDate,
            endDate,
            generatedBy: user.name,
            generatedAt: new Date().toISOString()
          }
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="farm-report-${Date.now()}.pdf"`);
        res.setHeader('Content-Length', pdfBuffer.length);

        return pdfBuffer;
      },
      'Farm report exported successfully'
    );
  }

  // Private helper methods for PDF generation
  private async generateCollectionsPDF(collections: EggCollection[], metadata: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument();
        const buffers: Buffer[] = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));

        // Add header
        doc.fontSize(20).text('Egg Collections Report', 50, 50);
        doc.fontSize(12).text(`Farm ID: ${metadata.farmId}`, 50, 80);
        doc.text(`Period: ${metadata.startDate} to ${metadata.endDate}`, 50, 100);
        doc.text(`Generated by: ${metadata.generatedBy}`, 50, 120);
        doc.text(`Generated at: ${metadata.generatedAt}`, 50, 140);

        // Add summary
        const totalEggs = collections.reduce((sum, c) => sum + c.quantity, 0);
        doc.fontSize(14).text('Summary', 50, 180);
        doc.fontSize(12).text(`Total Collections: ${collections.length}`, 50, 210);
        doc.text(`Total Eggs: ${totalEggs}`, 50, 230);

        // Add collections table
        let y = 280;
        doc.fontSize(12).text('Collections Details', 50, y);
        y += 30;

        // Table headers
        doc.text('Date', 50, y);
        doc.text('Shift', 150, y);
        doc.text('Pen', 200, y);
        doc.text('Quantity', 250, y);
        doc.text('Grade', 320, y);
        doc.text('Collector', 380, y);
        y += 20;

        // Table data
        collections.forEach(collection => {
          if (y > 700) {
            (doc as any).addPage();
            y = 50;
          }
          
          doc.text(collection.date.split('T')[0], 50, y);
          doc.text(collection.shift, 150, y);
          doc.text(collection.pen, 200, y);
          doc.text(collection.quantity.toString(), 250, y);
          doc.text(collection.grade, 320, y);
          doc.text(collection.collector, 380, y);
          y += 20;
        });

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  private async generateCollectionsCSV(collections: EggCollection[]): Promise<string> {
    const csvWriter = createCsvWriter.createObjectCsvWriter({
      path: 'temp-collections.csv',
      header: [
        { id: 'date', title: 'Date' },
        { id: 'shift', title: 'Shift' },
        { id: 'pen', title: 'Pen' },
        { id: 'quantity', title: 'Quantity' },
        { id: 'grade', title: 'Grade' },
        { id: 'avgWeight', title: 'Average Weight' },
        { id: 'collector', title: 'Collector' },
        { id: 'notes', title: 'Notes' }
      ]
    });

    const csvData = collections.map(collection => ({
      date: collection.date.split('T')[0],
      shift: collection.shift,
      pen: collection.pen,
      quantity: collection.quantity,
      grade: collection.grade,
      avgWeight: collection.avgWeight,
      collector: collection.collector,
      notes: collection.notes || ''
    }));

    await csvWriter.writeRecords(csvData);
    
    const csvContent = fs.readFileSync('temp-collections.csv', 'utf8');
    fs.unlinkSync('temp-collections.csv');
    
    return csvContent;
  }

  private async generateBirdsPDF(birds: Bird[], metadata: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument();
        const buffers: Buffer[] = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));

        // Add header
        doc.fontSize(20).text('Birds Inventory Report', 50, 50);
        doc.fontSize(12).text(`Farm ID: ${metadata.farmId}`, 50, 80);
        doc.text(`Generated by: ${metadata.generatedBy}`, 50, 100);
        doc.text(`Generated at: ${metadata.generatedAt}`, 50, 120);

        // Add summary
        const totalBirds = birds.reduce((sum: number, b: Bird) => sum + b.quantity, 0);
        doc.fontSize(14).text('Summary', 50, 160);
        doc.fontSize(12).text(`Total Birds: ${totalBirds}`, 50, 190);

        // Add birds table
        let y = 240;
        doc.fontSize(12).text('Birds Details', 50, y);
        y += 30;

        // Table headers
        doc.text('Pen ID', 50, y);
        doc.text('Breed', 120, y);
        doc.text('Age', 200, y);
        doc.text('Quantity', 250, y);
        doc.text('Health Status', 320, y);
        y += 20;

        // Table data
        birds.forEach(bird => {
          if (y > 700) {
            (doc as any).addPage();
            y = 50;
          }
          
          doc.text(bird.penId, 50, y);
          doc.text(bird.breed, 120, y);
          doc.text(bird.age.toString(), 200, y);
          doc.text(bird.quantity.toString(), 250, y);
          doc.text(bird.healthStatus || 'Unknown', 320, y);
          y += 20;
        });

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  private async generateBirdsCSV(birds: Bird[]): Promise<string> {
    const csvWriter = createCsvWriter.createObjectCsvWriter({
      path: 'temp-birds.csv',
      header: [
        { id: 'penId', title: 'Pen ID' },
        { id: 'breed', title: 'Breed' },
        { id: 'age', title: 'Age (days)' },
        { id: 'quantity', title: 'Quantity' },
        { id: 'healthStatus', title: 'Health Status' },
        { id: 'lastCheckup', title: 'Last Checkup' },
        { id: 'notes', title: 'Notes' }
      ]
    });

      const csvData = birds.map((bird: Bird) => ({
      penId: bird.penId,
      breed: bird.breed,
      age: bird.age,
      quantity: bird.quantity,
      healthStatus: bird.healthStatus || 'Unknown',
      lastCheckup: bird.lastCheckup,
      notes: bird.notes || ''
    }));

    await csvWriter.writeRecords(csvData);
    
    const csvContent = fs.readFileSync('temp-birds.csv', 'utf8');
    fs.unlinkSync('temp-birds.csv');
    
    return csvContent;
  }

  private async generateFeedPDF(feedInventory: FeedInventory[], metadata: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument();
        const buffers: Buffer[] = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));

        // Add header
        doc.fontSize(20).text('Feed Inventory Report', 50, 50);
        doc.fontSize(12).text(`Farm ID: ${metadata.farmId}`, 50, 80);
        doc.text(`Generated by: ${metadata.generatedBy}`, 50, 100);
        doc.text(`Generated at: ${metadata.generatedAt}`, 50, 120);

        // Add summary
        const totalQuantity = feedInventory.reduce((sum, f) => sum + (f.stock || f.quantity || 0), 0);
        doc.fontSize(14).text('Summary', 50, 160);
        doc.fontSize(12).text(`Total Feed Items: ${feedInventory.length}`, 50, 190);
        doc.text(`Total Quantity: ${totalQuantity}`, 50, 210);

        // Add feed table
        let y = 260;
        doc.fontSize(12).text('Feed Inventory Details', 50, y);
        y += 30;

        // Table headers
        doc.text('Feed Type', 50, y);
        doc.text('Quantity', 150, y);
        doc.text('Unit', 220, y);
        doc.text('Supplier', 270, y);
        doc.text('Expiry Date', 350, y);
        y += 20;

        // Table data
        feedInventory.forEach(feed => {
          if (y > 700) {
            (doc as any).addPage();
            y = 50;
          }
          
          doc.text(feed.name || feed.feedType || 'N/A', 50, y);
          doc.text((feed.stock || feed.quantity || 0).toString(), 150, y);
          doc.text(feed.unit, 220, y);
          doc.text(feed.supplier, 270, y);
          doc.text(feed.expiryDate || 'N/A', 350, y);
          y += 20;
        });

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  private async generateFeedCSV(feedInventory: FeedInventory[]): Promise<string> {
    const csvWriter = createCsvWriter.createObjectCsvWriter({
      path: 'temp-feed.csv',
      header: [
        { id: 'feedType', title: 'Feed Type' },
        { id: 'quantity', title: 'Quantity' },
        { id: 'unit', title: 'Unit' },
        { id: 'supplier', title: 'Supplier' },
        { id: 'expiryDate', title: 'Expiry Date' },
        { id: 'costPerUnit', title: 'Cost Per Unit' },
        { id: 'minimumStock', title: 'Minimum Stock' }
      ]
    });

      const csvData = feedInventory.map((feed: FeedInventory) => ({
      feedType: feed.feedType,
      quantity: feed.quantity,
      unit: feed.unit,
      supplier: feed.supplier,
      expiryDate: feed.expiryDate || 'N/A',
      costPerUnit: feed.costPerUnit || 0,
      minimumStock: feed.minimumStock || 0
    }));

    await csvWriter.writeRecords(csvData);
    
    const csvContent = fs.readFileSync('temp-feed.csv', 'utf8');
    fs.unlinkSync('temp-feed.csv');
    
    return csvContent;
  }

  private async generateFarmReportPDF(data: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument();
        const buffers: Buffer[] = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));

        const { collections, birds, feedInventory, medicineInventory, metadata } = data;

        // Add header
        doc.fontSize(20).text('Comprehensive Farm Report', 50, 50);
        doc.fontSize(12).text(`Farm ID: ${metadata.farmId}`, 50, 80);
        doc.text(`Period: ${metadata.startDate} to ${metadata.endDate}`, 50, 100);
        doc.text(`Generated by: ${metadata.generatedBy}`, 50, 120);
        doc.text(`Generated at: ${metadata.generatedAt}`, 50, 140);

        // Summary section
        doc.fontSize(16).text('Executive Summary', 50, 180);
        doc.fontSize(12);
        
        const totalEggs = collections.reduce((sum: number, c: EggCollection) => sum + c.quantity, 0);
        const totalBirds = birds.reduce((sum: number, b: Bird) => sum + b.quantity, 0);
        const totalFeed = feedInventory.reduce((sum: number, f: FeedInventory) => sum + (f.stock || f.quantity || 0), 0);
        
        doc.text(`Total Eggs Collected: ${totalEggs}`, 50, 210);
        doc.text(`Total Birds: ${totalBirds}`, 50, 230);
        doc.text(`Total Feed Inventory: ${totalFeed}`, 50, 250);
        doc.text(`Medicine Items: ${medicineInventory.length}`, 50, 270);

        // Collections summary
        doc.fontSize(14).text('Egg Collections Summary', 50, 310);
        doc.fontSize(12).text(`Total Collections: ${collections.length}`, 50, 340);
        doc.text(`Average per Collection: ${collections.length > 0 ? Math.round(totalEggs / collections.length) : 0}`, 50, 360);

        // Birds summary
        doc.fontSize(14).text('Birds Summary', 50, 400);
        doc.fontSize(12).text(`Total Birds: ${totalBirds}`, 50, 430);
        doc.text(`Number of Pens: ${new Set(birds.map((b: Bird) => b.penId)).size}`, 50, 450);

        // Feed summary
        doc.fontSize(14).text('Feed Inventory Summary', 50, 490);
        doc.fontSize(12).text(`Feed Types: ${feedInventory.length}`, 50, 520);
        doc.text(`Total Quantity: ${totalFeed}`, 50, 540);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
}

export default DataExportController;
