import { Module } from '@nestjs/common';

import { MinioModule } from '../minio/minio.module.ts';
import { PersistenceModule } from '../persistence/persistence.module.ts';
import { QueuesModule } from '../queues/queues.module.ts';
import { ProcessingProcessor } from './processing.processor.ts';
import { WatermarkEngineService } from './watermark-engine.service.ts';

@Module({
  imports: [PersistenceModule, QueuesModule, MinioModule],
  providers: [ProcessingProcessor, WatermarkEngineService],
})
export class ProcessingModule {}
