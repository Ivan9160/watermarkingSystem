import { useEffect, useRef, useState } from 'react';

import { PageHeading } from '../components/PageHeading';
import { PreviewCanvas } from '../components/PreviewCanvas';
import { WatermarkSettingsPanel } from '../components/WatermarkSettingsPanel';
import { WatermarkTemplatePanel } from '../components/WatermarkTemplatePanel';

import { useApp } from '../context/AppContext';
import { api } from '../services/api';

import {
    renderWatermarkedPng,
    watermarkedFilename,
} from '../utils/exportWatermarkedImage';

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
        activeImage,
        settings,
        watermarkType,
        setPage,
    } = useApp();

    const [processing, setProcessing] = useState(false);
    const [downloading, setDownloading] = useState(false);

    const [error, setError] = useState('');
    const [processed, setProcessed] = useState<ProcessedImage | null>(null);

    const [batchStatus, setBatchStatus] =
        useState<BatchStatusResponse | null>(null);

    const mounted = useRef(true);
    const operationId = useRef(0);

    const currentKey = JSON.stringify({
        imageId: activeImage?.id,
        imageSrc: activeImage?.src,
        watermarkType,
        settings,
    });

    const latestKey = useRef(currentKey);
    latestKey.current = currentKey;

    const batchSource = activeImage
        ? getBatchSource(activeImage)
        : null;

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
        if (!activeImage) return;

        const result = await renderWatermarkedPng(
            activeImage.src,
            settings,
        );

        if (
            !mounted.current ||
            latestKey.current !== keyAtStart
        ) {
            return;
        }

        const url = URL.createObjectURL(result.blob);

        setProcessed({
            key: keyAtStart,
            url,
            filename: watermarkedFilename(filenameAtStart),
            width: result.width,
            height: result.height,
            source: 'client',
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
        <div className="page-shell">
            <PageHeading
                title="Watermark Editor"
                subtitle={
                    activeImage?.filename ??
                    'Select an image from Library'
                }
                actions={
                    <button
                        className="btn btn-secondary"
                        type="button"
                        onClick={() => setPage('library')}
                    >
                        ← Library
                    </button>
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
                                    : `${processedCurrent.width} × ${processedCurrent.height} · PNG`
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
                        <PreviewCanvas
                            imageSrc={
                                processedCurrent?.url ??
                                activeImage?.src
                            }
                            settings={settings}
                            visible={
                                !processedCurrent &&
                                watermarkType === 'visible'
                            }
                        />
                    </div>

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