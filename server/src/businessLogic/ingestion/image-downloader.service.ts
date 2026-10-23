import { Injectable } from '@nestjs/common';

import { ImageDownloadError } from '../common/image-download.error.ts';
import { IMAGE_TYPES, matchesImageSignature } from '../common/image-types.ts';
import { parseAllowedImageUrl } from '../common/image-url.policy.ts';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export interface DownloadedImage {
  buffer: Buffer;
  contentType: string;
  extension: string;
}

@Injectable()
export class ImageDownloaderService {
  async download(sourceUrl: string): Promise<DownloadedImage> {
    const url = parseAllowedImageUrl(sourceUrl);

    let response: Response;
    try {
      response = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new ImageDownloadError('Cannot download image', true);
    }

    if (!response.ok) {
      const transient = response.status >= 500 || response.status === 429;
      throw new ImageDownloadError(`Image server returned HTTP ${response.status}`, transient);
    }

    const contentType = (response.headers.get('content-type') ?? '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    const extension = IMAGE_TYPES[contentType];
    if (!extension) throw new ImageDownloadError('Unsupported image format');

    if (Number(response.headers.get('content-length') ?? 0) > MAX_IMAGE_BYTES) {
      throw new ImageDownloadError('Image exceeds 10 MB');
    }
    if (!response.body) throw new ImageDownloadError('Image response has no body', true);

    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let size = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_IMAGE_BYTES) {
          await reader.cancel();
          throw new ImageDownloadError('Image exceeds 10 MB');
        }
        chunks.push(Buffer.from(value));
      }
    } catch (e) {
      if (e instanceof ImageDownloadError) throw e;
      throw new ImageDownloadError('Image download interrupted', true);
    }

    const buffer = Buffer.concat(chunks);
    if (!matchesImageSignature(buffer, extension)) {
      throw new ImageDownloadError('File content does not match declared image type');
    }

    return { buffer, contentType, extension };
  }
}
