export const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

const CONTENT_TYPE_BY_EXT = Object.fromEntries(
  Object.entries(IMAGE_TYPES).map(([type, ext]) => [ext, type]),
);

export function contentTypeFromExtension(ext: string): string {
  return CONTENT_TYPE_BY_EXT[ext.replace(/^\./, '').toLowerCase()] ?? 'application/octet-stream';
}

export function matchesImageSignature(buf: Buffer, ext: string): boolean {
  switch (ext) {
    case 'jpg':
      return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case 'png':
      return buf
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'webp':
      return (
        buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buf.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    case 'avif': {
      const brand = buf.subarray(4, 12).toString('ascii');
      return brand === 'ftypavif' || brand === 'ftypavis';
    }
    default:
      return false;
  }
}
