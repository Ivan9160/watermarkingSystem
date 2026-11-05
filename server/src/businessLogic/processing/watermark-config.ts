import { BadRequestException } from '@nestjs/common';

export interface VisibleWatermarkConfig {
  [key: string]: unknown;
}

export interface InvisibleWatermarkConfig {
  method?: 'pixelseal';
  /** Exactly 10 hexadecimal characters. */  id: string;
  /** Use per-ImageJob IDs (keeps original 'id' fallback contract intact). */
  idStrategy?: 'per-image';
  /** Optional selector for WM_KEY_<KEYID>. */
  keyId?: string;
  selfCheck?: boolean;
}

export interface BatchWatermarkConfig {
  applyVisibleWatermark: boolean;
  visibleWatermarkConfig?: VisibleWatermarkConfig;
  applyInvisibleWatermark: boolean;
  invisibleWatermarkConfig?: InvisibleWatermarkConfig;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value);
}

export function assertBatchWatermarkConfig(
  value: unknown,
): asserts value is BatchWatermarkConfig {
  if (!isRecord(value)) {
    throw new BadRequestException(
      'watermarkConfig must be a JSON object.',
    );
  }

  if (typeof value['applyVisibleWatermark'] !== 'boolean') {
    throw new BadRequestException(
      'watermarkConfig.applyVisibleWatermark must be a boolean.',
    );
  }

  if (typeof value['applyInvisibleWatermark'] !== 'boolean') {
    throw new BadRequestException(
      'watermarkConfig.applyInvisibleWatermark must be a boolean.',
    );
  }

  const applyVisible = value['applyVisibleWatermark'];
  const applyInvisible = value['applyInvisibleWatermark'];

  if (!applyVisible && !applyInvisible) {
    throw new BadRequestException(
      'Enable at least one watermark: applyVisibleWatermark or applyInvisibleWatermark.',
    );
  }

  if (
    applyVisible &&
    !isRecord(value['visibleWatermarkConfig'])
  ) {
    throw new BadRequestException(
      'watermarkConfig.visibleWatermarkConfig must be an object when applyVisibleWatermark is true.',
    );
  }

  if (applyInvisible) {
    const invisible = value['invisibleWatermarkConfig'];

    if (!isRecord(invisible)) {
      throw new BadRequestException(
        'watermarkConfig.invisibleWatermarkConfig must be an object when applyInvisibleWatermark is true.',
      );
    }

    const method = invisible['method'];

    if (method !== undefined && method !== 'pixelseal') {
      throw new BadRequestException(
        'watermarkConfig.invisibleWatermarkConfig.method must be "pixelseal".',
      );
    }

    const id = invisible['id'];

    if (
      typeof id !== 'string' ||
      !/^[0-9a-fA-F]{10}$/.test(id)
    ) {
      throw new BadRequestException(
        'watermarkConfig.invisibleWatermarkConfig.id must contain exactly 10 hexadecimal characters.',
      );
    }

    const idStrategy = invisible['idStrategy'];
    if (idStrategy !== undefined && idStrategy !== 'per-image') {
      throw new BadRequestException('invisibleWatermarkConfig.idStrategy must be "per-image".');
    }

    const keyId = invisible['keyId'];

    if (
      keyId !== undefined &&
      (typeof keyId !== 'string' || keyId.trim().length === 0)
    ) {
      throw new BadRequestException(
        'watermarkConfig.invisibleWatermarkConfig.keyId must be a non-empty string when provided.',
      );
    }

    const selfCheck = invisible['selfCheck'];

    if (
      selfCheck !== undefined &&
      typeof selfCheck !== 'boolean'
    ) {
      throw new BadRequestException(
        'watermarkConfig.invisibleWatermarkConfig.selfCheck must be a boolean when provided.',
      );
    }
  }
}