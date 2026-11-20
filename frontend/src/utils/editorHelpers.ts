import type { BatchResultsResponse, ProductImage } from '../types';

export interface ProcessedImage {
    key: string;
    url: string;
    filename: string;
    width?: number;
    height?: number;
    source: 'client' | 'server';
    batchId?: string;
}

export interface BatchSource {
    offerId: string;
    url: string;
    offerImageIndex: number;
    local: boolean;
}

export const POLL_MS = 1500;
export const MAX_POLL_ATTEMPTS = 600;

function randomOfferId(): string {
    return String(Math.floor(1_000_000_000 + Math.random() * 9_000_000_000));
}

function toHttpsUrl(value: string | undefined | null): string | null {
    if (!value) return null;

    try {
        const parsed = new URL(value);

        return parsed.protocol === 'https:' ? parsed.href : null;
    } catch {
        return null;
    }
}

export function getBatchSource(image: ProductImage): BatchSource | null {
    if (image.source === 'local') {
        const sourceRef = image.sourceRef ?? '';

        if (!sourceRef.startsWith('waterm-local:')) {
            return null;
        }

        return {
            offerId: image.offerId ?? `LOCAL-${image.id}`,
            url: sourceRef,
            offerImageIndex: 0,
            local: true,
        };
    }

    const url = toHttpsUrl(image.src) ?? toHttpsUrl(image.sourceRef);

    if (!url) return null;

    const filenameMatch = image.filename.match(/^(.+)-(\d{2})\.[^.]+$/);

    return {
        offerId:
            image.offerId ??
            filenameMatch?.[1] ??
            randomOfferId(),
        url,
        offerImageIndex: filenameMatch
            ? Math.max(0, Number(filenameMatch[2]) - 1)
            : 1,
        local: false,
    };
}

export function isFinished(status: string): boolean {
    return status === 'COMPLETED' || status === 'FAILED';
}

export function getMessage(error: unknown): string {
    return error instanceof Error
        ? error.message
        : 'Unexpected image processing error';
}

export function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function invisibleFilename(filename: string): string {
    const extensionIndex = filename.lastIndexOf('.');
    const base = extensionIndex > 0
        ? filename.slice(0, extensionIndex)
        : filename;

    return `${base}-watermarked.png`;
}

export function getSuccessfulImage(results: BatchResultsResponse) {
    return results.products
        .flatMap(product => product.images)
        .find(image => image.status === 'SUCCEEDED' && Boolean(image.url));
}

export function getFailedImageMessage(results: BatchResultsResponse): string | null {
    const failed = results.products
        .flatMap(product => product.images)
        .find(image => image.status === 'FAILED');

    return failed?.error ?? null;
}

export function triggerDownload(url: string, filename: string) {
    const link = document.createElement('a');

    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    link.remove();
}
