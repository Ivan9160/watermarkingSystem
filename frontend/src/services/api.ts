import type { AllegroConnection, ProcessingBatch, ProductImage, WatermarkSettings, WorkspaceSession } from '../types';

// Proposed WaterM BACKEND endpoints, not Allegro's public API endpoints.
// Allegro OAuth tokens and client secrets belong in NestJS, never in React.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api';

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
    getAllegroStatus: () => request<AllegroConnection>('/integrations/allegro/status'),
    getAllegroAuthorizationUrl: () =>
        request<{ url: string }>('/integrations/allegro/authorize-url'),
    syncAllegroCatalog: () =>
        request<{ jobId: string }>('/integrations/allegro/sync', { method: 'POST' }),
};
