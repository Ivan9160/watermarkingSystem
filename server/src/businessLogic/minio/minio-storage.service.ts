import { Injectable, OnModuleInit } from '@nestjs/common';
import { Client } from 'minio';

@Injectable()
export class MinioStorageService implements OnModuleInit {
  private readonly client: Client;
  private readonly signer: Client;
  private readonly publicPrefix: string;
  private readonly bucket: string;
  private readonly urlExpirySeconds: number;

  constructor() {
    this.bucket = process.env['MINIO_BUCKET'] ?? 'watermark-images';
    this.urlExpirySeconds = Number(process.env['MINIO_URL_EXPIRY_SECONDS'] ?? 900);

    const accessKey = process.env['MINIO_ACCESS_KEY'] ?? 'minioadmin';
    const secretKey = process.env['MINIO_SECRET_KEY'] ?? 'minioadmin';

    this.client = new Client({
      endPoint: process.env['MINIO_ENDPOINT'] ?? '127.0.0.1',
      port: Number(process.env['MINIO_PORT'] ?? 9000),
      useSSL: process.env['MINIO_USE_SSL'] === 'true',
      accessKey,
      secretKey,
    });

    const publicUrl = process.env['MINIO_PUBLIC_URL'];
    if (publicUrl) {
      const u = new URL(publicUrl);
      const useSSL = u.protocol === 'https:';
      this.publicPrefix = u.pathname.replace(/\/+$/, ''); 
      this.signer = new Client({
        endPoint: u.hostname,
        port: u.port ? Number(u.port) : useSSL ? 443 : 80,
        useSSL,
        accessKey,
        secretKey,
        region: process.env['MINIO_REGION'] ?? 'us-east-1',
      });
    } else {
      this.signer = this.client;
      this.publicPrefix = '';
    }
  }

  async onModuleInit(): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        const exists = await this.client.bucketExists(this.bucket);
        if (!exists) await this.client.makeBucket(this.bucket, 'us-east-1');

        const policy = {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { AWS: ['*'] },
              Action: ['s3:GetObject'],
              Resource: [`arn:aws:s3:::${this.bucket}/*`],
            },
          ],
        };
        await this.client.setBucketPolicy(this.bucket, JSON.stringify(policy));

        return;
      } catch (e: any) {
        if (attempt >= 10 || e?.code !== 'ECONNREFUSED') throw e;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  async upload(key: string, buffer: Buffer, contentType: string, extraMetadata: Record<string, string> = {}): Promise<void> {
    await this.client.putObject(this.bucket, key, buffer, buffer.length, {
      'Content-Type': contentType,
      ...extraMetadata,
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
    const publicUrl = process.env['MINIO_PUBLIC_URL'];
    if (publicUrl) {
      return `${publicUrl.replace(/\/+$/, '')}/${this.bucket}/${encodeURI(key)}`;
    }
    return this.client.presignedGetObject(this.bucket, key, this.urlExpirySeconds);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.statObject(this.bucket, key);
      return true;
    } catch (error: unknown) {
      const e = error as { code?: string; statusCode?: number };
      if (e.statusCode === 404 || ['NotFound', 'NoSuchKey', 'NoSuchObject'].includes(e.code ?? '')) return false;
      throw error;
    }
  }

  async getBuffer(key: string): Promise<Buffer> {
    const stream = await this.client.getObject(this.bucket, key);
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const part of stream) {
      const buf = Buffer.from(part);
      total += buf.length;
      if (total > 10 * 1024 * 1024) throw new Error('Uploaded image exceeds size limit');
      chunks.push(buf);
    }
    return Buffer.concat(chunks);
  }

  async listObjects(prefix: string): Promise<Array<{
    key: string; size: number; lastModified: Date; metadata: Record<string, string>;
  }>> {
    const rows: Array<{ key: string; size: number; lastModified: Date }> = [];
    await new Promise<void>((resolve, reject) => {
      const stream = this.client.listObjectsV2(this.bucket, prefix, true);
      stream.on('data', (entry: { name?: string; size?: number; lastModified?: Date }) => {
        if (entry.name && rows.length < 300) {
          rows.push({ key: entry.name, size: entry.size ?? 0,
            lastModified: entry.lastModified ? new Date(entry.lastModified) : new Date() });
        }
      });
      stream.on('error', reject);
      stream.on('end', resolve);
    });
    const result = await Promise.all(rows.map(async entry => {
      const stat = await this.client.statObject(this.bucket, entry.key);
      const metadata = Object.fromEntries(
        Object.entries(stat.metaData ?? {}).map(([key, value]) => [key.toLowerCase(), String(value)]),
      );
      return { ...entry, metadata };
    }));
    return result.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
  }

  async remove(key: string): Promise<void> {
    await this.client.removeObject(this.bucket, key);
  }
}
