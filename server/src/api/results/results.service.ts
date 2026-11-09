import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';

import { MinioStorageService } from '../../businessLogic/minio/minio-storage.service.ts';
import { BatchesRepository } from '../../businessLogic/persistence/batches.repository.ts';
import { ImageJobsRepository } from '../../businessLogic/persistence/image-jobs.repository.ts';
import { AllegroOffersClient } from './allegro-offers.client.ts';

@Injectable()
export class ResultsService {
  constructor(
    private readonly batches: BatchesRepository,
    private readonly imageJobs: ImageJobsRepository,
    private readonly storage: MinioStorageService,
    private readonly allegro: AllegroOffersClient,
  ) {}
  private readonly logger = new Logger(ResultsService.name);

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
          watermarkId: job.watermarkId ?? null,
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

async applyToAllegro(
  allegroUserId: number,
  batchId: string,
  imageId: string,
  accessToken: string,
) {
  this.logger.debug(
    `Applying image ${imageId} from batch ${batchId} for user ${allegroUserId}`,
  );

  const batch = await this.batches.findOwned(allegroUserId, batchId);
  if (!batch) throw new NotFoundException('Batch not found');

  const jobs = await this.imageJobs.listByBatch(batch.id);
  const job = jobs.find((j) => j.id === imageId);

  if (!job) throw new NotFoundException('Image not found');

  if (job.status !== 'SUCCEEDED' || !job.outputKey) {
    throw new ConflictException('Image is not processed successfully');
  }

  const offerImageIndex = job.offerImageIndex;

  if (
    !Number.isInteger(offerImageIndex) ||
    offerImageIndex < 0
  ) {
    throw new ConflictException('Invalid offer image index');
  }

  const downloadUrl = await this.storage.getDownloadUrl(job.outputKey);
  const fileRes = await fetch(downloadUrl);

  if (!fileRes.ok) {
    throw new BadGatewayException(
      `Failed to read processed image: ${fileRes.status}`,
    );
  }
  const contentType =
    fileRes.headers.get('content-type') ?? 'image/jpeg';

  const bytes = await fileRes.arrayBuffer();

  const newUrl = await this.allegro.uploadImage(
    accessToken,
    bytes,
    contentType,
  );

  const urls = await this.allegro.getOfferImageUrls(
    accessToken,
    job.productOfferId,
  );

  if (offerImageIndex >= urls.length) {
    throw new ConflictException(
      'Offer image index is out of range',
    );
  }

  urls[offerImageIndex] = newUrl;

  await this.allegro.setOfferImages(
    accessToken,
    job.productOfferId,
    urls,
  );

  return {
    offerId: job.productOfferId,
    index: offerImageIndex,
    url: newUrl,
  };
}



  async applyBatchToAllegro(
  allegroUserId: number,
  batchId: string,
  accessToken: string,
) {
  const batch = await this.batches.findOwned(allegroUserId, batchId);

  if (!batch) {
    throw new NotFoundException('Batch not found');
  }

  const jobs = await this.imageJobs.listByBatch(batch.id);

  if (!jobs.length) {
    throw new ConflictException('Batch has no images');
  }

  const unfinishedJobs = jobs.filter(
    (job) => !['SUCCEEDED', 'FAILED'].includes(job.status),
  );

  if (unfinishedJobs.length > 0) {
    throw new ConflictException(
      `Batch is still processing. Unfinished images: ${unfinishedJobs.length}`,
    );
  }

  const successfulJobs = jobs.filter(
    (job) => job.status === 'SUCCEEDED' && !!job.outputKey,
  );

  if (!successfulJobs.length) {
    throw new ConflictException('No successfully processed images');
  }

  const skippedImages = jobs
    .filter((job) => job.status !== 'SUCCEEDED' || !job.outputKey)
    .map((job) => ({
      imageId: job.id,
      offerId: job.productOfferId,
      status: job.status,
      reason: job.errorMessage ?? 'Missing processed image',
    }));

  const jobsByOffer = new Map<string, typeof jobs>();

  for (const job of successfulJobs) {
    const offerJobs = jobsByOffer.get(job.productOfferId) ?? [];

    offerJobs.push(job);
    jobsByOffer.set(job.productOfferId, offerJobs);
  }

  const offerResults: {
    offerId: string;
    status: 'APPLIED' | 'FAILED';
    images?: {
      imageId: string;
      index: number;
      url: string;
    }[];
    error?: string;
  }[] = [];

  for (const [offerId, offerJobs] of jobsByOffer) {
    try {
      const currentUrls = await this.allegro.getOfferImageUrls(
        accessToken,
        offerId,
      );

      const updatedUrls = [...currentUrls];

      const indexes = offerJobs.map(
        (job) => job.offerImageIndex,
      );

      if (
        indexes.some(
          (index) =>
            !Number.isInteger(index) ||
            index < 0 ||
            index >= currentUrls.length,
        )
      ) {
        throw new ConflictException(
          `Image index out of range for offer ${offerId}`,
        );
      }

      if (new Set(indexes).size !== indexes.length) {
        throw new ConflictException(
          `Duplicate image indexes for offer ${offerId}`,
        );
      }

      const appliedImages: {
        imageId: string;
        index: number;
        url: string;
      }[] = [];

      const sortedJobs = [...offerJobs].sort(
        (a, b) => a.offerImageIndex - b.offerImageIndex,
      );

      for (const job of sortedJobs) {
        if (!job.outputKey) continue;

        const downloadUrl = await this.storage.getDownloadUrl(
          job.outputKey,
        );

        const fileRes = await fetch(downloadUrl);

        if (!fileRes.ok) {
          throw new BadGatewayException(
            `Failed to read image ${job.id}: ${fileRes.status}`,
          );
        }

        const contentType =
          fileRes.headers.get('content-type') ?? 'image/jpeg';

        const bytes = await fileRes.arrayBuffer();

        const newUrl = await this.allegro.uploadImage(
          accessToken,
          bytes,
          contentType,
        );

        updatedUrls[job.offerImageIndex] = newUrl;

        appliedImages.push({
          imageId: job.id,
          index: job.offerImageIndex,
          url: newUrl,
        });
      }

      await this.allegro.setOfferImages(
        accessToken,
        offerId,
        updatedUrls,
      );

      offerResults.push({
        offerId,
        status: 'APPLIED',
        images: appliedImages,
      });

    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';

      this.logger.error(
        `Failed to apply images to offer ${offerId}: ${message}`,
      );

      offerResults.push({
        offerId,
        status: 'FAILED',
        error: message,
      });
    }
  }

  const failedOffers = offerResults.filter(
    (offer) => offer.status === 'FAILED',
  );

  const appliedImagesCount = offerResults.reduce(
    (total, offer) => total + (offer.images?.length ?? 0),
    0,
  );

  return {
    batchId: batch.id,
    status:
      failedOffers.length > 0 || skippedImages.length > 0
        ? 'PARTIAL'
        : 'APPLIED',

    totalImages: jobs.length,
    appliedImagesCount,
    skippedImages,
    offers: offerResults,
  };
}
}