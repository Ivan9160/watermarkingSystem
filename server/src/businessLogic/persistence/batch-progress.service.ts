import { Injectable } from '@nestjs/common';

import { BatchesRepository } from './batches.repository.ts';
import { ImageJobsRepository } from './image-jobs.repository.ts';


@Injectable()
export class BatchProgressService {
  constructor(
    private readonly batches: BatchesRepository,
    private readonly imageJobs: ImageJobsRepository,
  ) {}

  async markSucceeded(imageJobId: string, outputKey: string): Promise<void> {
    await this.imageJobs.markSucceeded(imageJobId, outputKey);
    await this.finalizeFor(imageJobId);
  }

  async markFailed(imageJobId: string, message: string): Promise<void> {
    await this.imageJobs.markFailed(imageJobId, message);
    await this.finalizeFor(imageJobId);
  }

  private async finalizeFor(imageJobId: string): Promise<void> {
    const job = await this.imageJobs.findById(imageJobId);
    if (!job) return;

    const jobs = await this.imageJobs.listByBatch(job.batchId);
    const unfinished = jobs.some(
      (j) => j.status === 'PENDING' || j.status === 'PROCESSING',
    );
    if (unfinished) return;

    const allFailed = jobs.every((j) => j.status === 'FAILED');
    await this.batches.markFinished(job.batchId, allFailed ? 'FAILED' : 'COMPLETED');
  }
}
