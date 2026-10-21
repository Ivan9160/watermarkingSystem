import type { AllegroConnection, ProcessingBatch, ProductImage, WatermarkSettings, WorkspaceSession } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
        credentials: 'include',
        ...options,
        headers: { 'Content-Type': 'application/json', ...options?.headers },
    });
    if (!response.ok) {
        throw new Error(`API request failed (${response.status})`);
    }
    return response.json() as Promise<T>;
}

export const api = {
    getSession: () => request<WorkspaceSession>('/session'),
    getImages: () => request<{ items: ProductImage[] }>('/images'),
    createPreset: (name: string, settings: WatermarkSettings) =>
        request<{ id: string }>('/presets', {
            method: 'POST',
            body: JSON.stringify({ name, type: 'visible', ...settings }),
        }),
    createBatch: (imageIds: string[], presetId: string) =>
        request<{ batchId: string }>('/batches', {
            method: 'POST',
            body: JSON.stringify({ imageIds, presetId }),
        }),
    getBatch: (id: string) => request<ProcessingBatch>(`/batches/${encodeURIComponent(id)}`),

    getAllegroLoginUrl: () => `${API_BASE}/auth/allegro/login`,
    getAllegroStatus: () => request<AllegroConnection>('/auth/allegro/status'),
    getAllegroImages: () => request<{ items: ProductImage[]; offerCount: number; failedOffers: number; failedOfferIds: string[] }>('/auth/allegro/images'),
    disconnectAllegro: () => request<{ connected: false }>('/auth/allegro/logout', { method: 'POST' }),
};
