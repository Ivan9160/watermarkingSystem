export interface AllegroPublishResponse {
    batchId: string;
    status: 'APPLIED' | 'PARTIAL';
    totalImages: number;
    appliedImagesCount: number;
    skippedImages: Array<{
        imageId: string;
        offerId: string;
        status: string;
        reason: string;
    }>;
    offers: Array<{
        offerId: string;
        status: 'APPLIED' | 'FAILED';
        images?: Array<{ imageId: string; index: number; url: string }>;
        error?: string;
    }>;
}

export class AllegroPublishError extends Error {
    constructor(message: string, public readonly status: number | null) {
        super(message);
        this.name = 'AllegroPublishError';
    }
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

export async function applyBatchToAllegro(batchId: string): Promise<AllegroPublishResponse> {
    let response: Response;
    try {
        response = await fetch(`${API_BASE}/batches/${encodeURIComponent(batchId)}/results/apply`, {
            method: 'POST',
            credentials: 'include',
            headers: { Accept: 'application/json' },
        });
    } catch {
        throw new AllegroPublishError(
            'Cannot confirm whether Allegro was updated. Check your offers before trying again.',
            null,
        );
    }

    if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const message = body && typeof body === 'object' && 'message' in body
            ? (body as { message?: unknown }).message
            : null;
        const reason = Array.isArray(message)
            ? message.filter((x): x is string => typeof x === 'string').join('; ')
            : typeof message === 'string' ? message : `Allegro publishing failed (HTTP ${response.status}).`;
        throw new AllegroPublishError(reason, response.status);
    }

    let value: unknown;
    try {
        value = await response.json();
    } catch {
        throw new AllegroPublishError('Publishing response could not be read. Check Allegro before retrying.', null);
    }

    if (!value || typeof value !== 'object' ||
        !('status' in value) || !['APPLIED', 'PARTIAL'].includes(String(value.status)) ||
        !('offers' in value) || !Array.isArray(value.offers)) {
        throw new AllegroPublishError('Unexpected publishing response. Check Allegro before retrying.', null);
    }
    return value as AllegroPublishResponse;
}

const RECORD_PREFIX = 'waterm.allegroPublication.v1.';

export type PublishRecord =
    | { state: 'pending'; savedAt: string }
    | { state: 'confirmed'; savedAt: string; response: AllegroPublishResponse };

export function readPublishRecord(batchId: string): PublishRecord | null {
    try {
        const raw = localStorage.getItem(RECORD_PREFIX + batchId);
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || !('state' in parsed)) return null;
        if (parsed.state === 'pending') return parsed as PublishRecord;
        if (parsed.state === 'confirmed' && 'response' in parsed) return parsed as PublishRecord;
    } catch { /* local storage is optional */ }
    return null;
}

export function savePublishRecord(batchId: string, record: PublishRecord): void {
    try { localStorage.setItem(RECORD_PREFIX + batchId, JSON.stringify(record)); }
    catch { /* local storage can be unavailable */ }
}

export function clearPublishRecord(batchId: string): void {
    try { localStorage.removeItem(RECORD_PREFIX + batchId); }
    catch { /* local storage can be unavailable */ }
}
