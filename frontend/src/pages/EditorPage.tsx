import { useEffect, useMemo, useRef, useState } from 'react';

import { PageHeading } from '../components/PageHeading';
import { HybridBatchPreview, type DragPosition } from '../components/HybridBatchPreview';
import { WatermarkSettingsPanel } from '../components/WatermarkSettingsPanel';
import { WatermarkTemplatePanel } from '../components/WatermarkTemplatePanel';

import { useApp } from '../context/AppContext';
import { api } from '../services/api';

import { requestSharpPreview } from '../services/watermarkPreviewApi';
import { buildServerWatermarkConfig } from '../utils/serverWatermarkConfig';
import { EditorImagePicker } from '../components/EditorImagePicker';
import {
    POLL_MS, MAX_POLL_ATTEMPTS, getBatchSource, isFinished, getMessage,
    delay, invisibleFilename, getSuccessfulImage, getFailedImageMessage,
    triggerDownload, type ProcessedImage, type BatchSource,
} from '../utils/editorHelpers';

import type {
    BatchStatusResponse,
    BatchWatermarkConfig,
    CreateBatchRequest,
} from '../types';

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

                        <EditorImagePicker images={images} activeImage={activeImage} processing={processing} openEditor={openEditor} />

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
                                : `${activeImage?.filename ?? 'No image'} · ${watermarkType === 'visible'
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
