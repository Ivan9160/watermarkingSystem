var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { BadGatewayException, BadRequestException, Injectable, NotFoundException, PayloadTooLargeException, } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { db } from "../../prisma/db.js";
import { MinioStorageService } from "../../minio/minio-storage.service.js";
const MAX_IMAGES_PER_BATCH = 100;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/avif': 'avif',
};
let BatchesService = class BatchesService {
    minio;
    constructor(minio) {
        this.minio = minio;
    }
    async create(allegroUserId, dto) {
        const totalImages = dto.products.reduce((total, product) => total + product.images.length, 0);
        if (totalImages > MAX_IMAGES_PER_BATCH) {
            throw new BadRequestException(`Maximum ${MAX_IMAGES_PER_BATCH} images per batch`);
        }
        const offerIds = dto.products.map((product) => product.offerId);
        if (new Set(offerIds).size !== offerIds.length) {
            throw new BadRequestException('Each offerId must be unique in a batch');
        }
        const organization = await db.orm.public.Organization
            .where({ allegroUserId: allegroUserId })
            .first();
        if (!organization) {
            throw new NotFoundException('Create an organization before creating a batch');
        }
        const batch = await db.orm.public.Batch.create({
            organizationId: organization.id,
            watermarkConfig: dto.watermarkConfig ?? {},
            status: 'QUEUED',
        });
        const uploadedKeys = [];
        try {
            const products = [];
            for (const product of dto.products) {
                const images = [];
                for (let imageIndex = 0; imageIndex < product.images.length; imageIndex++) {
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
                    await this.minio.upload(storageKey, downloaded.buffer, downloaded.contentType);
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
        }
        catch (error) {
            await Promise.allSettled(uploadedKeys.map((key) => this.minio.remove(key)));
            try {
                await db.orm.public.Batch
                    .where({ id: batch.id })
                    .delete();
            }
            catch {
            }
            throw error;
        }
    }
    async downloadImage(sourceUrl) {
        let url;
        try {
            url = new URL(sourceUrl);
        }
        catch {
            throw new BadRequestException('Invalid image URL');
        }
        if (url.protocol !== 'https:' || url.username || url.password) {
            throw new BadRequestException('Image URLs must use HTTPS and cannot contain credentials');
        }
        const allowedHosts = (process.env['IMAGE_URL_ALLOWED_HOSTS'] ?? 'a.allegroimg.allegrosandbox.pl')
            .split(',')
            .map((host) => host.trim().toLowerCase())
            .filter(Boolean);
        const hostname = url.hostname.toLowerCase();
        if (!allowedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
            throw new BadRequestException('Image host is not allowed');
        }
        let response;
        try {
            response = await fetch(url, {
                redirect: 'error',
                signal: AbortSignal.timeout(15_000),
            });
        }
        catch {
            throw new BadGatewayException('Cannot download image');
        }
        if (!response.ok) {
            throw new BadGatewayException(`Image server returned HTTP ${response.status}`);
        }
        const contentType = (response.headers.get('content-type') ?? '')
            .split(';')[0]
            .trim()
            .toLowerCase();
        const extension = IMAGE_TYPES[contentType];
        if (!extension) {
            throw new BadRequestException('Unsupported image format');
        }
        const declaredSize = Number(response.headers.get('content-length') ?? 0);
        if (declaredSize > MAX_IMAGE_BYTES) {
            throw new PayloadTooLargeException('Image exceeds 10 MB');
        }
        if (!response.body) {
            throw new BadGatewayException('Image response has no body');
        }
        const reader = response.body.getReader();
        const chunks = [];
        let size = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
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
};
BatchesService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [MinioStorageService])
], BatchesService);
export { BatchesService };
//# sourceMappingURL=batches.service.js.map