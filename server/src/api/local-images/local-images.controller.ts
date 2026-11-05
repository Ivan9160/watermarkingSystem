import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { AllegroAuthGuard } from '../allegro-auth/allegro-auth.guard.ts';
import { MinioStorageService } from '../../businessLogic/minio/minio-storage.service.ts';
import { matchesImageSignature } from '../../businessLogic/common/image-types.ts';
import { LOCAL_GROUP_PATTERN, localKeyForFileId } from './local-image-source.ts';

const MAX_BYTES = 10 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

type AuthRequest = Request & { allegroUser: { id: number } };
type ImageUpload = { buffer: Buffer; mimetype: string; size: number; originalname: string };

@Controller('local-images')
@UseGuards(AllegroAuthGuard)
export class LocalImagesController {
  constructor(private readonly storage: MinioStorageService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES, files: 1 } }))
  async upload(
    @Req() req: AuthRequest,
    @UploadedFile() file: ImageUpload | undefined,
    @Body('offerId') offerId: string | undefined,
  ) {
    if (!file || !file.buffer || file.size === 0 || file.size > MAX_BYTES) {
      throw new BadRequestException('Select an image smaller than 10 MB');
    }
    const contentType = file.mimetype?.toLowerCase();
    const ext = EXTENSIONS[contentType];
    if (!ext || !matchesImageSignature(file.buffer, ext)) {
      throw new BadRequestException('Only genuine JPG, PNG and WebP images are accepted');
    }
    if (!offerId || !LOCAL_GROUP_PATTERN.test(offerId)) {
      throw new BadRequestException('Invalid local image group ID');
    }
    const fileId = `${randomUUID().replace(/-/g, '')}.${ext}`;
    const key = localKeyForFileId(req.allegroUser.id, fileId);
    if (!key) throw new BadRequestException('Invalid user ID');

    // Private RustFS object, not a public image-hosting link.
    await this.storage.upload(key, file.buffer, contentType, {
      'X-Amz-Meta-Original-Name': encodeURIComponent(file.originalname.slice(0, 150)),
      'X-Amz-Meta-Local-Group': offerId,
    });

    return {
      sourceRef: `waterm-local:${fileId}`,
      src: `/api/local-images/${fileId}`,
      offerId,
      filename: file.originalname.slice(0, 200),
      mimeType: contentType,
      sizeBytes: file.size,
    };
  }

  @Get()
  async list(@Req() req: AuthRequest) {
    const prefix = `local-uploads/${req.allegroUser.id}/`;
    const entries = await this.storage.listObjects(prefix);
    const items = await Promise.all(entries.map(async entry => {
      const fileId = entry.key.slice(prefix.length);
      const sourceRef = `waterm-local:${fileId}`;
      if (!localKeyForFileId(req.allegroUser.id, fileId)) return null;
      const originalName = entry.metadata['x-amz-meta-original-name'];
      const group = entry.metadata['x-amz-meta-local-group'];
      let filename = fileId;
      try { if (originalName) filename = decodeURIComponent(originalName); } catch { /* Keep fallback. */ }
      return {
        id: `local-server-${fileId}`,
        source: 'local' as const,
        sourceRef,
        filename,
        src: `/api/local-images/${fileId}`,
        offerId: group && LOCAL_GROUP_PATTERN.test(group) ? group : `LOCAL-${fileId.slice(0, 12).toUpperCase()}`,
        productName: 'PC upload',
        sizeBytes: entry.size,
        mimeType: fileId.endsWith('.png') ? 'image/png' : fileId.endsWith('.webp') ? 'image/webp' : 'image/jpeg',
        uploadedAt: entry.lastModified.toISOString(),
        uploadStatus: 'ready' as const,
      };
    }));
    return { items: items.filter(item => item !== null) };
  }

  @Delete(':fileId')
  async delete(@Req() req: AuthRequest, @Param('fileId') fileId: string) {
    const key = localKeyForFileId(req.allegroUser.id, fileId);
    if (!key || !(await this.storage.exists(key))) {
      throw new NotFoundException('Local image not found');
    }
    await this.storage.remove(key);
    return { removed: true };
  }

  @Get(':fileId')
  async image(
    @Req() req: AuthRequest,
    @Param('fileId') fileId: string,
    @Res() res: Response,
  ): Promise<void> {
    const key = localKeyForFileId(req.allegroUser.id, fileId);
    if (!key || !(await this.storage.exists(key))) {
      throw new NotFoundException('Local image not found');
    }
    const data = await this.storage.getBuffer(key);
    const mime = fileId.endsWith('.png') ? 'image/png'
      : fileId.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', String(data.byteLength));
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(data);
  }
}
