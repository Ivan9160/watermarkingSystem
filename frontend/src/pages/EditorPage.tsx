import { useEffect, useMemo, useRef, useState } from 'react';

import { PageHeading } from '../components/PageHeading';
import { HybridBatchPreview, type DragPosition } from '../components/HybridBatchPreview';
import { WatermarkSettingsPanel } from '../components/WatermarkSettingsPanel';
import { WatermarkTemplatePanel } from '../components/WatermarkTemplatePanel';

import { useApp } from '../context/AppContext';
import { api } from '../services/api';

import { requestSharpPreview } from '../services/watermarkPreviewApi';
import { buildServerWatermarkConfig } from '../utils/serverWatermarkConfig';

import type {
    BatchResultsResponse,
    BatchStatusResponse,
    BatchWatermarkConfig,
    CreateBatchRequest,
    ProductImage,
} from '../types';

interface ProcessedImage {
    key: string;
    url: string;
    filename: string;
    width?: number;
    height?: number;
    source: 'client' | 'server';
    batchId?: string;
}

interface BatchSource {
    offerId: string;
    url: string;
    offerImageIndex: number;
    local: boolean;
}

const POLL_MS = 1500;
const MAX_POLL_ATTEMPTS = 600;

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

function getBatchSource(image: ProductImage): BatchSource | null {
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

function isFinished(status: string): boolean {
    return status === 'COMPLETED' || status === 'FAILED';
}

function getMessage(error: unknown): string {
    return error instanceof Error
        ? error.message
        : 'Unexpected image processing error';
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function invisibleFilename(filename: string): string {
    const extensionIndex = filename.lastIndexOf('.');
    const base = extensionIndex > 0
        ? filename.slice(0, extensionIndex)
        : filename;

    return `${base}-watermarked.png`;
}

function getSuccessfulImage(results: BatchResultsResponse) {
    return results.products
        .flatMap(product => product.images)
        .find(image => image.status === 'SUCCEEDED' && Boolean(image.url));
}

function getFailedImageMessage(results: BatchResultsResponse): string | null {
    const failed = results.products
        .flatMap(product => product.images)
        .find(image => image.status === 'FAILED');

    return failed?.error ?? null;
}

function triggerDownload(url: string, filename: string) {
    const link = document.createElement('a');

    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    link.remove();
}

export function EditorPage() {
    const {
        images, activeImage, openEditor,
        settings, watermarkType, setPage,
    } = useApp();

    const [manualPosition, setManualPosition] = useState<DragPosition | null>(null);
    const [manualPatternOffset, setManualPatternOffset] = useState<DragPosition | null>(null);
    const [processing, setProcessing] = useState(false);
    const [downloading, setDownloading] = useState(false);

    const [error, setError] = useState('');
    const [processed, setProcessed] = useState<ProcessedImage | null>(null);

    const [batchStatus, setBatchStatus] =
        useState<BatchStatusResponse | null>(null);

    const mounted = useRef(true);
    const operationId = useRef(0);

    const [imageMenuOpen, setImageMenuOpen] = useState(false);
    const imageMenuRef = useRef<HTMLDivElement>(null);

    const currentKey = JSON.stringify({
        imageId: activeImage?.id,
        imageSrc: activeImage?.src,
        watermarkType,
        settings,
        manualPosition,
        manualPatternOffset,
    });

    const latestKey = useRef(currentKey);
    latestKey.current = currentKey;

    const batchSource = activeImage
        ? getBatchSource(activeImage)
        : null;
    const sharpConfig = useMemo(() => ({
        ...buildServerWatermarkConfig(settings, 'png', 100),
        ...(settings.layout === 'single' && manualPosition
            ? { customPosition: manualPosition } : {}),
        ...(settings.layout === 'pattern' && manualPatternOffset
            ? { patternOffset: manualPatternOffset } : {}),
    }), [settings, manualPosition, manualPatternOffset]);

    useEffect(() => {
        setManualPosition(null);
        setManualPatternOffset(null);
    }, [activeImage?.id, settings.position, settings.layout]);
    const sharpInput = activeImage?.source === 'local'
        ? activeImage.sourceRef
        : activeImage?.src;

    useEffect(() => {
        mounted.current = true;

        return () => {
            mounted.current = false;
            operationId.current++;
        };
    }, []);

    useEffect(() => {
        return () => {
            if (processed?.url.startsWith('blob:')) {
                URL.revokeObjectURL(processed.url);
            }
        };
    }, [processed]);

    useEffect(() => {
        setError('');
    }, [currentKey]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (
                imageMenuRef.current &&
                !imageMenuRef.current.contains(event.target as Node)
            ) {
                setImageMenuOpen(false);
            }
        }

        function handleEscape(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                setImageMenuOpen(false);
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, []);

    const processedCurrent =
        processed?.key === currentKey ? processed : null;

    const canApply = Boolean(
        activeImage &&
        (
            watermarkType === 'visible'
                ? settings.text.trim() && settings.opacity > 0
                : batchSource
        ),
    );

    async function applyVisibleWatermark(
        keyAtStart: string,
        filenameAtStart: string,
    ) {
        if (!sharpInput) throw new Error('Image source is unavailable for Sharp.');

        const result = await requestSharpPreview(
            sharpInput,
            sharpConfig,
            new AbortController().signal,
        );

        if (!mounted.current || latestKey.current !== keyAtStart) return;

        const url = URL.createObjectURL(result);
        setProcessed({
            key: keyAtStart,
            url,
            filename: invisibleFilename(filenameAtStart),
            source: 'client', // A downloaded Sharp-generated Blob, not Canvas output.
        });
    }

    async function applyInvisibleWatermark(
        keyAtStart: string,
        filenameAtStart: string,
        source: BatchSource,
    ) {
        const watermarkConfig: BatchWatermarkConfig = {
            applyVisibleWatermark: false,
            applyInvisibleWatermark: true,
            invisibleWatermarkConfig: {
                method: 'pixelseal',
                selfCheck: true,
            },
        };

        const payload: CreateBatchRequest = {
            products: [
                {
                    offerId: source.offerId,
                    images: [
                        {
                            url: source.url,
                            offerImageIndex: source.offerImageIndex,
                        },
                    ],
                },
            ],
            watermarkConfig,
        };

        const created = source.local
            ? await api.createMixedBatch(payload)
            : await api.createBatch(payload);

        setBatchStatus(null);

        let finalStatus: BatchStatusResponse | null = null;

        for (
            let attempt = 0;
            attempt < MAX_POLL_ATTEMPTS;
            attempt++
        ) {
            await delay(POLL_MS);

            if (
                !mounted.current ||
                latestKey.current !== keyAtStart
            ) {
                return;
            }

            finalStatus = await api.getBatchStatus(created.batchId);

            if (!mounted.current) return;

            setBatchStatus(finalStatus);

            if (isFinished(finalStatus.status)) {
                break;
            }
        }

        if (!finalStatus || !isFinished(finalStatus.status)) {
            throw new Error(
                'Image processing timed out. Check the batch status and try again.',
            );
        }

        const results = await api.getBatchResults(created.batchId);

        if (
            !mounted.current ||
            latestKey.current !== keyAtStart
        ) {
            return;
        }

        const resultImage = getSuccessfulImage(results);

        if (!resultImage?.url) {
            throw new Error(
                getFailedImageMessage(results) ??
                'PixelSeal could not process this image.',
            );
        }

        setProcessed({
            key: keyAtStart,
            url: resultImage.url,
            filename: invisibleFilename(filenameAtStart),
            source: 'server',
            batchId: created.batchId,
        });
    }

    async function applyWatermark() {
        if (!activeImage || !canApply || processing) return;

        const keyAtStart = currentKey;
        const filenameAtStart = activeImage.filename;
        const currentOperation = ++operationId.current;

        setProcessing(true);
        setError('');
        setBatchStatus(null);

        try {
            if (watermarkType === 'visible') {
                await applyVisibleWatermark(
                    keyAtStart,
                    filenameAtStart,
                );
            } else {
                if (!batchSource) {
                    throw new Error(
                        'This image cannot be processed.',
                    );
                }

                await applyInvisibleWatermark(
                    keyAtStart,
                    filenameAtStart,
                    batchSource,
                );
            }
        } catch (cause) {
            if (
                mounted.current &&
                latestKey.current === keyAtStart
            ) {
                setError(getMessage(cause));
            }
        } finally {
            if (
                mounted.current &&
                operationId.current === currentOperation
            ) {
                setProcessing(false);
            }
        }
    }

    async function downloadImage() {
        if (!processedCurrent || processing || downloading) return;

        setDownloading(true);
        setError('');

        try {
            if (processedCurrent.source === 'client') {
                triggerDownload(
                    processedCurrent.url,
                    processedCurrent.filename,
                );

                return;
            }

            if (!processedCurrent.batchId) {
                throw new Error('Processed batch ID is missing.');
            }

            const latestResults = await api.getBatchResults(
                processedCurrent.batchId,
            );

            const resultImage = getSuccessfulImage(latestResults);

            if (!resultImage?.url) {
                throw new Error('Processed image is no longer available.');
            }

            let blob: Blob;

            try {
                const response = await fetch(resultImage.url);

                if (!response.ok) {
                    throw new Error(
                        `Could not download the image: HTTP ${response.status}`,
                    );
                }

                blob = await response.blob();
            } catch {
                window.open(resultImage.url, '_blank', 'noopener');
                return;
            }

            const downloadUrl = URL.createObjectURL(blob);

            triggerDownload(
                downloadUrl,
                processedCurrent.filename,
            );

            window.setTimeout(() => {
                URL.revokeObjectURL(downloadUrl);
            }, 10_000);
        } catch (cause) {
            setError(getMessage(cause));
        } finally {
            setDownloading(false);
        }
    }

    const processingCount =
        (batchStatus?.counts.succeeded ?? 0) +
        (batchStatus?.counts.failed ?? 0);

    return (
        <div className="page-shell watermark-editor-page">
            <PageHeading
                title="Watermark Editor"
                subtitle={
                    activeImage?.filename ??
                    'Select an image from Library'
                }
                actions={
                    <div className="page-actions">
                        
                        <div className="editor-image-picker" ref={imageMenuRef}>
                            <span className="muted-label">Image</span>

                            <div className={`editor-dropdown ${imageMenuOpen ? 'is-open' : ''}`}>
                                <button
                                    type="button"
                                    className="editor-dropdown-trigger"
                                    aria-label="Choose image to edit"
                                    aria-expanded={imageMenuOpen}
                                    aria-controls="editor-image-options"
                                    disabled={processing || images.length === 0}
                                    onClick={() => setImageMenuOpen(prev => !prev)}
                                >
                                    <span className="editor-dropdown-value">
                                        {activeImage?.filename ?? 'Choose image'}
                                    </span>

                                    <svg
                                        className="editor-dropdown-arrow"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        width="16"
                                        height="16"
                                        aria-hidden="true"
                                    >
                                        <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </button>

                                {imageMenuOpen && (
                                    <div
                                        id="editor-image-options"
                                        className="editor-dropdown-menu"
                                    >
                                        {images.map(image => (
                                            <button
                                                key={image.id}
                                                type="button"
                                                className={`editor-dropdown-option ${
                                                    activeImage?.id === image.id ? 'is-selected' : ''
                                                }`}
                                                title={image.filename}
                                                onClick={() => {
                                                    openEditor(image.id);
                                                    setImageMenuOpen(false);
                                                }}
                                            >
                                                <span className="editor-dropdown-filename">
                                                    {image.filename}
                                                </span>

                                                {activeImage?.id === image.id && (
                                                    <span className="editor-dropdown-check">✓</span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <button
                            className="btn btn-secondary"
                            type="button"
                            onClick={() => setPage('library')}
                        >
                            ← Library
                        </button>
                    </div>
                }
            />
            <div
                className="work-layout watermark-workspace"
                style={
                    watermarkType === 'invisible'
                        ? {
                            gridTemplateColumns:
                                'minmax(235px, 280px) minmax(0, 1fr)',
                        }
                        : undefined
                }
            >
                <WatermarkSettingsPanel
                    title="Edit watermark"
                    includeType
                />

                <div className="panel preview-panel">
                    <div className="panel-heading preview-header">
                        <h2>
                            {processedCurrent
                                ? 'Processed image'
                                : 'Live preview'}
                        </h2>

                        <span className="muted-label">
                            {processedCurrent
                                ? processedCurrent.source === 'server'
                                    ? 'PIXELSEAL · PNG'
                                    : 'SHARP · PNG'
                                : `${activeImage?.filename ?? 'No image'} · ${
                                    watermarkType === 'visible'
                                        ? 'Visible'
                                        : 'Invisible'
                                }`}
                        </span>
                    </div>

                    {error && (
                        <div
                            className="notice-box"
                            role="alert"
                        >
                            <strong>Could not apply watermark</strong>
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="preview-stage">
                        {processedCurrent?.url ? (
                            <img className="preview-canvas" src={processedCurrent.url} alt="Processed image (Sharp)" />
                        ) : watermarkType === 'invisible' ? (
                            activeImage?.src
                                ? <img className="preview-canvas" src={activeImage.src} alt="Original image" />
                                : <p className="muted-label">Choose an image from Library</p>
                        ) : activeImage?.src ? (
                            <HybridBatchPreview
                                key={activeImage.id}
                                imageSrc={activeImage.src}
                                previewInput={sharpInput}
                                config={sharpConfig}
                                onPositionChange={setManualPosition}
                                onPatternOffsetChange={setManualPatternOffset}
                                disabled={processing}
                            />
                        ) : (
                            <p className="muted-label">Choose an image from Library</p>
                        )}
                    </div>

                    {watermarkType === 'visible' && activeImage && !processedCurrent && (
                        <div className="wm-drag-watermark-hint" role="note">
                            <span className="wm-drag-hint-symbol" aria-hidden="true">✥</span>
                            <span>
                                <strong>{settings.layout === 'pattern' ? 'Drag the pattern' : 'Drag the watermark'}</strong>
                                {settings.layout === 'pattern'
                                    ? ' anywhere on the photo to reposition the entire pattern.'
                                    : ' to any place on the photo.'}
                                {' '}Release to save. Changes remain local until Apply watermark.
                            </span>
                            {(settings.layout === 'single' ? manualPosition : manualPatternOffset) && (
                                <button type="button" className="wm-drag-reset" disabled={processing}
                                    onClick={() => settings.layout === 'single'
                                        ? setManualPosition(null) : setManualPatternOffset(null)}>
                                    Reset position
                                </button>
                            )}
                        </div>
                    )}

                    {watermarkType === 'invisible' &&
                        processing &&
                        batchStatus && (
                            <div
                                className="inline-message"
                                role="status"
                            >
                                PixelSeal processing: {processingCount} / 1 ·{' '}
                                {batchStatus.status}
                            </div>
                        )}

                    {watermarkType === 'invisible' &&
                        activeImage &&
                        !batchSource && (
                            <div className="notice-box">
                                <strong>Image cannot be processed</strong>
                                <span>
                                    src: {activeImage.src.slice(0, 80)} ·
                                    sourceRef: {activeImage.sourceRef ?? 'none'}
                                </span>
                            </div>
                        )}

                    <div className="preview-bottom">
                        <span>
                            <span className="small-dot" />
                            {processedCurrent
                                ? 'Watermarked copy ready · Original unchanged'
                                : watermarkType === 'invisible'
                                    ? 'Invisible watermark will be embedded by PixelSeal on the server'
                                    : 'Original is not modified'}
                        </span>

                        <div className="page-actions">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                disabled={
                                    !canApply ||
                                    processing ||
                                    downloading
                                }
                                onClick={() => void applyWatermark()}
                            >
                                {processing
                                    ? 'Processing...'
                                    : watermarkType === 'invisible'
                                        ? 'Apply invisible watermark'
                                        : 'Apply watermark'}
                            </button>

                            <button
                                type="button"
                                className="btn btn-primary"
                                disabled={
                                    !processedCurrent ||
                                    processing ||
                                    downloading
                                }
                                onClick={() => void downloadImage()}
                            >
                                {downloading
                                    ? 'Downloading...'
                                    : 'Download PNG ↓'}
                            </button>
                        </div>
                    </div>
                </div>

                {watermarkType === 'visible' && (
                    <WatermarkTemplatePanel />
                )}
            </div>
        </div>
    );
}