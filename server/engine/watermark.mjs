#!/usr/bin/env node
// Simple watermark CLI.
// Usage: node watermark.mjs --input <file> --output <file> [--config <json>]
// Exit code 0 = success, 1 = processing error, 2 = bad arguments.
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import sharp from 'sharp';

const POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'];

const DEFAULTS = {
  text: 'WATERMARK',
  logoPath: null, // якщо задано — використовується замість тексту
  position: 'bottom-right',
  opacity: 0.5, // 0..1
  scale: 0.25, // ширина водяного знака відносно ширини фото, 0.05..1
  margin: 20, // px від краю
  color: '#ffffff',
};

const escapeXml = (s) =>
  s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);

async function loadConfig(path) {
  const user = path ? JSON.parse(await readFile(path, 'utf8')) : {};
  const cfg = { ...DEFAULTS, ...user };

  if (!POSITIONS.includes(cfg.position)) throw new Error(`position must be one of: ${POSITIONS.join(', ')}`);
  if (!(cfg.opacity >= 0 && cfg.opacity <= 1)) throw new Error('opacity must be between 0 and 1');
  if (!(cfg.scale >= 0.05 && cfg.scale <= 1)) throw new Error('scale must be between 0.05 and 1');
  if (!(cfg.margin >= 0)) throw new Error('margin must be >= 0');
  return cfg;
}

async function buildTextOverlay(cfg, targetWidth) {
  const text = escapeXml(String(cfg.text));
  const fontSize = Math.max(8, Math.round(targetWidth / (text.length * 0.6)));
  const height = Math.round(fontSize * 1.5);
  const y = Math.round(fontSize * 1.1);

  // тінь + основний текст — щоб було видно і на світлому, і на темному фоні
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${targetWidth}" height="${height}">
    <g font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="bold" text-anchor="middle">
      <text x="${targetWidth / 2 + 1}" y="${y + 1}" fill="#000000" fill-opacity="${cfg.opacity * 0.7}">${text}</text>
      <text x="${targetWidth / 2}" y="${y}" fill="${cfg.color}" fill-opacity="${cfg.opacity}">${text}</text>
    </g></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function buildLogoOverlay(cfg, targetWidth, maxHeight) {
  const { data, info } = await sharp(cfg.logoPath)
    .resize({ width: targetWidth, height: maxHeight, fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 3; i < data.length; i += 4) data[i] = Math.round(data[i] * cfg.opacity);

  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

async function main() {
  const { values } = parseArgs({
    options: {
      input: { type: 'string' },
      output: { type: 'string' },
      config: { type: 'string' },
    },
  });

  if (!values.input || !values.output) {
    console.error('Usage: watermark --input <file> --output <file> [--config <json>]');
    process.exit(2);
  }

  const cfg = await loadConfig(values.config);

  // розміри з урахуванням EXIF-повороту
  const meta = await sharp(values.input).metadata();
  const swap = (meta.orientation ?? 1) >= 5;
  const width = swap ? meta.height : meta.width;
  const height = swap ? meta.width : meta.height;
  if (!width || !height) throw new Error('Cannot read image size');

  const targetWidth = Math.max(16, Math.round(width * cfg.scale));
  const overlay = cfg.logoPath
    ? await buildLogoOverlay(cfg, targetWidth, Math.round(height * 0.9))
    : await buildTextOverlay(cfg, targetWidth);

  const o = await sharp(overlay).metadata();
  const m = cfg.margin;
  const coords = {
    'top-left': [m, m],
    'top-right': [width - o.width - m, m],
    'bottom-left': [m, height - o.height - m],
    'bottom-right': [width - o.width - m, height - o.height - m],
    center: [(width - o.width) / 2, (height - o.height) / 2],
  }[cfg.position];

  await sharp(values.input)
    .rotate() // застосувати EXIF-орієнтацію
    .composite([{
      input: overlay,
      left: Math.max(0, Math.round(coords[0])),
      top: Math.max(0, Math.round(coords[1])),
    }])
    .toFile(values.output); // формат визначається за розширенням output

  console.log(`OK ${width}x${height} -> ${values.output}`);
}

main().catch((err) => {
  console.error(err?.message ?? String(err));
  process.exit(1);
});