
import {
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { type Job, UnrecoverableError } from 'bullmq';
import {
  access,
  mkdtemp,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import {
  extname,
  join,
} from 'node:path';

import { contentTypeFromExtension } from '../common/image-types.ts';
import { MinioStorageService } from '../minio/minio-storage.service.ts';
import { StorageKeys } from '../minio/storage-keys.ts';
import { BatchProgressService } from '../persistence/batch-progress.service.ts';
import { BatchesRepository } from '../persistence/batches.repository.ts';
import { ImageJobsRepository } from '../persistence/image-jobs.repository.ts';
import {
  IMAGE_PROCESS_QUEUE,
  type ImageTaskPayload,
} from '../queues/queue.constants.ts';
import { isFinalFailure } from '../queues/queue.utils.ts';

import { WatermarkPipelineService } from './watermark-pipeline.service.ts';
import {
  assertBatchWatermarkConfig,
  type BatchWatermarkConfig,
} from './watermark-config.ts';

@Processor(IMAGE_PROCESS_QUEUE, {
  concurrency: Number(process.env['PROCESSING_CONCURRENCY'] ?? 2),
})
export class ProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(ProcessingProcessor.name);

  constructor(
    private readonly batches: BatchesRepository,
    private readonly imageJobs: ImageJobsRepository,
    private readonly progress: BatchProgressService,
    private readonly storage: MinioStorageService,
    private readonly watermarkPipeline: WatermarkPipelineService,
  ) {
    super();
  }

  async process(job: Job<ImageTaskPayload>): Promise<void> {
    const image = await this.imageJobs.findById(
      job.data.imageJobId,
    );

    if (!image) {
      throw new UnrecoverableError(
        `ImageJob ${job.data.imageJobId} not found`,
      );
    }

    if (
      image.status === 'SUCCEEDED' ||
      image.status === 'FAILED'
    ) {
      return;
    }

    if (!image.originalKey) {
      throw new UnrecoverableError(
        'Original image is not stored yet',
      );
    }

    const batch = await this.batches.findById(image.batchId);

    if (!batch) {
      throw new UnrecoverableError(
        `Batch ${image.batchId} not found`,
      );
    }

    // Validate the complete watermark configuration.
    const rawConfig: unknown = batch.watermarkConfig;

    let watermarkConfig: BatchWatermarkConfig;

    try {
      assertBatchWatermarkConfig(rawConfig);
      watermarkConfig = rawConfig;
    } catch (error) {
      throw new UnrecoverableError(
        `Invalid watermarkConfig: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`,
      );
    }

    // Preserve the invisible watermark ID between retries.
    // The configured ID is used for a new ImageJob.
    let pipelineConfig = watermarkConfig;

    if (watermarkConfig.applyInvisibleWatermark) {
      const invisibleConfig =
        watermarkConfig.invisibleWatermarkConfig;

      if (!invisibleConfig) {
        throw new UnrecoverableError(
          'invisibleWatermarkConfig is missing',
        );
      }      const watermarkId = image.watermarkId ?? (
        invisibleConfig.idStrategy === 'per-image'
          ? randomBytes(5).toString('hex')
          : invisibleConfig.id
      );

      if (!image.watermarkId) {
        await this.imageJobs.saveWatermarkId(
          image.id,
          watermarkId,
        );
      }

      pipelineConfig = {
        ...watermarkConfig,
        invisibleWatermarkConfig: {
          ...invisibleConfig,
          id: watermarkId,
        },
      };
    }

    const originalExt =
      extname(image.originalKey).toLowerCase() || '.jpg';

    const workDir = await mkdtemp(
      join(tmpdir(), 'wm-'),
    );

    try {
      const inputPath = join(
        workDir,
        `input${originalExt}`,
      );

      // The pipeline changes this to PNG when PixelSeal is enabled.
      const requestedOutputPath = join(
        workDir,
        `output${originalExt}`,
      );

      await this.storage.downloadToFile(
        image.originalKey,
        inputPath,
      );

      // Executes visible and/or invisible watermark
      // according to watermarkConfig.
      //
      // Both enabled:
      // visible -> PixelSeal
      //
      // Only one enabled:
      // executes only that engine.
      const finalOutputPath =
        await this.watermarkPipeline.apply({
          inputPath,
          outputPath: requestedOutputPath,
          config: pipelineConfig,
          jobId: image.id,
        });

      await access(finalOutputPath).catch(() => {
        throw new Error(
          'Watermark pipeline produced no output file',
        );
      });

      // Use the actual output extension.
      // PixelSeal output is PNG, even if the original was JPEG.
      const outputExt =
        extname(finalOutputPath).toLowerCase();

      if (!outputExt) {
        throw new UnrecoverableError(
          'Watermark pipeline returned a file without extension',
        );
      }

      const outputKey = StorageKeys.processed(
        batch.organizationId,
        batch.id,
        image.id,
        outputExt.slice(1),
      );

      await this.storage.uploadFile(
        outputKey,
        finalOutputPath,
        contentTypeFromExtension(outputExt),
      );

      await this.progress.markSucceeded(
        image.id,
        outputKey,
      );

      this.logger.log(
        `ImageJob ${image.id} processed successfully. ` +
        `Visible=${watermarkConfig.applyVisibleWatermark}, ` +
        `Invisible=${watermarkConfig.applyInvisibleWatermark}, ` +
        `Output=${outputKey}`,
      );
    } finally {
      await rm(workDir, {
        recursive: true,
        force: true,
      });
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(
    job: Job<ImageTaskPayload> | undefined,
    error: Error,
  ) {
    if (!job || !isFinalFailure(job, error)) {
      return;
    }

    try {
      await this.progress.markFailed(
        job.data.imageJobId,
        error.message,
      );
    } catch (e) {
      this.logger.error(
        `Cannot persist failure of ${job.data.imageJobId}`,
        e as Error,
      );
    }
  }
}
