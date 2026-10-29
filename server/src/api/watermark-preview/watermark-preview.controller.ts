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
import type { Response } from 'express';
import { AllegroAuthGuard } from '../allegro-auth/allegro-auth.guard.ts';
import { ImageDownloaderService } from '../../businessLogic/ingestion/image-downloader.service.ts';
import {
  applyWatermark,
  type WatermarkParams,
} from '../../businessLogic/processing/watermark.ts';

// Allow only known image-CDN hosts. NEVER fetch arbitrary user-supplied URLs
// from a public endpoint (SSRF). Extend with PREVIEW_ALLOWED_HOSTS if necessary.
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
  constructor(private readonly downloader: ImageDownloaderService) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  async preview(@Body() body: unknown, @Res() response: Response): Promise<void> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Invalid preview request');
    }

    const request = body as Record<string, unknown>;
    const imageUrl = assertImageUrl(request['imageUrl']);
    const rawConfig = request['watermarkConfig'];
    if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
      throw new BadRequestException('watermarkConfig must be an object');
    }

    // Same downloader as ingestion worker (10 MB limit, signature checks,
    // 15-second timeout and redirect rejection).
    let downloaded;
    try {
      downloaded = await this.downloader.download(imageUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not download image';
      throw new UnprocessableEntityException(message);
    }

    // Crucially: the exact same Sharp algorithm as Batch Processing.
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
