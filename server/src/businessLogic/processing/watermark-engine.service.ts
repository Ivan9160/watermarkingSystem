import { Injectable } from '@nestjs/common';
import { readFile, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { applyWatermark, type WatermarkParams } from './watermark.ts';

const EXT_FORMAT: Record<string, WatermarkParams['format']> = {
  '.jpg': 'jpeg',
  '.jpeg': 'jpeg',
  '.png': 'png',
  '.webp': 'webp',
};

@Injectable()
export class WatermarkEngineService {
  private readonly timeoutMs = Number(process.env['WATERMARK_ENGINE_TIMEOUT_MS'] ?? 60_000);

  async apply(params: {
    inputPath: string;
    outputPath: string;
    config: unknown;
  }): Promise<{ stdout: string; stderr: string }> {
    const input = await readFile(params.inputPath);
    const watermark = this.toParams(params.config);

    // формат результату має збігатися з розширенням outputPath, якщо він не заданий явно
    watermark.format ??= EXT_FORMAT[extname(params.outputPath).toLowerCase()] ?? null;

    const { buffer, width, height, format } = await this.withTimeout(
      applyWatermark(input, watermark),
    );
    await writeFile(params.outputPath, buffer);

    return { stdout: `OK ${width}x${height} (${format})`, stderr: '' };
  }

  /** Бере з config (рядок batches у БД) лише відомі поля; решту валідує applyWatermark. */
  private toParams(config: unknown): WatermarkParams {
    if (!config || typeof config !== 'object') return {};
    const c = config as Record<string, unknown>;
    return {
      text: c['text'] as string | undefined,
      mode: c['mode'] as WatermarkParams['mode'],
      position: c['position'] as WatermarkParams['position'],
      opacity: c['opacity'] as number | undefined,
      scale: c['scale'] as number | undefined,
      margin: c['margin'] as number | undefined,
      color: c['color'] as string | undefined,
      angle: c['angle'] as number | undefined,
      spacing: c['spacing'] as number | undefined,
      stagger: c['stagger'] as boolean | undefined,
      shadow: c['shadow'] as boolean | undefined,
      format: c['format'] as WatermarkParams['format'],
      quality: c['quality'] as number | undefined,
    };
  }

  private withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Watermark timed out after ${this.timeoutMs} ms`)),
        this.timeoutMs,
      );
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }
}