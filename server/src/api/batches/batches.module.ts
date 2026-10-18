import { Module } from '@nestjs/common';

import { BatchesController } from './batches.controller.ts';
import { BatchesService } from './batches.service.ts';
import { MinioModule } from '../../minio/minio.module.ts';
import { PrismaModule } from '../../prisma/prisma.module.ts';
import { JwtGuard } from '../auth/jwt.guard.ts';
import { MinioStorageService } from '../../minio/minio-storage.service.ts';

@Module({
  imports: [MinioModule, PrismaModule],
  controllers: [BatchesController],
  providers: [BatchesService, JwtGuard, MinioStorageService],
})
export class BatchesModule {}