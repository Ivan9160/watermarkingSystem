import { Module } from '@nestjs/common';

import { BatchesController } from './batches.controller.ts';
import { BatchesService } from './batches.service.ts';
import { MinioModule } from '../../businessLogic/minio/minio.module.ts';
import { PrismaModule } from '../../prisma/prisma.module.ts';
import { MinioStorageService } from '../../businessLogic/minio/minio-storage.service.ts';
import { AllegroAuthModule } from '../allegro-auth/allegro-auth.module.ts';
import { AllegroAuthService } from '../allegro-auth/allegro-auth.service.ts';
import { ConfigService } from '@nestjs/config';
import { PersistenceModule } from '../../businessLogic/persistence/persistence.module.ts';
import { ImageQueueService } from '../../businessLogic/queues/image-queue.service.ts';
import { QueuesModule } from '../../businessLogic/queues/queues.module.ts';
import { AllegroSessionGuard } from '../allegro-auth/session/allegro-session.guard.ts';

@Module({
  imports: [MinioModule, PrismaModule, AllegroAuthModule, PersistenceModule, QueuesModule],
  controllers: [BatchesController],
  providers: [BatchesService, MinioStorageService, AllegroSessionGuard, AllegroAuthService, ConfigService, ImageQueueService],
})
export class BatchesModule {}