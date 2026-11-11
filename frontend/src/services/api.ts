import type {
    AllegroConnection, ImportProgress, ProductImage, WorkspaceSession,
    CreateBatchRequest, CreateBatchResponse, BatchStatusResponse, BatchResultsResponse, LocalUploadResponse,
    WatermarkVerificationResponse,
} from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';
async function uploadLocalImage(file: File, offerId: string): Promise<LocalUploadResponse> {
    const form = new FormData();
    form.append('file', file);
    form.append('offerId', offerId);
    const response = await fetch(`${API_BASE}/local-images`, {
        method: 'POST', credentials: 'include', body: form,
    });
    if (!response.ok) {
        const data: unknown = await response.json().catch(() => null);
        const reason = data && typeof data === 'object' && 'message' in data
            ? (data as { message?: unknown }).message : null;
        throw new Error(typeof reason === 'string' ? reason : `Upload failed (${response.status})`);
    }
    return response.json() as Promise<LocalUploadResponse>;
}

async function uploadWatermarkVerificationImage(
    file: File,
): Promise<WatermarkVerificationResponse> {
    const form = new FormData();
    form.append('image', file);

    const response = await fetch(`${API_BASE}/watermarks/verify/upload`, {
        method: 'POST',
        credentials: 'include',
        body: form,
    });

    if (!response.ok) {
        const body: unknown = await response.json().catch(() => undefined);
        const message = body && typeof body === 'object' && 'message' in body
            ? (body as { message?: unknown }).message
            : undefined;
        const reason = Array.isArray(message)
            ? message.filter((part): part is string => typeof part === 'string').join('; ')
            : typeof message === 'string'
                ? message
                : `Verification request failed (${response.status})`;
        throw new Error(reason);
    }

    return response.json() as Promise<WatermarkVerificationResponse>;
}


async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
        credentials: 'include',
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options?.headers,
        },
    });

    if (!response.ok) {
        const body: unknown = await response.json().catch(() => undefined);
        const message = (body && typeof body === 'object' && 'message' in body)
            ? (body as { message?: unknown }).message
            : undefined;
        const reason = Array.isArray(message)
            ? message.filter((part): part is string => typeof part === 'string').join('; ')
            : typeof message === 'string' ? message : `API request failed (${response.status})`;
        throw new Error(reason);
    }

    return response.json() as Promise<T>;
}

export const api = {
    uploadLocalImage,
    verifyWatermarkUpload: uploadWatermarkVerificationImage,
    verifyWatermarkLibraryImage: (imageId: string) =>
        request<WatermarkVerificationResponse>('/watermarks/verify/library', {
            method: 'POST',
            body: JSON.stringify({ imageId }),
        }),
    getLocalImages: () => request<{ items: ProductImage[] }>('/local-images'),
    deleteLocalImage: (ref: string) => request<{ removed: boolean }>(`/local-images/${encodeURIComponent(ref.replace(/^waterm-local:/, ''))}`, {
        method: 'DELETE',
    }),
    createMixedBatch: (payload: CreateBatchRequest) => request<CreateBatchResponse>('/mixed-batches', {
        method: 'POST', body: JSON.stringify(payload),
    }),
    getSession: () => request<WorkspaceSession>('/session'),
    getImages: () => request<{ items: ProductImage[] }>('/images'),

    getAllegroLoginUrl: () => `${API_BASE}/auth/allegro/login`,
    getAllegroStatus: () => request<AllegroConnection>('/auth/allegro/status'),
    disconnectAllegro: () => request<{ connected: false }>('/auth/allegro/logout', {
        method: 'POST',
    }),
    startAllegroImport: () => request<ImportProgress>('/auth/allegro/import', {
        method: 'POST',
    }),
    getAllegroImportProgress: () => request<ImportProgress>('/auth/allegro/import/progress'),
    getAllegroImages: () => request<{
        items: ProductImage[];
        offerCount: number;
        failedOffers: number;
        failedOfferIds: string[];
    }>('/auth/allegro/images'),

    createBatch: (payload: CreateBatchRequest) =>
        request<CreateBatchResponse>('/batches', {
            method: 'POST', body: JSON.stringify(payload),
        }),
    getBatchStatus: (id: string) =>
        request<BatchStatusResponse>(`/batches/${encodeURIComponent(id)}`),
    getBatchResults: (id: string) =>
        request<BatchResultsResponse>(`/batches/${encodeURIComponent(id)}/results`),
    createOrganization: (name: string) =>
        request<{ id: string; name: string }>('/organizations', {
            method: 'POST', body: JSON.stringify({ name }),
        }),
};
