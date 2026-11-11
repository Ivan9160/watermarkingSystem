import sharp from 'sharp';

export const POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'] as const;
export const MODES = ['single', 'tile'] as const;
export const FORMATS = ['jpeg', 'png', 'webp'] as const;

export type WatermarkPosition = (typeof POSITIONS)[number];
export type WatermarkMode = (typeof MODES)[number];
export type WatermarkFormat = (typeof FORMATS)[number];

export interface WatermarkParams {
  text?: string;
  logo?: Buffer | null;
  mode?: WatermarkMode;
  position?: WatermarkPosition;
  customPosition?: { x: number; y: number } | null;
  patternOffset?: { x: number; y: number } | null;
  opacity?: number;
  scale?: number;
  margin?: number;
  color?: string;
  angle?: number;
  spacing?: number;
  stagger?: boolean;
  shadow?: boolean;
  format?: WatermarkFormat | null;
  quality?: number;
}

export interface WatermarkResult {
  buffer: Buffer;
  width: number;
  height: number;
  format: WatermarkFormat;
}

type Layer = Parameters<ReturnType<typeof sharp>['composite']>[0][number];

type Resolved = Required<Omit<WatermarkParams, 'logo' | 'format' | 'customPosition' | 'patternOffset'>> & {
  customPosition: { x: number; y: number } | null;
  patternOffset: { x: number; y: number } | null;
  logo: Buffer | null;
  format: WatermarkFormat | null;
};

export const DEFAULTS: Resolved = {
  text: 'WATERMARK',
  logo: null,
  mode: 'single',
  position: 'bottom-right',
  customPosition: null,
  patternOffset: null,
  opacity: 0.5,
  scale: 0.25,
  margin: 20,
  color: '#ffffff',
  angle: 0,
  spacing: 0.6,
  stagger: true,
  shadow: true,
  format: null,
  quality: 90,
};



const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 } as const;

function num(value: unknown, name: string, min: number, max: number): number {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) {
    throw new Error(`${name} must be a number between ${min} and ${max}`);
  }
  return n;
}

function bool(value: unknown, name: string): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be true or false`);
}

function oneOf<T extends string>(value: unknown, list: readonly T[], name: string): T {
  if (typeof value !== 'string' || !list.includes(value as T)) {
    throw new Error(`${name} must be one of: ${list.join(', ')}`);
  }
  return value as T;
}

function parseRelativePosition(raw: unknown): { x: number; y: number } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('customPosition must contain x and y between 0 and 1');
  }
  const value = raw as Record<string, unknown>;
  return {
    x: num(value['x'], 'customPosition.x', 0, 1),
    y: num(value['y'], 'customPosition.y', 0, 1),
  };
}

export function normalizeParams(raw: WatermarkParams = {}): Resolved {
  const merged: Record<string, unknown> = { ...DEFAULTS };
  for (const [k, v] of Object.entries(raw)) {
    if (k in DEFAULTS && v !== undefined && v !== null && v !== '') merged[k] = v;
  }

  if (typeof merged['color'] !== 'string' || !HEX.test(merged['color'])) {
    throw new Error('color must be a hex value like #fff or #ffffff');
  }

  const logo = merged['logo'] ?? null;
  if (logo !== null && !Buffer.isBuffer(logo)) throw new Error('logo must be a Buffer');

  const format = merged['format'] === null ? null : oneOf(merged['format'], FORMATS, 'format');

  let text = String(merged['text'] ?? '').trim();
  if (!logo) {
    if (!text) throw new Error('text must not be empty when no logo is provided');
    if (text.length > 200) throw new Error('text is too long (max 200 characters)');
  } else {
    text = '';
  }

  return {
    text,
    logo,
    mode: oneOf(merged['mode'], MODES, 'mode'),
    position: oneOf(merged['position'], POSITIONS, 'position'),
    customPosition: merged['customPosition'] === null
      ? null
      : parseRelativePosition(merged['customPosition']),
    patternOffset: merged['patternOffset'] === null
      ? null
      : parseRelativePosition(merged['patternOffset']),
    opacity: num(merged['opacity'], 'opacity', 0, 1),
    scale: num(merged['scale'], 'scale', 0.05, 1),
    margin: num(merged['margin'], 'margin', 0, 10_000),
    color: merged['color'],
    angle: num(merged['angle'], 'angle', -180, 180),
    spacing: num(merged['spacing'], 'spacing', 0, 5),
    stagger: bool(merged['stagger'], 'stagger'),
    shadow: bool(merged['shadow'], 'shadow'),
    format,
    quality: Math.round(num(merged['quality'], 'quality', 1, 100)),
  };
}

const XML_ESCAPES: Record<string, string> = {
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  '"': '&quot;',
  "'": '&apos;',
};

const escapeXml = (s: string) => s.replace(/[<>&"']/g, (c) => XML_ESCAPES[c] ?? c);

function shadowColorFor(hex: string): string {
  const raw = hex.slice(1);
  const h = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

async function buildTextOverlay(p: Resolved, targetWidth: number): Promise<Buffer> {
  const text = escapeXml(p.text);
  const fontSize = Math.max(8, Math.round((targetWidth * 0.94) / (p.text.length * 0.78)));
  const height = Math.round(fontSize * 1.5);
  const y = Math.round(fontSize * 1.1);
  const cx = targetWidth / 2;

  const shadow = p.shadow
    ? `<text x="${cx + 1}" y="${y + 1}" fill="${shadowColorFor(p.color)}" fill-opacity="${p.opacity * 0.7}">${text}</text>`
    : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${targetWidth}" height="${height}">
    <g font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="bold" text-anchor="middle">
      ${shadow}
      <text x="${cx}" y="${y}" fill="${p.color}" fill-opacity="${p.opacity}">${text}</text>
    </g></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function buildLogoOverlay(
  logo: Buffer,
  opacity: number,
  targetWidth: number,
  maxHeight: number,
): Promise<Buffer> {
  const { data, info } = await sharp(logo)
    .resize({ width: targetWidth, height: maxHeight, fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 3; i < data.length; i += 4) data[i] = Math.round((data[i] as number) * opacity);

  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

async function rotateOverlay(buffer: Buffer, angle: number): Promise<Buffer> {
  if (!angle) return buffer;
  return sharp(buffer).rotate(angle, { background: TRANSPARENT }).png().toBuffer();
}

async function buildTile(overlay: Buffer, ow: number, oh: number, p: Resolved): Promise<Buffer> {
  const gapX = Math.round(ow * p.spacing);
  const gapY = Math.round(oh * p.spacing);
  const cellW = ow + gapX;
  const cellH = oh + gapY;

  const layers: Layer[] = [{ input: overlay, left: 0, top: 0 }];
  if (p.stagger) layers.push({ input: overlay, left: cellW, top: cellH });

  return sharp({
    create: {
      width: p.stagger ? cellW * 2 : cellW,
      height: p.stagger ? cellH * 2 : cellH,
      channels: 4,
      background: TRANSPARENT,
    },
  })
    .composite(layers)
    .png()
    .toBuffer();
}


export async function applyWatermark(
  input: Buffer | string,
  params: WatermarkParams = {},
): Promise<WatermarkResult> {
  const p = normalizeParams(params);

  const meta = await sharp(input).metadata();
  const swap = (meta.orientation ?? 1) >= 5; 
  const width = swap ? meta.height : meta.width;
  const height = swap ? meta.width : meta.height;
  if (!width || !height) throw new Error('Cannot read image size');

  const targetWidth = Math.max(16, Math.round(width * p.scale));
  const maxHeight = p.mode === 'tile' ? targetWidth : Math.round(height * 0.9);

  let overlay = p.logo
    ? await buildLogoOverlay(p.logo, p.opacity, targetWidth, maxHeight)
    : await buildTextOverlay(p, targetWidth);
  overlay = await rotateOverlay(overlay, p.angle);

  const o = await sharp(overlay).metadata();
  const ow = o.width ?? targetWidth;
  const oh = o.height ?? targetWidth;

  let layers: Layer[];
  if (p.mode === 'tile' && !p.logo) {
    const gapX = Math.round(ow * p.spacing);
    const gapY = Math.round(oh * p.spacing);
    const cellW = ow + gapX;
    const cellH = oh + gapY;
    const periodW = cellW * (p.stagger ? 2 : 1);
    const periodH = cellH * (p.stagger ? 2 : 1);
    const originX = (p.patternOffset?.x ?? 0) * periodW;
    const originY = (p.patternOffset?.y ?? 0) * periodH;
    const anchors = p.stagger ? [[0, 0], [cellW, cellH]] : [[0, 0]];
    const completeMarks: Layer[] = [];
    for (let row = -2; row <= Math.ceil(height / periodH) + 1; row++) {
      for (let col = -2; col <= Math.ceil(width / periodW) + 1; col++) {
        for (const [ax, ay] of anchors) {
          const left = Math.round(col * periodW + ax + originX);
          const top = Math.round(row * periodH + ay + originY);
          if (left >= 0 && top >= 0 && left + ow <= width && top + oh <= height) {
            completeMarks.push({ input: overlay, left, top });
          }
        }
      }
    }
    layers = completeMarks;
  } else if (p.mode === 'tile') {
    const tileBuffer = await buildTile(overlay, ow, oh, p);

    const safeTileBuffer = await sharp(tileBuffer)
      .resize({
        width,
        height,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();

    layers = [{
      input: safeTileBuffer,
      tile: true,
    }];
  } else {
    const m = p.margin;
    const [left, top] = {
      'top-left': [m, m],
      'top-right': [width - ow - m, m],
      'bottom-left': [m, height - oh - m],
      'bottom-right': [width - ow - m, height - oh - m],
      center: [(width - ow) / 2, (height - oh) / 2],
    }[p.position] as [number, number];

    const customLeft = p.customPosition ? (width - ow) * p.customPosition.x : left;
    const customTop = p.customPosition ? (height - oh) * p.customPosition.y : top;
    layers = [{
      input: overlay,
      left: Math.max(0, Math.min(Math.max(0, width - ow), Math.round(customLeft))),
      top: Math.max(0, Math.min(Math.max(0, height - oh), Math.round(customTop))),
    }];
  }

  const format: WatermarkFormat =
    p.format ?? ((FORMATS as readonly string[]).includes(meta.format ?? '') ? (meta.format as WatermarkFormat) : 'jpeg');
  const encoderOptions = format === 'png' ? {} : { quality: p.quality };

  const buffer = await sharp(input)
    .rotate()
    .composite([layers].flat())
    .toFormat(format, encoderOptions)
    .toBuffer();

  return { buffer, width, height, format };
}
