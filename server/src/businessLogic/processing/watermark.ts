import sharp from 'sharp';

export const POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'] as const;
export const MODES = ['single', 'tile'] as const;
export const FORMATS = ['jpeg', 'png', 'webp'] as const;

export type WatermarkPosition = (typeof POSITIONS)[number];
export type WatermarkMode = (typeof MODES)[number];
export type WatermarkFormat = (typeof FORMATS)[number];

export interface WatermarkParams {
  /** Текст знака (якщо не задано logo). */
  text?: string;
  /** Логотип як Buffer. Шлях із зовнішнього вводу сюди не передавай. */
  logo?: Buffer | null;
  /** 'single' = один знак, 'tile' = заповнити все зображення. */
  mode?: WatermarkMode;
  /** Лише для single. */
  position?: WatermarkPosition;
  /** 0..1 */
  opacity?: number;
  /** Ширина одного знака відносно ширини зображення, 0.05..1 */
  scale?: number;
  /** px, лише для single */
  margin?: number;
  /** #rgb або #rrggbb */
  color?: string;
  /** Градуси, -180..180 (для tile зазвичай -30) */
  angle?: number;
  /** Відступ між знаками в tile, частка розміру знака, 0..5 */
  spacing?: number;
  /** Зсув кожного другого ряду в tile */
  stagger?: boolean;
  /** Тінь для читабельності */
  shadow?: boolean;
  /** null = як у вхідного файлу */
  format?: WatermarkFormat | null;
  /** 1..100 для jpeg/webp */
  quality?: number;
}

export interface WatermarkResult {
  buffer: Buffer;
  width: number;
  height: number;
  format: WatermarkFormat;
}

// тип шару виводимо зі значення sharp, щоб не залежати від namespace 'sharp'
type Layer = Parameters<ReturnType<typeof sharp>['composite']>[0][number];

type Resolved = Required<Omit<WatermarkParams, 'logo' | 'format'>> & {
  logo: Buffer | null;
  format: WatermarkFormat | null;
};

export const DEFAULTS: Resolved = {
  text: 'WATERMARK',
  logo: null,
  mode: 'single',
  position: 'bottom-right',
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

// ---------- валідація параметрів ----------

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

export function normalizeParams(raw: WatermarkParams = {}): Resolved {
  const merged: Record<string, unknown> = { ...DEFAULTS };
  // undefined / null / '' ігноруємо, щоб порожнє поле запиту не затирало дефолт
  for (const [k, v] of Object.entries(raw)) {
    if (k in DEFAULTS && v !== undefined && v !== null && v !== '') merged[k] = v;
  }

  // колір вставляється в SVG, тому приймаємо лише строгий hex (захист від інʼєкцій)
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

// ---------- побудова одного знака ----------

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
  // світлий текст отримує темну тінь, темний світлу
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

async function buildTextOverlay(p: Resolved, targetWidth: number): Promise<Buffer> {
  const text = escapeXml(p.text);
  // жирний Arial: великі літери до ~0.78em, плюс запас по краях, щоб текст не обрізався
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

// ---------- плитка для заповнення всього зображення ----------

async function buildTile(overlay: Buffer, ow: number, oh: number, p: Resolved): Promise<Buffer> {
  const gapX = Math.round(ow * p.spacing);
  const gapY = Math.round(oh * p.spacing);
  const cellW = ow + gapX;
  const cellH = oh + gapY;

  // stagger: плитка 2x2 клітинки, знаки по діагоналі, тож без зшивання країв
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

// ---------- головна функція ----------

export async function applyWatermark(
  input: Buffer | string,
  params: WatermarkParams = {},
): Promise<WatermarkResult> {
  const p = normalizeParams(params);

  const meta = await sharp(input).metadata();
  const swap = (meta.orientation ?? 1) >= 5; // EXIF-поворот міняє ширину і висоту
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

  let layer: Layer;
  if (p.mode === 'tile') {
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

    layer = {
      input: safeTileBuffer,
      tile: true,
    };
  } else {
    const m = p.margin;
    const [left, top] = {
      'top-left': [m, m],
      'top-right': [width - ow - m, m],
      'bottom-left': [m, height - oh - m],
      'bottom-right': [width - ow - m, height - oh - m],
      center: [(width - ow) / 2, (height - oh) / 2],
    }[p.position] as [number, number];
    layer = {
      input: overlay,
      left: Math.max(0, Math.round(left)),
      top: Math.max(0, Math.round(top)),
    };
  }

  const format: WatermarkFormat =
    p.format ?? ((FORMATS as readonly string[]).includes(meta.format ?? '') ? (meta.format as WatermarkFormat) : 'jpeg');
  const encoderOptions = format === 'png' ? {} : { quality: p.quality };

  const buffer = await sharp(input)
    .rotate()
    .composite([layer])
    .toFormat(format, encoderOptions)
    .toBuffer();

  return { buffer, width, height, format };
}
