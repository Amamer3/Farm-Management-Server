// Global type declarations for modules without type definitions
declare module 'cors' {
  import { Request, Response, NextFunction } from 'express';
  interface CorsOptions {
    origin?: boolean | string | RegExp | (string | RegExp)[] | ((origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void);
    methods?: string | string[];
    allowedHeaders?: string | string[];
    exposedHeaders?: string | string[];
    credentials?: boolean;
    maxAge?: number;
    preflightContinue?: boolean;
    optionsSuccessStatus?: number;
  }
  function cors(options?: CorsOptions): (req: Request, res: Response, next: NextFunction) => void;
  export = cors;
}

declare module 'morgan' {
  import { Request, Response } from 'express';
  type FormatFn = (tokens: any, req: Request, res: Response) => string;
  type Options = {
    immediate?: boolean;
    skip?: (req: Request, res: Response) => boolean;
    stream?: { write: (str: string) => void };
  };
  function morgan(format: string | FormatFn, options?: Options): (req: Request, res: Response, next: () => void) => void;
  export = morgan;
}

declare module 'multer' {
  import { Request } from 'express';
  import { Readable } from 'stream';

  interface File {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
    destination: string;
    filename: string;
    path: string;
    buffer: Buffer;
  }

  interface StorageEngine {
    _handleFile(req: Request, file: Express.Multer.File, callback: (error?: Error | null, info?: Partial<File>) => void): void;
    _removeFile(req: Request, file: Express.Multer.File, callback: (error: Error | null) => void): void;
  }

  interface Multer {
    (options?: { storage?: StorageEngine; limits?: any; fileFilter?: any }): any;
    diskStorage(options: { destination?: string | ((req: Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => void); filename?: (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => void }): StorageEngine;
    memoryStorage(): StorageEngine;
  }

  const multer: Multer;
  export = multer;
}

declare module 'pdfkit' {
  import { Readable } from 'stream';
  class PDFDocument extends Readable {
    constructor(options?: any);
    text(text: string, x?: number, y?: number, options?: any): PDFDocument;
    fontSize(size: number): PDFDocument;
    font(src: string, family?: string): PDFDocument;
    moveDown(lines?: number): PDFDocument;
    moveUp(lines?: number): PDFDocument;
    image(src: string | Buffer, x?: number, y?: number, options?: any): PDFDocument;
    rect(x: number, y: number, width: number, height: number): PDFDocument;
    stroke(): PDFDocument;
    fill(): PDFDocument;
    end(): void;
    pipe(destination: any): any;
  }
  export = PDFDocument;
}

// Extend Express Request to include file property from multer
declare namespace Express {
  namespace Multer {
    interface File {
      fieldname: string;
      originalname: string;
      encoding: string;
      mimetype: string;
      size: number;
      destination?: string;
      filename?: string;
      path?: string;
      buffer?: Buffer;
    }
  }

  interface Request {
    file?: Express.Multer.File;
    files?: { [fieldname: string]: Express.Multer.File[] } | Express.Multer.File[];
  }
}

