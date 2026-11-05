import { Module } from '@nestjs/common';
import { AllegroAuthModule } from '../allegro-auth/allegro-auth.module.ts';
import { MinioModule } from '../../businessLogic/minio/minio.module.ts';
import { PersistenceModule } from '../../businessLogic/persistence/persistence.module.ts';
import { QueuesModule } from '../../businessLogic/queues/queues.module.ts';
import { LocalImagesController } from './local-images.controller.ts';
import { MixedBatchesController } from './mixed-batches.controller.ts';

@Module({
  imports: [AllegroAuthModule, MinioModule, PersistenceModule, QueuesModule],
  controllers: [LocalImagesController, MixedBatchesController],
})
export class LocalImagesModule {}
