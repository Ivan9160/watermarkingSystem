import type { WatermarkSettings } from '../types';
import { drawWatermark } from './drawWatermark';

export interface WatermarkedImageResult {
    blob: Blob;
    width: number;
    height: number;
}

function loadImageForExport(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();

        if (/^https?:\/\//i.test(src)) {
            image.crossOrigin = 'anonymous';
        }

        image.onload = () => {
            if (image.naturalWidth === 0 || image.naturalHeight === 0) {
                reject(new Error('The source image has invalid dimensions.'));
                return;
            }
            resolve(image);
        };

        image.onerror = () => {
            reject(new Error(
                'The image could not be loaded for export. For Allegro or other remote photos, ' +
                'the image server may block cross-origin access (CORS). ' +
                'Local uploads work directly; unrestricted remote export requires a Backend image endpoint.',
            ));
        };

        image.src = src;
    });
}

export async function renderWatermarkedPng(
    imageSrc: string,
    settings: WatermarkSettings,
): Promise<WatermarkedImageResult> {
    if (!settings.text.trim() || settings.opacity <= 0) {
        throw new Error('Enter watermark text and set opacity above 0%.');
    }

    const image = await loadImageForExport(imageSrc);
    const width = image.naturalWidth;
    const height = image.naturalHeight;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    if (canvas.width !== width || canvas.height !== height) {
        throw new Error('The image is too large for browser processing.');
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Unable to create an image canvas in this browser.');
    }

    ctx.drawImage(image, 0, 0, width, height);
    drawWatermark(ctx, width, height, settings);

    const blob = await new Promise<Blob>((resolve, reject) => {
        try {
            canvas.toBlob((result) => {
                if (result) {
                    resolve(result);
                } else {
                    reject(new Error('PNG encoding failed. The image may be too large.'));
                }
            }, 'image/png');
        } catch (error) {
            reject(new Error(
                error instanceof DOMException && error.name === 'SecurityError'
                    ? 'Export is blocked by the image provider (CORS). A Backend image endpoint is required.'
                    : 'Unable to export the processed image.',
            ));
        }
    });

    canvas.width = 0;
    canvas.height = 0;

    return { blob, width, height };
}

export function watermarkedFilename(originalFilename: string): string {
    const base = originalFilename
        .replace(/\.[^./\\]+$/, '')
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
        .trim() || 'image';

    return `${base}-watermarked.png`;
}
