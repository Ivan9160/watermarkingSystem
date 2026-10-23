import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { type Job, UnrecoverableError } from 'bullmq';

import { ImageDownloadError } from '../common/image-download.error.ts';
import { MinioStorageService } from '../minio/minio-storage.service.ts';
import { StorageKeys } from '../minio/storage-keys.ts';
import { BatchProgressService } from '../persistence/batch-progress.service.ts';
import { BatchesRepository } from '../persistence/batches.repository.ts';
import { ImageJobsRepository } from '../persistence/image-jobs.repository.ts';
import { ImageQueueService } from '../queues/image-queue.service.ts';
import { IMAGE_DOWNLOAD_QUEUE, type ImageTaskPayload } from '../queues/queue.constants.ts';
import { isFinalFailure } from '../queues/queue.utils.ts';
import { ImageDownloaderService } from './image-downloader.service.ts';

/**
 * Ingestion worker: fetch + validate sourceUrl -> originals/ to MinIO ->
 * originalKey to PostgreSQL -> job to image-process.
 */
@Processor(IMAGE_DOWNLOAD_QUEUE, {
  concurrency: Number(process.env['INGESTION_CONCURRENCY'] ?? 5),
})
export class IngestionProcessor extends WorkerHost {
  private readonly logger = new Logger(IngestionProcessor.name);

  constructor(
    private readonly batches: BatchesRepository,
    private readonly imageJobs: ImageJobsRepository,
    private readonly progress: BatchProgressService,
    private readonly downloader: ImageDownloaderService,
    private readonly storage: MinioStorageService,
    private readonly queues: ImageQueueService,
  ) {
    super();
  }

  async process(job: Job<ImageTaskPayload>): Promise<void> {
    const { imageJobId } = job.data;

    const image = await this.imageJobs.findById(imageJobId);
    if (!image) throw new UnrecoverableError(`ImageJob ${imageJobId} not found`);
    if (image.status === 'SUCCEEDED' || image.status === 'FAILED') return; 

    const batch = await this.batches.findById(image.batchId);
    if (!batch) throw new UnrecoverableError(`Batch ${image.batchId} not found`);

    await this.batches.markProcessing(batch.id);
    await this.imageJobs.markProcessing(image.id);

    if (!image.originalKey) {
      let downloaded;
      try {
        downloaded = await this.downloader.download(image.sourceUrl);
      } catch (e) {
        if (e instanceof ImageDownloadError && !e.retryable) {
          throw new UnrecoverableError(e.message);
        }
        throw e;
      }

      const key = StorageKeys.original(
        batch.organizationId,
        batch.id,
        image.id,
        downloaded.extension,
      );
      await this.storage.upload(key, downloaded.buffer, downloaded.contentType);
      await this.imageJobs.saveOriginalKey(image.id, key);
    }

    await this.queues.enqueueProcess(image.id);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<ImageTaskPayload> | undefined, error: Error) {
    if (!job || !isFinalFailure(job, error)) return;
    try {
      await this.progress.markFailed(job.data.imageJobId, error.message);
    } catch (e) {
      this.logger.error(`Cannot persist failure of ${job.data.imageJobId}`, e as Error);
    }
  }
}
