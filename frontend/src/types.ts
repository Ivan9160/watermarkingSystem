export type Page = 'dashboard' | 'library' | 'editor' | 'batch' | 'removal' | 'verification' | 'integrations';
export type WatermarkType = 'visible' | 'invisible';
export type WatermarkLayout = 'single' | 'pattern';
export type WatermarkPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center';

export interface ProductImage {
    id: string;
    filename: string;
    src: string;
    productName?: string;
    source?: 'local' | 'allegro' | 'server';
}

export interface WatermarkSettings {
    text: string;
    color: string;
    opacity: number;
    size: number;
    layout: WatermarkLayout;
    position: WatermarkPosition;
}

export interface ProcessingBatch {
    batchId: string;
    status: 'queued' | 'processing' | 'completed' | 'failed';
    total: number;
    completed: number;
    failed: number;
    pending: number;
}

export interface AllegroConnection {
    connected: boolean;
    sellerName?: string;
    lastSyncedAt?: string;
}

export interface WorkspaceSession {
    workspace: { id: string; name: string };
    user: { displayName: string; email?: string };
}
