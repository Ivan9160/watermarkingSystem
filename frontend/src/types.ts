export type Page = 'dashboard' | 'library' | 'editor' | 'batch' | 'removal' | 'verification' | 'integrations';
export type WatermarkType = 'visible' | 'invisible';
export type WatermarkLayout = 'single' | 'pattern';
export type WatermarkPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center';
export type ImageSource = 'local' | 'allegro' | 'server';
export type ImportStage = 'idle'  | 'fetching-offers' | 'fetching-images' | 'completed' | 'failed';

export interface ProductImage {
    id: string;
    filename: string;
    src: string;
    productName?: string;
    offerId?: string;
    source?: ImageSource;
    width?: number;
    height?: number;
    sizeBytes?: number;
    mimeType?: string;
    uploadedAt?: string;
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

export interface ImportProgress {
    stage: ImportStage;
    totalOffers: number | null;
    processedOffers: number;
    importedImages: number;
    failedOffers: number;
    error?: string;
}

export interface WorkspaceSession {
    workspace: { id: string; name: string };
    user: { displayName: string; email?: string };
}
