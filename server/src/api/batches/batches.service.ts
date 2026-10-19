import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  PayloadTooLargeException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { db } from '../../prisma/db.ts';
import { MinioStorageService } from '../../minio/minio-storage.service.ts';
import { CreateBatchDto } from './dto/create-batch.dto.ts';

const MAX_IMAGES_PER_BATCH = 100;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

@Injectable()
export class BatchesService {
  constructor(
    private readonly minio: MinioStorageService,
  ) {}

  async create(allegroUserId: number, dto: CreateBatchDto) {
    const totalImages = dto.products.reduce(
      (total, product) => total + product.images.length,
      0,
    );

    if (totalImages > MAX_IMAGES_PER_BATCH) {
      throw new BadRequestException(
        `Maximum ${MAX_IMAGES_PER_BATCH} images per batch`,
      );
    }

    const offerIds = dto.products.map((product) => product.offerId);

    if (new Set(offerIds).size !== offerIds.length) {
      throw new BadRequestException(
        'Each offerId must be unique in a batch',
      );
    }

    // const auth0Sub = await this.getAuth0Sub(token);
    

    const organization = await db.orm.public.Organization
      .where({ allegroUserId: allegroUserId })
      .first();

    if (!organization) {
      throw new NotFoundException(
        'Create an organization before creating a batch',
      );
    }

    const batch = await db.orm.public.Batch.create({
      organizationId: organization.id,
      watermarkConfig: dto.watermarkConfig ?? {},
      status: 'QUEUED',
    });

    const uploadedKeys: string[] = [];

    try {
      const products = [];

      for (const product of dto.products) {
        const images = [];

        for (
          let imageIndex = 0;
          imageIndex < product.images.length;
          imageIndex++
        ) {
          const sourceUrl = product.images[imageIndex];
          const downloaded = await this.downloadImage(sourceUrl);

          const storageKey = [
            'organizations',
            organization.id,
            'batches',
            batch.id,
            'offers',
            encodeURIComponent(product.offerId),
            `${imageIndex}-${randomUUID()}.${downloaded.extension}`,
          ].join('/');

          await this.minio.upload(
            storageKey,
            downloaded.buffer,
            downloaded.contentType,
          );

          uploadedKeys.push(storageKey);

          const job = await db.orm.public.ImageJob.create({
            batchId: batch.id,
            productOfferId: product.offerId,
            imageIndex,
            sourceUrl,
            storageKey,
            status: 'PENDING',
          });

          images.push({
            id: job.id,
            index: imageIndex,
            url: await this.minio.getDownloadUrl(storageKey),
          });
        }

        products.push({
          offerId: product.offerId,
          images,
        });
      }

      return {
        id: batch.id,
        status: batch.status,
        totalProducts: products.length,
        totalImages,
        products,
      };
    } catch (error) {
      await Promise.allSettled(
        uploadedKeys.map((key) => this.minio.remove(key)),
      );

      try {
        await db.orm.public.Batch
          .where({ id: batch.id })
          .delete();
      } catch {
      }

      throw error;
    }
  }

  // private async getAuth0Sub(token: string): Promise<string> {
  //   const domain = process.env['AUTH0_DOMAIN']
  //     ?.replace(/^https?:\/\//i, '')
  //     .replace(/\/+$/, '');

  //   if (!domain) {
  //     throw new InternalServerErrorException(
  //       'AUTH0_DOMAIN is not configured',
  //     );
  //   }

  //   let response: Response;

  //   try {
  //     response = await fetch(`https://${domain}/userinfo`, {
  //       headers: { Authorization: `Bearer ${token}` },
  //       signal: AbortSignal.timeout(10_000),
  //     });
  //   } catch {
  //     throw new BadGatewayException('Cannot connect to Auth0');
  //   }

  //   if (response.status === 401 || response.status === 403) {
  //     throw new UnauthorizedException('Invalid access token');
  //   }

  //   if (!response.ok) {
  //     throw new BadGatewayException('Auth0 userinfo request failed');
  //   }

  //   const user = (await response.json()) as { sub?: unknown };

  //   if (typeof user.sub !== 'string' || !user.sub) {
  //     throw new UnauthorizedException('Auth0 subject is missing');
  //   }

  //   return user.sub;
  // }

  private async downloadImage(sourceUrl: string): Promise<{
    buffer: Buffer;
    contentType: string;
    extension: string;
  }> {
    let url: URL;

    try {
      url = new URL(sourceUrl);
    } catch {
      throw new BadRequestException('Invalid image URL');
    }

    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new BadRequestException(
        'Image URLs must use HTTPS and cannot contain credentials',
      );
    }

    const allowedHosts = (
      process.env['IMAGE_URL_ALLOWED_HOSTS'] ?? 'a.allegroimg.allegrosandbox.pl'
    )
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);

    const hostname = url.hostname.toLowerCase();

    if (
      !allowedHosts.some(
        (host) => hostname === host || hostname.endsWith(`.${host}`),
      )
    ) {
      throw new BadRequestException('Image host is not allowed');
    }

    let response: Response;

    try {
      response = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new BadGatewayException('Cannot download image');
    }

    if (!response.ok) {
      throw new BadGatewayException(
        `Image server returned HTTP ${response.status}`,
      );
    }

    const contentType = (response.headers.get('content-type') ?? '')
      .split(';')[0]
      .trim()
      .toLowerCase();

    const extension = IMAGE_TYPES[contentType];

    if (!extension) {
      throw new BadRequestException('Unsupported image format');
    }

    const declaredSize = Number(
      response.headers.get('content-length') ?? 0,
    );

    if (declaredSize > MAX_IMAGE_BYTES) {
      throw new PayloadTooLargeException('Image exceeds 10 MB');
    }

    if (!response.body) {
      throw new BadGatewayException('Image response has no body');
    }

    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let size = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      const chunk = Buffer.from(value);
      size += chunk.length;

      if (size > MAX_IMAGE_BYTES) {
        await reader.cancel();
        throw new PayloadTooLargeException('Image exceeds 10 MB');
      }

      chunks.push(chunk);
    }

    return {
      buffer: Buffer.concat(chunks),
      contentType,
      extension,
    };
  }
}