import { Module } from '@nestjs/common';

import { BatchesController } from './batches.controller.ts';
import { BatchesService } from './batches.service.ts';
import { MinioModule } from '../../businessLogic/minio/minio.module.ts';
import { PrismaModule } from '../../prisma/prisma.module.ts';
import { JwtGuard } from '../auth/jwt.guard.ts';
import { MinioStorageService } from '../../businessLogic/minio/minio-storage.service.ts';
import { AllegroAuthModule } from '../allegro-auth/allegro-auth.module.ts';
import { AllegroAuthGuard } from '../allegro-auth/allegro-auth.guard.ts';
import { AllegroAuthService } from '../allegro-auth/allegro-auth.service.ts';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [MinioModule, PrismaModule, AllegroAuthModule],
  controllers: [BatchesController],
  providers: [BatchesService, JwtGuard, MinioStorageService, AllegroAuthGuard, AllegroAuthService, ConfigService],
})
export class BatchesModule {}