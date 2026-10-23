import { Injectable, OnModuleInit } from '@nestjs/common';
import { Client } from 'minio';

@Injectable()
export class MinioStorageService implements OnModuleInit {
  private readonly client: Client;
  private readonly bucket: string;
  private readonly urlExpirySeconds: number;

  constructor() {
    this.bucket = process.env['MINIO_BUCKET'] ?? 'watermark-images';
    // short-lived signed URLs (за замовчуванням 15 хв)
    this.urlExpirySeconds = Number(process.env['MINIO_URL_EXPIRY_SECONDS'] ?? 900);

    this.client = new Client({
      endPoint: process.env['MINIO_ENDPOINT'] ?? '127.0.0.1',
      port: Number(process.env['MINIO_PORT'] ?? 9000),
      useSSL: process.env['MINIO_USE_SSL'] === 'true',
      accessKey: process.env['MINIO_ACCESS_KEY'] ?? 'minioadmin',
      secretKey: process.env['MINIO_SECRET_KEY'] ?? 'minioadmin',
    });
  }

  async onModuleInit(): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        const exists = await this.client.bucketExists(this.bucket);
        if (!exists) await this.client.makeBucket(this.bucket, 'us-east-1');
        return;
      } catch (e: any) {
        if (attempt >= 10 || e?.code !== 'ECONNREFUSED') throw e;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  async upload(key: string, buffer: Buffer, contentType: string): Promise<void> {
    await this.client.putObject(this.bucket, key, buffer, buffer.length, {
      'Content-Type': contentType,
    });
  }

  async uploadFile(key: string, filePath: string, contentType: string): Promise<void> {
    await this.client.fPutObject(this.bucket, key, filePath, {
      'Content-Type': contentType,
    });
  }

  async downloadToFile(key: string, filePath: string): Promise<void> {
    await this.client.fGetObject(this.bucket, key, filePath);
  }

  async getDownloadUrl(key: string): Promise<string> {
    return this.client.presignedGetObject(this.bucket, key, this.urlExpirySeconds);
  }

  async remove(key: string): Promise<void> {
    await this.client.removeObject(this.bucket, key);
  }
}
