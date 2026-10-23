import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { type Job, UnrecoverableError } from 'bullmq';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';

import { contentTypeFromExtension } from '../common/image-types.ts';
import { MinioStorageService } from '../minio/minio-storage.service.ts';
import { StorageKeys } from '../minio/storage-keys.ts';
import { BatchProgressService } from '../persistence/batch-progress.service.ts';
import { BatchesRepository } from '../persistence/batches.repository.ts';
import { ImageJobsRepository } from '../persistence/image-jobs.repository.ts';
import { IMAGE_PROCESS_QUEUE, type ImageTaskPayload } from '../queues/queue.constants.ts';
import { isFinalFailure } from '../queues/queue.utils.ts';
import { WatermarkEngineService } from './watermark-engine.service.ts';

/**
 * Image processing worker: originals/ -> local tmp -> engine (subprocess)
 * -> processed/ -> status ImageJob -> status Batch.
 */
@Processor(IMAGE_PROCESS_QUEUE, {
  concurrency: Number(process.env['PROCESSING_CONCURRENCY'] ?? 2), // ≈ CPU count
})
export class ProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(ProcessingProcessor.name);

  constructor(
    private readonly batches: BatchesRepository,
    private readonly imageJobs: ImageJobsRepository,
    private readonly progress: BatchProgressService,
    private readonly storage: MinioStorageService,
    private readonly engine: WatermarkEngineService,
  ) {
    super();
  }

  async process(job: Job<ImageTaskPayload>): Promise<void> {
    const image = await this.imageJobs.findById(job.data.imageJobId);
    if (!image) throw new UnrecoverableError(`ImageJob ${job.data.imageJobId} not found`);
    if (image.status === 'SUCCEEDED' || image.status === 'FAILED') return;
    if (!image.originalKey) throw new UnrecoverableError('Original image is not stored yet');

    const batch = await this.batches.findById(image.batchId);
    if (!batch) throw new UnrecoverableError(`Batch ${image.batchId} not found`);

    const ext = extname(image.originalKey); // ".jpg"
    const workDir = await mkdtemp(join(tmpdir(), 'wm-'));

    try {
      const inputPath = join(workDir, `input${ext}`);
      const outputPath = join(workDir, `output${ext}`);

      await this.storage.downloadToFile(image.originalKey, inputPath);
      await this.engine.apply({ inputPath, outputPath, config: batch.watermarkConfig });
      await access(outputPath).catch(() => {
        throw new Error('Watermark engine produced no output file');
      });

      const outputKey = StorageKeys.processed(
        batch.organizationId,
        batch.id,
        image.id,
        ext.slice(1),
      );
      await this.storage.uploadFile(outputKey, outputPath, contentTypeFromExtension(ext));
      await this.progress.markSucceeded(image.id, outputKey);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
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
