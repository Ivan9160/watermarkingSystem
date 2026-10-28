export type Page = 'dashboard' | 'library' | 'editor' | 'batch' | 'templates' | 'removal' | 'verification' | 'integrations';
export type WatermarkType = 'visible' | 'invisible';
export type WatermarkLayout = 'single' | 'pattern';
export type WatermarkPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center';
export type ImageSource = 'local' | 'allegro' | 'server';
export type ImportStage = 'idle' | 'fetching-offers' | 'fetching-images' | 'completed' | 'failed';

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

// NestJS server batch API: server/src/api/batches and server/src/api/results
export type ServerBatchStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type ServerWatermarkFormat = 'jpeg' | 'png' | 'webp';

export interface ServerWatermarkConfig {
    text: string;
    mode: 'single' | 'tile';
    position: WatermarkPosition;
    color: string;
    opacity: number; // 0..1, unlike Editor (0..100)
    scale: number; // 0.05..1; fraction of output image width
    angle: number;
    spacing: number;
    stagger: boolean;
    shadow: boolean;
    format: ServerWatermarkFormat;
    quality: number;
}

export interface CreateBatchRequest {
    watermarkConfig: ServerWatermarkConfig;
    products: Array<{ offerId: string; images: string[] }>;
}

export interface CreateBatchResponse {
    batchId: string;
    status: 'QUEUED';
    totalProducts: number;
    totalImages: number;
    statusUrl: string;
    resultsUrl: string;
}

export interface BatchStatusResponse {
    batchId: string;
    status: ServerBatchStatus;
    totalImages: number;
    counts: {
        pending: number;
        processing: number;
        succeeded: number;
        failed: number;
    };
    createdAt: string;
    completedAt: string | null;
    resultsUrl: string;
}

export interface BatchResultsResponse {
    batchId: string;
    status: ServerBatchStatus;
    products: Array<{
        offerId: string;
        images: Array<{
            id: string;
            index: number;
            status: 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
            url: string | null;
            error: string | null;
        }>;
    }>;
}
