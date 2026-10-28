import { useEffect, useRef, useState } from 'react';
import { PageHeading } from '../components/PageHeading';
import { PreviewCanvas } from '../components/PreviewCanvas';
import { WatermarkSettingsPanel } from '../components/WatermarkSettingsPanel';
import { WatermarkTemplatePanel } from '../components/WatermarkTemplatePanel';
import { useApp } from '../context/AppContext';
import {
    renderWatermarkedPng,
    watermarkedFilename,
} from '../utils/exportWatermarkedImage';

interface ProcessedImage {
    key: string;
    url: string;
    filename: string;
    width: number;
    height: number;
}

export function EditorPage() {
    const { activeImage, settings, watermarkType, setPage } = useApp();
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState('');
    const [processed, setProcessed] = useState<ProcessedImage | null>(null);
    const mounted = useRef(true);
    const currentKey = JSON.stringify({
        imageId: activeImage?.id,
        imageSrc: activeImage?.src,
        watermarkType,
        settings,
    });
    const latestKey = useRef(currentKey);
    latestKey.current = currentKey;

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    useEffect(() => {
        return () => {
            if (processed) URL.revokeObjectURL(processed.url);
        };
    }, [processed]);

    useEffect(() => {
        setError('');
    }, [currentKey]);

    const processedCurrent = processed?.key === currentKey ? processed : null;
    const canApply = Boolean(
        activeImage &&
        watermarkType === 'visible' &&
        settings.text.trim() &&
        settings.opacity > 0,
    );

    async function applyWatermark() {
        if (!activeImage || !canApply || processing) return;

        const keyAtStart = currentKey;
        const filenameAtStart = activeImage.filename;
        setProcessing(true);
        setError('');

        try {
            const result = await renderWatermarkedPng(activeImage.src, settings);

            if (!mounted.current || latestKey.current !== keyAtStart) return;

            const url = URL.createObjectURL(result.blob);
            setProcessed({
                key: keyAtStart,
                url,
                filename: watermarkedFilename(filenameAtStart),
                width: result.width,
                height: result.height,
            });
        } catch (cause) {
            if (mounted.current && latestKey.current === keyAtStart) {
                setError(cause instanceof Error ? cause.message : 'Image processing failed.');
            }
        } finally {
            if (mounted.current) setProcessing(false);
        }
    }

    function downloadImage() {
        if (!processedCurrent) return;

        const link = document.createElement('a');
        link.href = processedCurrent.url;
        link.download = processedCurrent.filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
    }

    return (
        <div className="page-shell">
            <PageHeading
                title="Watermark Editor"
                subtitle={activeImage?.filename ?? 'Select an image from Library'}
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

            <div className="work-layout watermark-workspace">
                <WatermarkSettingsPanel title="Edit watermark" includeType />

                <div className="panel preview-panel">
                    <div className="panel-heading preview-header">
                        <h2>{processedCurrent ? 'Processed image' : 'Live preview'}</h2>
                        <span className="muted-label">
                            {processedCurrent
                                ? `${processedCurrent.width} × ${processedCurrent.height} · PNG`
                                : `${activeImage?.filename ?? 'No image'} · ${watermarkType === 'visible' ? 'Visible' : 'Original only'}`}
                        </span>
                    </div>

                    {error && (
                        <div className="notice-box" role="alert">
                            <strong>Could not apply watermark</strong>
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="preview-stage">
                        <PreviewCanvas
                            imageSrc={processedCurrent?.url ?? activeImage?.src}
                            settings={settings}
                            visible={!processedCurrent && watermarkType === 'visible'}
                        />
                    </div>

                    <div className="preview-bottom">
                        <span>
                            <span className="small-dot" />
                            {processedCurrent
                                ? 'Watermarked copy ready · Original unchanged'
                                : 'Original is not modified'}
                        </span>
                        <div className="page-actions">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                disabled={!canApply || processing}
                                onClick={() => void applyWatermark()}
                            >
                                {processing ? 'Processing...' : 'Apply watermark'}
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                disabled={!processedCurrent || processing}
                                onClick={downloadImage}
                            >
                                Download PNG ↓
                            </button>
                        </div>
                    </div>
                </div>
                <WatermarkTemplatePanel />
            </div>
        </div>
    );
}
