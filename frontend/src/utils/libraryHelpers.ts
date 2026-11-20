import type { ProductImage } from '../types';

export type SortOrder = 'asc' | 'desc';
export type LibraryViewMode = 'photos' | 'products';
export type Dimensions = { width: number; height: number };
export type UploadPreview = { id: string; name: string; url?: string; issue?: string; status?: string };
export type ImageGroup = {
    key: string;
    title: string;
    offerId?: string;
    source: ProductImage['source'];
    images: ProductImage[];
};

const MB = 1024 * 1024;
export const MAX_FILE_BYTES = 10 * MB;
export const VALID_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const COLLAPSED_THUMBS = 8;

export function getOfferId(image: ProductImage): string | undefined {
    if (image.offerId) return image.offerId;
    if (image.source !== 'allegro') return undefined;
    return image.filename.match(/^(.+)-\d{2}\.(?:jpe?g|png|webp)$/i)?.[1];
}

export function productKey(image: ProductImage): string {
    if (image.source === 'local') {
        if (image.offerId) return `local:${image.offerId}`;
        if (image.productName?.trim()) {
            return `local-name:${image.productName.trim().toLowerCase()}`;
        }
    }
    if (image.source === 'allegro') {
        const offerId = getOfferId(image);
        if (offerId) return `allegro:${offerId}`;
        if (image.productName?.trim()) {
            return `allegro-name:${image.productName.trim().toLowerCase()}`;
        }
    }
    return `individual:${image.id}`;
}

export function sourceLabel(source: ProductImage['source']): string {
    return source === 'local' ? 'Local' : source === 'allegro' ? 'Allegro' : 'Catalog';
}

export function getFormat(image: ProductImage): 'jpeg' | 'png' | 'webp' | 'unknown' {
    if (image.mimeType === 'image/jpeg') return 'jpeg';
    if (image.mimeType === 'image/png') return 'png';
    if (image.mimeType === 'image/webp') return 'webp';
    const extension = image.filename.split('.').pop()?.toLowerCase();
    if (extension === 'jpg' || extension === 'jpeg') return 'jpeg';
    if (extension === 'png') return 'png';
    if (extension === 'webp') return 'webp';
    return 'unknown';
}

export function formatBytes(bytes: number | undefined): string {
    if (bytes === undefined) return 'Not available';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < MB) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / MB).toFixed(2)} MB`;
}
