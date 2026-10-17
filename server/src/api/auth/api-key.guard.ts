import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../../../server-sample/src/prisma/prisma.service.js';
import { AuthenticatedRequest } from './auth.types.js';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const rawKey = request.header('x-api-key');
    if (!rawKey) throw new UnauthorizedException('Missing X-API-Key header');

    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { keyHash },
      include: { organization: true },
    });

    if (
      !apiKey ||
      apiKey.revokedAt ||
      apiKey.organization.status !== 'ACTIVE'
    ) {
      throw new UnauthorizedException('Invalid API key');
    }

    request.organizationId = apiKey.organizationId;
    request.apiKeyId = apiKey.id;
    return true;
  }
}
