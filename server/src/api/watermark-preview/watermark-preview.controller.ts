import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UnprocessableEntityException,
  UseGuards,
  Res,
} from '@nestjs/common';
import { Req } from '@nestjs/common';
import type { Request } from 'express';
import { MinioStorageService } from '../../businessLogic/minio/minio-storage.service.ts';
import { isLocalRef, localKeyFor } from '../local-images/local-image-source.ts';
import type { Response } from 'express';
import { AllegroAuthGuard } from '../allegro-auth/allegro-auth.guard.ts';
import { ImageDownloaderService } from '../../businessLogic/ingestion/image-downloader.service.ts';
import {
  applyWatermark,
  type WatermarkParams,
} from '../../businessLogic/processing/watermark.ts';

const DEFAULT_HOSTS = 'a.allegroimg.allegrosandbox.pl,a.allegroimg.pl,a.allegroimg.com';

function assertImageUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 4096) {
    throw new BadRequestException('A valid Allegro image URL is required');
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BadRequestException('Invalid image URL');
  }

  const allowedHosts = new Set(
    (process.env['PREVIEW_ALLOWED_HOSTS'] ?? DEFAULT_HOSTS)
      .split(',')
      .map(host => host.trim().toLowerCase())
      .filter(Boolean),
  );

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    !allowedHosts.has(url.hostname.toLowerCase())
  ) {
    throw new BadRequestException('Preview accepts HTTPS images from approved Allegro hosts only');
  }
  return url.toString();
}

@Controller('watermarks')
@UseGuards(AllegroAuthGuard)
export class WatermarkPreviewController {
  constructor(private readonly downloader: ImageDownloaderService, private readonly storage: MinioStorageService) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  async preview(@Body() body: unknown, @Res() response: Response, @Req() req: Request & { allegroUser: { id: number } }): Promise<void> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Invalid preview request');
    }

    const request = body as Record<string, unknown>;
    const rawImage = request['imageUrl'];
    const localKey = typeof rawImage === 'string' && isLocalRef(rawImage)
      ? localKeyFor(req.allegroUser.id, rawImage) : null;
    if (typeof rawImage !== 'string' || (isLocalRef(rawImage) && !localKey)) {
      throw new BadRequestException('Invalid local image reference');
    }
    const imageUrl = localKey ? null : assertImageUrl(rawImage);
    const rawConfig = request['watermarkConfig'];
    if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
      throw new BadRequestException('watermarkConfig must be an object');
    }

    let downloaded;
    try {
      if (localKey) {
        if (!(await this.storage.exists(localKey))) throw new Error('Local image missing');
        const data = await this.storage.getBuffer(localKey);
        if (data.length > 10 * 1024 * 1024) throw new Error('Image exceeds 10 MB');
        downloaded = { buffer: data };
      } else {
        downloaded = await this.downloader.download(imageUrl!);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not download image';
      throw new UnprocessableEntityException(message);
    }

    let result;
    try {
      result = await applyWatermark(downloaded.buffer, rawConfig as WatermarkParams);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Watermark processing failed';
      throw new UnprocessableEntityException(message);
    }

    response.setHeader('Content-Type', `image/${result.format}`);
    response.setHeader('Content-Length', String(result.buffer.length));
    response.setHeader('Cache-Control', 'no-store');
    response.status(200).send(result.buffer);
  }
}
