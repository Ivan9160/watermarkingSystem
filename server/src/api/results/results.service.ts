import { Injectable, NotFoundException } from '@nestjs/common';

import { MinioStorageService } from '../../businessLogic/minio/minio-storage.service.ts';
import { BatchesRepository } from '../../businessLogic/persistence/batches.repository.ts';
import { ImageJobsRepository } from '../../businessLogic/persistence/image-jobs.repository.ts';

@Injectable()
export class ResultsService {
  constructor(
    private readonly batches: BatchesRepository,
    private readonly imageJobs: ImageJobsRepository,
    private readonly storage: MinioStorageService,
  ) {}

  async getResults(allegroUserId: number, batchId: string) {
    const batch = await this.batches.findOwned(allegroUserId, batchId);
    if (!batch) throw new NotFoundException('Batch not found');

    const jobs = await this.imageJobs.listByBatch(batch.id);

    const byOffer = new Map<string, any[]>();
    await Promise.all(
      jobs.map(async (job) => {
        const entry = {
          id: job.id,
          index: job.imageIndex,
          status: job.status,
          url:
            job.status === 'SUCCEEDED' && job.outputKey
              ? await this.storage.getDownloadUrl(job.outputKey)
              : null,
          error: job.status === 'FAILED' ? job.errorMessage : null,
        };
        const list = byOffer.get(job.productOfferId) ?? [];
        list.push(entry);
        byOffer.set(job.productOfferId, list);
      }),
    );

    return {
      batchId: batch.id,
      status: batch.status,
      products: [...byOffer.entries()].map(([offerId, images]) => ({
        offerId,
        images: images.sort((a, b) => a.index - b.index),
      })),
    };
  }
}
