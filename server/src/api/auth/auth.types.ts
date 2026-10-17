import type { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  organizationId: string;
  apiKeyId: string;
}
