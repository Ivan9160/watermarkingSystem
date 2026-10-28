import type { BatchResultsResponse } from '../types';

interface ZipEntry {
    name: string;
    bytes: Uint8Array;
    checksum: number;
}

const encoder = new TextEncoder();
const MAX_ZIP_BYTES = 512 * 1024 * 1024;
const MAX_UINT32 = 0xffffffff;

function makeCrcTable(): Uint32Array {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let value = i;
        for (let j = 0; j < 8; j++) {
            value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
        }
        table[i] = value >>> 0;
    }
    return table;
}

const CRC_TABLE = makeCrcTable();

function crc32(bytes: Uint8Array): number {
    let crc = 0xffffffff;
    for (const byte of bytes) {
        crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date) {
    const year = Math.max(1980, Math.min(date.getFullYear(), 2107));
    const dateField = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    const timeField = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    return { dateField, timeField };
}

export function createZip(entries: Array<{ name: string; bytes: Uint8Array }>): Blob {
    if (entries.length > 0xffff) throw new Error('Too many files for a ZIP archive.');
    const prepared: ZipEntry[] = entries.map(entry => ({
        ...entry,
        checksum: crc32(entry.bytes),
    }));

    const { dateField, timeField } = dosDateTime(new Date());
    const chunks: BlobPart[] = [];
    const central: Uint8Array[] = [];
    let offset = 0;

    for (const entry of prepared) {
        const name = encoder.encode(entry.name);
        const length = entry.bytes.byteLength;
        if (name.length > 0xffff || length > MAX_UINT32) {
            throw new Error('A filename or image is too large for this ZIP format.');
        }

        const local = new Uint8Array(30 + name.length);
        const l = new DataView(local.buffer);
        l.setUint32(0, 0x04034b50, true);
        l.setUint16(4, 20, true);
        l.setUint16(6, 0x0800, true); // UTF-8 filenames
        l.setUint16(8, 0, true);      // no compression
        l.setUint16(10, timeField, true);
        l.setUint16(12, dateField, true);
        l.setUint32(14, entry.checksum, true);
        l.setUint32(18, length, true);
        l.setUint32(22, length, true);
        l.setUint16(26, name.length, true);
        local.set(name, 30);

        const header = new Uint8Array(46 + name.length);
        const c = new DataView(header.buffer);
        c.setUint32(0, 0x02014b50, true);
        c.setUint16(4, 20, true); // version made by
        c.setUint16(6, 20, true); // version required
        c.setUint16(8, 0x0800, true);
        c.setUint16(10, 0, true);
        c.setUint16(12, timeField, true);
        c.setUint16(14, dateField, true);
        c.setUint32(16, entry.checksum, true);
        c.setUint32(20, length, true);
        c.setUint32(24, length, true);
        c.setUint16(28, name.length, true);
        c.setUint32(42, offset, true);
        header.set(name, 46);

        chunks.push(local, entry.bytes);
        central.push(header);
        offset += local.length + length;
        if (offset > MAX_UINT32) throw new Error('Batch ZIP exceeds the 4 GB ZIP format limit.');
    }

    const centralOffset = offset;
    for (const header of central) {
        chunks.push(header);
        offset += header.length;
    }
    const centralSize = offset - centralOffset;
    if (offset + 22 > MAX_UINT32) throw new Error('Batch ZIP exceeds 4 GB.');

    const end = new Uint8Array(22);
    const e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true);
    e.setUint16(8, prepared.length, true);
    e.setUint16(10, prepared.length, true);
    e.setUint32(12, centralSize, true);
    e.setUint32(16, centralOffset, true);
    chunks.push(end);
    return new Blob(chunks, { type: 'application/zip' });
}

function safeSegment(value: string): string {
    return value.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '_').slice(0, 100) || 'unknown';
}

function fetchableStorageUrl(signedUrl: string): string {
    const url = new URL(signedUrl);
    if (url.protocol === 'http:' && url.host === '127.0.0.1:9000'
        && window.location.protocol === 'http:' && window.location.port === '5173') {
        return `/waterm-storage${url.pathname}${url.search}`;
    }
    return signedUrl;
}

function extensionFor(contentType: string | null, url: string, fallback: string): string {
    const mime = contentType?.split(';')[0].trim().toLowerCase();
    if (mime === 'image/jpeg') return 'jpg';
    if (mime === 'image/png') return 'png';
    if (mime === 'image/webp') return 'webp';
    try {
        const path = new URL(url).pathname.toLowerCase();
        if (/\.png$/.test(path)) return 'png';
        if (/\.webp$/.test(path)) return 'webp';
        if (/\.(jpg|jpeg)$/.test(path)) return 'jpg';
    } catch { /* fall back to selected format */ }
    return fallback === 'png' ? 'png' : fallback === 'webp' ? 'webp' : 'jpg';
}

export function countDownloadableImages(results: BatchResultsResponse | null): number {
    return results?.products.reduce(
        (total, product) => total + product.images.filter(image => image.status === 'SUCCEEDED' && Boolean(image.url)).length,
        0,
    ) ?? 0;
}

export async function downloadBatchZip(
    batchId: string,
    results: BatchResultsResponse,
    fallbackFormat: string,
    onProgress?: (current: number, total: number) => void,
): Promise<number> {
    const items = results.products.flatMap(product =>
        product.images.filter(image => image.status === 'SUCCEEDED' && Boolean(image.url))
            .map(image => ({ ...image, offerId: product.offerId, url: image.url! })),
    );
    if (!items.length) throw new Error('There are no successfully processed images to download.');

    const entries: Array<{ name: string; bytes: Uint8Array }> = [];
    const names = new Set<string>();
    let totalBytes = 0;
    for (const [index, item] of items.entries()) {
        let response: Response;
        try {
            response = await fetch(fetchableStorageUrl(item.url), { credentials: 'omit', mode: 'cors' });
        } catch {
            throw new Error('Cannot fetch RustFS images. In development, check the /waterm-storage Vite proxy; in production, configure storage CORS or add a backend archive endpoint.');
        }
        if (!response.ok) {
            throw new Error(`Failed to download image ${index + 1} (${response.status}). Try Refresh links and retry.`);
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        totalBytes += bytes.byteLength;
        if (totalBytes > MAX_ZIP_BYTES) {
            throw new Error('This batch is too large to archive in the browser (limit: 512 MB). A backend ZIP endpoint is needed.');
        }
        const ext = extensionFor(response.headers.get('content-type'), item.url, fallbackFormat);
        const folder = safeSegment(item.offerId);
        const base = `${folder}/image-${String(item.index + 1).padStart(2, '0')}-watermarked`;
        let name = `${base}.${ext}`;
        if (names.has(name)) name = `${base}-${safeSegment(item.id.slice(0, 12))}.${ext}`;
        names.add(name);
        entries.push({ name, bytes });
        onProgress?.(index + 1, items.length);
    }

    const blob = createZip(entries);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `WaterM-batch-${safeSegment(batchId)}.zip`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Keep the object URL alive until the browser has started its download.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return items.length;
}
