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
    return this.client.presignedGetObject(this.bucket, key, this.urlExpirySeconds);
  }


  /** Test object ownership/existence before referencing a local file in a job. */
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

  /** Read a private upload. The application serves it via authenticated same-origin URL. */
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

  /** List user-scoped private uploads; do not expose other users' objects. */
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
