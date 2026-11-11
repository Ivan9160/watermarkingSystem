
import {
    BadGatewayException,
    BadRequestException,
    Injectable,
    NotFoundException,
    PayloadTooLargeException,
} from '@nestjs/common';

import {
    mkdtemp,
    rm,
    writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';

import { PixelSealEngineService } from '../../businessLogic/processing/pixelseal-engine.service.ts';
import { MinioStorageService } from '../../businessLogic/minio/minio-storage.service.ts';
import { ImageDownloaderService } from '../../businessLogic/ingestion/image-downloader.service.ts';
import { ImageDownloadError } from '../../businessLogic/common/image-download.error.ts';
import { matchesImageSignature } from '../../businessLogic/common/image-types.ts';

import { OrganizationsService } from '../organizations/organizations.service.ts';
import { AllegroSessionService } from '../allegro-auth/session/allegro-session.service.ts';
import { localKeyForFileId } from '../local-images/local-image-source.ts';

import { VerifyWatermarkResponseDto } from './dto/verify-watermark.response.dto.ts';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const MIME_EXTENSIONS: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
};

const SUPPORTED_EXTENSIONS = new Set(['jpg', 'png', 'webp']);

const LOCAL_LIBRARY_ID =
    /^local-server-([0-9a-f]{32}\.(?:jpg|png|webp))$/i;

@Injectable()
export class WatermarkVerificationService {
    constructor(
        private readonly pixelSeal: PixelSealEngineService,
        private readonly organizations: OrganizationsService,
        private readonly storage: MinioStorageService,
        private readonly allegroSessions: AllegroSessionService,
        private readonly imageDownloader: ImageDownloaderService,
    ) {}

    async verifyUploadedImage(args: {
        buffer: Buffer;
        mimetype: string;
        allegroUserId: number;
    }): Promise<VerifyWatermarkResponseDto> {
        const extension = MIME_EXTENSIONS[args.mimetype.toLowerCase()];

        if (!extension) {
            throw new BadRequestException(
                'Only JPG, PNG and WebP images are supported.',
            );
        }

        return this.verifyBuffer(
            args.buffer,
            extension,
            args.allegroUserId,
        );
    }

    async verifyLibraryImage(args: {
        imageId: string;
        allegroUserId: number;
        allegroSessionId: string;
    }): Promise<VerifyWatermarkResponseDto> {
        const localMatch = LOCAL_LIBRARY_ID.exec(args.imageId);

        if (localMatch) {
            const capturedFileId = localMatch[1];

            if (!capturedFileId) {
                throw new NotFoundException(
                    'The selected local image was not found.',
                );
            }

            const fileId = capturedFileId.toLowerCase();
            const key = localKeyForFileId(args.allegroUserId, fileId);

            if (!key || !(await this.storage.exists(key))) {
                throw new NotFoundException(
                    'The selected local image was not found in your library.',
                );
            }

            const buffer = await this.readLocalImage(key);
            const extension = extname(fileId).slice(1).toLowerCase();

            return this.verifyBuffer(
                buffer,
                extension,
                args.allegroUserId,
            );
        }

        if (!args.imageId.startsWith('allegro-')) {
            throw new NotFoundException(
                'The selected image was not found in your library.',
            );
        }

        const library = await this.allegroSessions.getImages(
            args.allegroSessionId,
        );

        const image = library.items.find(
            item => item.id === args.imageId,
        );

        if (!image) {
            throw new NotFoundException(
                'The selected image was not found in the authenticated Allegro library.',
            );
        }

        try {
            const downloaded = await this.imageDownloader.download(image.src);

            return this.verifyBuffer(
                downloaded.buffer,
                downloaded.extension,
                args.allegroUserId,
            );
        } catch (error) {
            if (error instanceof ImageDownloadError) {
                throw new BadGatewayException(
                    `Could not retrieve the selected Allegro image: ${error.message}`,
                );
            }

            throw error;
        }
    }

    private async readLocalImage(key: string): Promise<Buffer> {
        try {
            return await this.storage.getBuffer(key);
        } catch (error) {
            if (
                error instanceof Error &&
                /exceeds size limit/i.test(error.message)
            ) {
                throw new PayloadTooLargeException(
                    'The selected image exceeds the 10 MB limit.',
                );
            }

            throw error;
        }
    }

    private async verifyBuffer(
        buffer: Buffer,
        extension: string,
        allegroUserId: number,
    ): Promise<VerifyWatermarkResponseDto> {
        const normalizedExtension = extension
            .replace(/^\./, '')
            .toLowerCase();

        if (!SUPPORTED_EXTENSIONS.has(normalizedExtension)) {
            throw new BadRequestException(
                'Only JPG, PNG and WebP images are supported.',
            );
        }

        if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
            throw new BadRequestException('The image file is empty.');
        }

        if (buffer.length > MAX_IMAGE_BYTES) {
            throw new PayloadTooLargeException(
                'The image exceeds the 10 MB limit.',
            );
        }

        if (!matchesImageSignature(buffer, normalizedExtension)) {
            throw new BadRequestException(
                'The file content does not match its image format.',
            );
        }

        if (!process.env['WM_KEY']?.trim()) {
            throw new Error(
                'WM_KEY is not configured. Add WM_KEY to the backend .env file.',
            );
        }

        const workDir = await mkdtemp(
            join(tmpdir(), 'watermark-verify-'),
        );

        try {
            const inputPath = join(
                workDir,
                `input.${normalizedExtension}`,
            );

            await writeFile(inputPath, buffer);

            const result = await this.pixelSeal.verify({
                inputPath,
            });

            return this.buildResponse(result, allegroUserId);
        } finally {
            await rm(workDir, {
                recursive: true,
                force: true,
            }).catch(() => undefined);
        }
    }

    private async buildResponse(
        result: Awaited<ReturnType<PixelSealEngineService['verify']>>,
        allegroUserId: number,
    ): Promise<VerifyWatermarkResponseDto> {
        const response = new VerifyWatermarkResponseDto();

        response.found = result.found === true;

        response.image = {
            width: result.width ?? 0,
            height: result.height ?? 0,
        };

        // Internal details are hidden by default.
        response.organization = null;
        response.ownership = null;
        response.watermark = null;

        if (!result.found || !result.id) {
            const hasInvalidSignature =
                result.tagDistance !== null &&
                result.tagDistance !== undefined;

            response.status = hasInvalidSignature
                ? 'invalid_signature'
                : 'not_detected';

            return response;
        }

        const organization =
            await this.organizations.findByInvisibleWatermarkId(result.id);

        // The watermark is valid, but its organization is not registered.
        if (!organization) {
            response.status = 'unknown_organization';
            return response;
        }

        const ownership =
            organization.allegroUserId === allegroUserId
                ? 'own'
                : 'other';

        response.status = 'verified';
        response.ownership = ownership;

        response.organization = {
            name: organization.name,
        };

        // Reveal technical details only to the owning organization.
        if (ownership === 'own') {
            response.watermark = {
                id: result.id,
                tagDistance: result.tagDistance ?? null,
            };

            if (result.jobId) {
                response.verificationId = result.jobId;
            }
        }

        return response;
    }
}
