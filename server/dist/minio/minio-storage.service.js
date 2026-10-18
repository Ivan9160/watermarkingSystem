var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Injectable } from '@nestjs/common';
import { Client } from 'minio';
let MinioStorageService = class MinioStorageService {
    client;
    bucket;
    urlExpirySeconds;
    constructor() {
        this.bucket = process.env['MINIO_BUCKET'] ?? 'watermark-images';
        this.urlExpirySeconds = Number(process.env['MINIO_URL_EXPIRY_SECONDS'] ?? 86400);
        this.client = new Client({
            endPoint: process.env['MINIO_ENDPOINT'] ?? '127.0.0.1',
            port: Number(process.env['MINIO_PORT'] ?? 9000),
            useSSL: process.env['MINIO_USE_SSL'] === 'true',
            accessKey: process.env['MINIO_ACCESS_KEY'] ?? 'minioadmin',
            secretKey: process.env['MINIO_SECRET_KEY'] ?? 'minioadmin',
        });
    }
    async onModuleInit() {
        const exists = await this.client.bucketExists(this.bucket);
        if (!exists) {
            await this.client.makeBucket(this.bucket, 'us-east-1');
        }
    }
    async upload(objectKey, buffer, contentType) {
        await this.client.putObject(this.bucket, objectKey, buffer, buffer.length, {
            'Content-Type': contentType,
        });
    }
    async getDownloadUrl(objectKey) {
        return this.client.presignedGetObject(this.bucket, objectKey, this.urlExpirySeconds);
    }
    async remove(objectKey) {
        await this.client.removeObject(this.bucket, objectKey);
    }
};
MinioStorageService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [])
], MinioStorageService);
export { MinioStorageService };
//# sourceMappingURL=minio-storage.service.js.map