import {
    BadGatewayException,
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
    OnModuleDestroy,
    PayloadTooLargeException,
} from '@nestjs/common';

import {
    mkdtemp,
    rm,
    writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

import {
    PixelSealEngineService,
    type PixelSealFootprintResult,
} from '../../businessLogic/processing/pixelseal-engine.service.ts';
import { MinioStorageService } from '../../businessLogic/minio/minio-storage.service.ts';
import { ImageDownloaderService } from '../../businessLogic/ingestion/image-downloader.service.ts';
import { ImageDownloadError } from '../../businessLogic/common/image-download.error.ts';
import { matchesImageSignature } from '../../businessLogic/common/image-types.ts';

import { OrganizationsService } from '../organizations/organizations.service.ts';
import { AllegroSessionService } from '../allegro-auth/session/allegro-session.service.ts';
import { localKeyForFileId } from '../local-images/local-image-source.ts';

import { VerifyWatermarkResponseDto } from './dto/verify-watermark.response.dto.ts';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const FOOTPRINT_JOB_TTL_MS = 60 * 60 * 1000;
const FOOTPRINT_CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

const MIME_EXTENSIONS: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
};

const SUPPORTED_EXTENSIONS = new Set(['jpg', 'png', 'webp']);

const LOCAL_LIBRARY_ID =
    /^local-server-([0-9a-f]{32}\.(?:jpg|png|webp))$/i;

export type FootprintJobStatus =
    | 'QUEUED'
    | 'RUNNING'
    | 'COMPLETED'
    | 'FAILED';

export interface FootprintJobView {
    jobId: string;
    status: FootprintJobStatus;
    error: string | null;
    result: PixelSealFootprintResult | null;
}

export interface FootprintUpload {
    buffer: Buffer;
    mimetype: string;
    size: number;
}

interface FootprintJob extends FootprintJobView {
    allegroUserId: number;
    createdAt: number;
}

@Injectable()
export class WatermarkVerificationService implements OnModuleDestroy {
    private readonly footprintJobs = new Map<string, FootprintJob>();

    private readonly footprintCleanupTimer: NodeJS.Timeout;

    constructor(
        private readonly pixelSeal: PixelSealEngineService,
        private readonly organizations: OrganizationsService,
        private readonly storage: MinioStorageService,
        private readonly allegroSessions: AllegroSessionService,
        private readonly imageDownloader: ImageDownloaderService,
    ) {
        this.footprintCleanupTimer = setInterval(
            () => this.removeExpiredFootprintJobs(),
            FOOTPRINT_CLEANUP_INTERVAL_MS,
        );

        this.footprintCleanupTimer.unref();
    }

    onModuleDestroy(): void {
        clearInterval(this.footprintCleanupTimer);
    }

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

    async startFootprintCheck(args: {
        allegroUserId: number;
        original: FootprintUpload | undefined;
        suspect: FootprintUpload | undefined;
        master: FootprintUpload | undefined;
        nulls?: number;
        threshold?: number;
    }): Promise<{ jobId: string }> {
        if (!args.original) {
            throw new BadRequestException('Original image is required.');
        }

        if (!args.suspect) {
            throw new BadRequestException('Suspect image is required.');
        }

        if (!process.env['WM_KEY']?.trim()) {
            throw new Error(
                'WM_KEY is not configured. Add WM_KEY to the backend .env file.',
            );
        }

        const original = this.validateFootprintImage(args.original, 'Original');
        const suspect = this.validateFootprintImage(args.suspect, 'Suspect');
        const master = args.master
            ? this.validateFootprintImage(args.master, 'Watermarked')
            : undefined;

        const hasActive = [...this.footprintJobs.values()].some(
            job =>
                job.allegroUserId === args.allegroUserId &&
                (job.status === 'QUEUED' || job.status === 'RUNNING'),
        );

        if (hasActive) {
            throw new ConflictException(
                'Another overlay check is still running. Wait for it to finish.',
            );
        }

        const organization = await this.organizations.findByAllegroUserId(
            args.allegroUserId,
        );

        if (!organization) {
            throw new NotFoundException(
                'No organization is linked to your account.',
            );
        }

        const workDir = await mkdtemp(join(tmpdir(), 'footprint-job-'));

        try {
            const originalPath = join(workDir, `original.${original.extension}`);
            const suspectPath = join(workDir, `suspect.${suspect.extension}`);
            const masterPath = master
                ? join(workDir, `master.${master.extension}`)
                : undefined;

            await writeFile(originalPath, original.buffer);
            await writeFile(suspectPath, suspect.buffer);

            if (master && masterPath) {
                await writeFile(masterPath, master.buffer);
            }

            const jobId = randomUUID();

            this.footprintJobs.set(jobId, {
                jobId,
                allegroUserId: args.allegroUserId,
                createdAt: Date.now(),
                status: 'QUEUED',
                error: null,
                result: null,
            });

            void this.runFootprintJob({
                jobId,
                workDir,
                organizationId: organization.id,
                originalPath,
                suspectPath,
                masterPath,
                nulls: args.nulls,
                threshold: args.threshold,
            });

            return { jobId };
        } catch (error) {
            await rm(workDir, { recursive: true, force: true })
                .catch(() => undefined);

            throw error;
        }
    }

    getFootprintJob(
        jobId: string,
        allegroUserId: number,
    ): FootprintJobView {
        const job = this.footprintJobs.get(jobId);

        if (!job || job.allegroUserId !== allegroUserId) {
            throw new NotFoundException('Overlay check job was not found.');
        }

        return {
            jobId: job.jobId,
            status: job.status,
            error: job.error,
            result: job.result,
        };
    }

    private async runFootprintJob(args: {
        jobId: string;
        workDir: string;
        organizationId: string;
        originalPath: string;
        suspectPath: string;
        masterPath: string | undefined;
        nulls: number | undefined;
        threshold: number | undefined;
    }): Promise<void> {
        const job = this.footprintJobs.get(args.jobId);

        if (!job) {
            await rm(args.workDir, { recursive: true, force: true })
                .catch(() => undefined);
            return;
        }

        job.status = 'RUNNING';

        try {
            job.result = await this.pixelSeal.footprint({
                organizationId: args.organizationId,
                originalPath: args.originalPath,
                suspectPath: args.suspectPath,
                masterPath: args.masterPath,
                nulls: args.nulls,
                threshold: args.threshold,
                jobId: args.jobId,
            });

            job.status = 'COMPLETED';
        } catch (error) {
            job.error = error instanceof Error
                ? error.message
                : 'The overlay check failed.';
            job.status = 'FAILED';
        } finally {
            await rm(args.workDir, { recursive: true, force: true })
                .catch(() => undefined);
        }
    }

    private validateFootprintImage(
        file: FootprintUpload,
        label: string,
    ): { buffer: Buffer; extension: string } {
        const extension = MIME_EXTENSIONS[file.mimetype.toLowerCase()];

        if (!extension) {
            throw new BadRequestException(
                `${label} image: only JPG, PNG and WebP are supported.`,
            );
        }

        if (!Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
            throw new BadRequestException(`${label} image is empty.`);
        }

        if (file.buffer.length > MAX_IMAGE_BYTES) {
            throw new PayloadTooLargeException(
                `${label} image exceeds the 10 MB limit.`,
            );
        }

        if (!matchesImageSignature(file.buffer, extension)) {
            throw new BadRequestException(
                `${label} image: the file content does not match its format.`,
            );
        }

        return { buffer: file.buffer, extension };
    }

    private removeExpiredFootprintJobs(): void {
        const now = Date.now();

        for (const [jobId, job] of this.footprintJobs) {
            const finished =
                job.status === 'COMPLETED' || job.status === 'FAILED';

            if (finished && now - job.createdAt > FOOTPRINT_JOB_TTL_MS) {
                this.footprintJobs.delete(jobId);
            }
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