import { Injectable } from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { copyFile, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

import { StorageService } from './storage.service.ts';


@Injectable()
export class LocalStorageService extends StorageService {
  readonly root: string;
  private readonly secret: string;
  private readonly ttlSeconds: number;
  private readonly baseUrl: string;

  constructor() {
    super();
    this.root = resolve(process.env['STORAGE_ROOT'] ?? join(process.cwd(), 'storage'));
    this.ttlSeconds = Number(process.env['FILES_URL_EXPIRY_SECONDS'] ?? 900);
    this.baseUrl = (process.env['APP_PUBLIC_URL'] ?? 'http://localhost:3000').replace(/\/+$/, '');

    const secret = process.env['FILES_SIGNING_SECRET'];
    if (!secret) throw new Error('FILES_SIGNING_SECRET is not configured');
    this.secret = secret;
  }

  resolvePath(key: string): string {
    const full = resolve(this.root, key);
    if (!full.startsWith(this.root + sep)) throw new Error('Invalid storage key');
    return full;
  }

  async upload(key: string, buffer: Buffer, _contentType: string): Promise<void> {
    await this.place(key, (tmp) => writeFile(tmp, buffer));
  }

  async uploadFile(key: string, filePath: string, _contentType: string): Promise<void> {
    await this.place(key, (tmp) => copyFile(filePath, tmp));
  }

  async downloadToFile(key: string, filePath: string): Promise<void> {
    await copyFile(this.resolvePath(key), filePath);
  }

  async remove(key: string): Promise<void> {
    await rm(this.resolvePath(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      return (await stat(this.resolvePath(key))).isFile();
    } catch {
      return false;
    }
  }

  async getDownloadUrl(key: string): Promise<string> {
    const expires = Math.floor(Date.now() / 1000) + this.ttlSeconds;
    const qs = new URLSearchParams({
      key,
      expires: String(expires),
      sig: this.sign(key, expires),
    });
    return `${this.baseUrl}/files?${qs.toString()}`;
  }

  verify(key?: string, expires?: string, sig?: string): boolean {
    if (!key || !expires || !sig) return false;
    const exp = Number(expires);
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;

    const expected = Buffer.from(this.sign(key, exp), 'hex');
    const given = Buffer.from(sig, 'hex');
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  private sign(key: string, expires: number): string {
    return createHmac('sha256', this.secret).update(`${key}\n${expires}`).digest('hex');
  }

  private async place(key: string, write: (tmpPath: string) => Promise<void>): Promise<void> {
    const target = this.resolvePath(key);
    await mkdir(dirname(target), { recursive: true });
    const tmp = `${target}.${randomUUID()}.tmp`;
    try {
      await write(tmp);
      await rename(tmp, target);
    } catch (e) {
      await rm(tmp, { force: true });
      throw e;
    }
  }
}