// src/types/express.d.ts
import * as express from 'express';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      user?: {
        id: string;
        email: string;
        role: string;
        fullName?: string;
      };
    }
  }
}