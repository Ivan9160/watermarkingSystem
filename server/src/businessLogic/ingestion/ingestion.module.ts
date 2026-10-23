import { Module } from '@nestjs/common';

import { MinioModule } from '../minio/minio.module.ts';
import { PersistenceModule } from '../persistence/persistence.module.ts';
import { QueuesModule } from '../queues/queues.module.ts';
import { ImageDownloaderService } from './image-downloader.service.ts';
import { IngestionProcessor } from './ingestion.processor.ts';

@Module({
  imports: [PersistenceModule, QueuesModule, MinioModule],
  providers: [IngestionProcessor, ImageDownloaderService],
})
export class IngestionModule {}
