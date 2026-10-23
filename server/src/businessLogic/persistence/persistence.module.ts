import { Module } from '@nestjs/common';

import { BatchProgressService } from './batch-progress.service.ts';
import { BatchesRepository } from './batches.repository.ts';
import { ImageJobsRepository } from './image-jobs.repository.ts';

@Module({
  providers: [BatchesRepository, ImageJobsRepository, BatchProgressService],
  exports: [BatchesRepository, ImageJobsRepository, BatchProgressService],
})
export class PersistenceModule {}
