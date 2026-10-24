import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { ImageDownloadError } from '../../businessLogic/common/image-download.error.ts';
import { parseAllowedImageUrl } from '../../businessLogic/common/image-url.policy.ts';
import { BatchesRepository } from '../../businessLogic/persistence/batches.repository.ts';
import { ImageJobsRepository, type NewImageJob } from '../../businessLogic/persistence/image-jobs.repository.ts';
import { ImageQueueService } from '../../businessLogic/queues/image-queue.service.ts';
import { CreateBatchDto } from './dto/create-batch.dto.ts';

const MAX_IMAGES_PER_BATCH = 100;


@Injectable()
export class BatchesService {
  constructor(
    private readonly batches: BatchesRepository,
    private readonly imageJobs: ImageJobsRepository,
    private readonly queues: ImageQueueService,
  ) {}

  async create(allegroUserId: number, dto: CreateBatchDto) {
    const items = this.validateAndFlatten(dto);

    const organization = await this.batches.findOrganizationByAllegroUserId(allegroUserId);
    if (!organization) {
      throw new NotFoundException('Create an organization before creating a batch');
    }

    const batch = await this.batches.create({
      organizationId: organization.id,
      watermarkConfig: dto.watermarkConfig ?? {},
      totalImages: items.length,
    });

    try {
      const jobs = await this.imageJobs.createMany(batch.id, items);
      await this.queues.enqueueDownloads(jobs.map((j) => j.id));
    } catch (error) {
      await this.batches.delete(batch.id).catch(() => undefined);
      throw error;
    }

    return {
      batchId: batch.id,
      status: 'QUEUED' as const,
      totalProducts: dto.products.length,
      totalImages: items.length,
      statusUrl: `/batches/${batch.id}`,
      resultsUrl: `/batches/${batch.id}/results`,
    };
  }

  async getStatus(allegroUserId: number, batchId: string) {
    const batch = await this.batches.findOwned(allegroUserId, batchId);
    if (!batch) throw new NotFoundException('Batch not found');

    const jobs = await this.imageJobs.listByBatch(batch.id);
    const counts = { pending: 0, processing: 0, succeeded: 0, failed: 0 };
    for (const job of jobs) {
      counts[job.status.toLowerCase() as keyof typeof counts]++;
    }

    return {
      batchId: batch.id,
      status: batch.status,
      totalImages: batch.totalImages,
      counts,
      createdAt: new Date(batch.createdAt.epochMilliseconds).toISOString(),
      completedAt: batch.completedAt ? new Date(batch.completedAt.epochMilliseconds).toISOString() : null,
      resultsUrl: `/batches/${batch.id}/results`,
    };
  }

  private validateAndFlatten(dto: CreateBatchDto): NewImageJob[] {
    const offerIds = dto.products.map((p) => p.offerId);
    //uncomment the following lines for production
    
    // if (new Set(offerIds).size !== offerIds.length) {
    //   throw new BadRequestException('Each offerId must be unique in a batch');
    // }

    const items: NewImageJob[] = [];
    for (const product of dto.products) {
      product.images.forEach((sourceUrl, imageIndex) => {
        try {
          parseAllowedImageUrl(sourceUrl);
        } catch (e) {
          if (e instanceof ImageDownloadError) throw new BadRequestException(e.message);
          throw e;
        }
        items.push({ productOfferId: product.offerId, imageIndex, sourceUrl });
      });
    }

    if (items.length === 0) throw new BadRequestException('Batch has no images');
    if (items.length > MAX_IMAGES_PER_BATCH) {
      throw new BadRequestException(`Maximum ${MAX_IMAGES_PER_BATCH} images per batch`);
    }
    return items;
  }
}