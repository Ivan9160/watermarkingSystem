import {
  BadRequestException,
  Body,
  Controller,
  NotFoundException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import type { NewImageJob } from '../../businessLogic/persistence/image-jobs.repository.ts';
import { BatchesRepository } from '../../businessLogic/persistence/batches.repository.ts';
import { ImageJobsRepository } from '../../businessLogic/persistence/image-jobs.repository.ts';
import { ImageQueueService } from '../../businessLogic/queues/image-queue.service.ts';
import { MinioStorageService } from '../../businessLogic/minio/minio-storage.service.ts';
import { assertBatchWatermarkConfig } from '../../businessLogic/processing/watermark-config.ts';

import { AllegroAuthGuard } from '../allegro-auth/allegro-auth.guard.ts';

import {
  isLocalRef,
  LOCAL_GROUP_PATTERN,
  localKeyFor,
} from './local-image-source.ts';

type AuthRequest = Request & {
  allegroUser: { id: number };
};

type BatchImage = {
  url: string;
  offerImageIndex: number;
};

type BatchProduct = {
  offerId: string;
  images: BatchImage[];
};

// Only known e-commerce image hosts: no arbitrary-URL fetching (SSRF).
const HOSTS = new Set(
  (
    process.env['BATCH_ALLOWED_IMAGE_HOSTS'] ??
    'a.allegroimg.allegrosandbox.pl,a.allegroimg.pl,a.allegroimg.com'
  )
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

function allowAllegroUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      HOSTS.has(url.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

@Controller('mixed-batches')
@UseGuards(AllegroAuthGuard)
export class MixedBatchesController {
  constructor(
    private readonly batches: BatchesRepository,
    private readonly imageJobs: ImageJobsRepository,
    private readonly queues: ImageQueueService,
    private readonly storage: MinioStorageService,
  ) {}

  @Post()
  async create(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body)
    ) {
      throw new BadRequestException('Invalid batch request');
    }

    const payload = body as Record<string, unknown>;

    const rawProducts = payload['products'];
    const watermarkConfig = payload['watermarkConfig'];

    if (
      !watermarkConfig ||
      typeof watermarkConfig !== 'object' ||
      Array.isArray(watermarkConfig)
    ) {
      throw new BadRequestException(
        'watermarkConfig must be an object',
      );
    }

    assertBatchWatermarkConfig(watermarkConfig);

    if (
      !Array.isArray(rawProducts) ||
      !rawProducts.length ||
      rawProducts.length > 20
    ) {
      throw new BadRequestException(
        'Select between 1 and 20 product groups',
      );
    }

    const items: Array<NewImageJob & { originalKey?: string }> = [];

    const usedOffers = new Set<string>();

    for (const entry of rawProducts) {
      if (
        !entry ||
        typeof entry !== 'object' ||
        Array.isArray(entry)
      ) {
        throw new BadRequestException('Invalid product group');
      }

      const product = entry as BatchProduct;

      if (
        typeof product.offerId !== 'string' ||
        !product.offerId ||
        product.offerId.length > 128 ||
        usedOffers.has(product.offerId)
      ) {
        throw new BadRequestException(
          'Product group IDs must be unique and nonempty',
        );
      }

      usedOffers.add(product.offerId);

      if (
        !Array.isArray(product.images) ||
        product.images.length < 1 ||
        product.images.length > 20
      ) {
        throw new BadRequestException(
          'Each group needs 1–20 images',
        );
      }

      // Prevent replacing the same original offer image twice.
      const usedImageIndexes = new Set<number>();

      for (const [index, rawImage] of product.images.entries()) {
        if (
          !rawImage ||
          typeof rawImage !== 'object' ||
          Array.isArray(rawImage)
        ) {
          throw new BadRequestException('Invalid image object');
        }

        const image = rawImage as Record<string, unknown>;

        const source = image['url'];
        const offerImageIndex = image['offerImageIndex'];

        if (
          typeof source !== 'string' ||
          !source ||
          source.length > 4096
        ) {
          throw new BadRequestException('Invalid image URL');
        }

        if (
          typeof offerImageIndex !== 'number' ||
          !Number.isInteger(offerImageIndex) ||
          offerImageIndex < 0 ||
          offerImageIndex > 19
        ) {
          throw new BadRequestException(
            'offerImageIndex must be an integer between 0 and 19',
          );
        }

        if (usedImageIndexes.has(offerImageIndex)) {
          throw new BadRequestException(
            `Duplicate image index ${offerImageIndex} for offer ${product.offerId}`,
          );
        }

        usedImageIndexes.add(offerImageIndex);

        // --------------------------------------------------
        // Local image from RustFS
        // --------------------------------------------------

        if (isLocalRef(source)) {
          // A local file must never masquerade as an existing Allegro offer.
          if (!LOCAL_GROUP_PATTERN.test(product.offerId)) {
            throw new BadRequestException(
              'Local images must use a LOCAL-* group',
            );
          }

          const originalKey = localKeyFor(
            req.allegroUser.id,
            source,
          );

          if (
            !originalKey ||
            !(await this.storage.exists(originalKey))
          ) {
            throw new BadRequestException(
              'One of the local files is missing from RustFS',
            );
          }

          // Original file is already in RustFS.
          // The ingestion worker skips downloading and enqueues Sharp processing.
          items.push({
            productOfferId: product.offerId,
            imageIndex: index,
            offerImageIndex,
            sourceUrl: source,
            originalKey,
          });
        } else {
          // --------------------------------------------------
          // Remote Allegro image
          // --------------------------------------------------

          if (
            LOCAL_GROUP_PATTERN.test(product.offerId) ||
            !allowAllegroUrl(source)
          ) {
            throw new BadRequestException(
              'Remote images need an HTTPS Allegro image URL and real offer ID',
            );
          }

          items.push({
            productOfferId: product.offerId,
            imageIndex: index,
            offerImageIndex,
            sourceUrl: source,
          });
        }
      }
    }

    if (items.length > 100) {
      throw new BadRequestException(
        'Maximum 100 images per batch',
      );
    }


    const organization =
      await this.batches.findOrganizationByAllegroUserId(
        req.allegroUser.id,
      );

    if (!organization) {
      throw new NotFoundException(
        'Create an organization before creating a batch',
      );
    }


    const batch = await this.batches.create({
      organizationId: organization.id,
      watermarkConfig: watermarkConfig as Record<string, any>,
      totalImages: items.length,
    });

    try {
      const jobs = await this.imageJobs.createMany(
        batch.id,
        items,
      );

      await this.queues.enqueueDownloads(
        jobs.map((job) => job.id),
      );
    } catch (error) {
      await this.batches.delete(batch.id).catch(() => undefined);
      throw error;
    }

    return {
      batchId: batch.id,
      status: 'QUEUED' as const,
      totalProducts: rawProducts.length,
      totalImages: items.length,
      statusUrl: `/batches/${batch.id}`,
      resultsUrl: `/batches/${batch.id}/results`,
    };
  }
}