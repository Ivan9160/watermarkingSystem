import type { ServerWatermarkConfig } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

/** Request the actual output of the server-side Sharp engine. */
export async function requestSharpPreview(
    imageUrl: string,
    watermarkConfig: ServerWatermarkConfig,
    signal: AbortSignal,
): Promise<Blob> {
    const response = await fetch(`${API_BASE}/watermarks/preview`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl, watermarkConfig }),
        signal,
        cache: 'no-store',
    });

    if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        let message = `Sharp preview unavailable (HTTP ${response.status})`;
        if (body && typeof body === 'object' && 'message' in body) {
            const description = (body as { message?: unknown }).message;
            if (typeof description === 'string') message = description;
            if (Array.isArray(description)) message = description.filter(x => typeof x === 'string').join('; ');
        }
        throw new Error(message);
    }

    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) {
        throw new Error('Preview endpoint did not return an image');
    }
    return blob;
}
