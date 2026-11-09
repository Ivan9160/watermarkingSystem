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
    sourceRef?: string; // Opaque RustFS reference for local PC uploads
    uploadStatus?: 'uploading' | 'ready' | 'failed';
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
    customPosition?: { x: number; y: number };
    /** Offset of a pattern cycle, 0..1 on each axis. */
    patternOffset?: { x: number; y: number };
    text: string;
    mode: 'single' | 'tile';
    position: WatermarkPosition;
    color: string;
    opacity: number;
    scale: number;
    angle: number;
    spacing: number;
    stagger: boolean;
    shadow: boolean;
    format: ServerWatermarkFormat;
    quality: number;
}

export interface BatchWatermarkConfig {
    applyVisibleWatermark: boolean;
    visibleWatermarkConfig?: ServerWatermarkConfig;
    applyInvisibleWatermark: boolean;
    invisibleWatermarkConfig?: {
        method: 'pixelseal';
        id: string;
        idStrategy: 'per-image';
        selfCheck: boolean;
    };
}

export interface CreateBatchRequest {
    products: {
        offerId: string;
        images: {
            url: string;
            offerImageIndex: number;
        }[];
    }[];
    watermarkConfig?: BatchWatermarkConfig;
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
            watermarkId?: string | null;
            url: string | null;
            error: string | null;
        }>;
    }>;
}


export interface LocalUploadResponse {
    sourceRef: string;
    src: string;
    offerId: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
}
