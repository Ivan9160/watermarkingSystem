import { useEffect, useMemo, useState } from 'react';
import { requestSharpPreview } from '../services/watermarkPreviewApi';
import type { ServerWatermarkConfig } from '../types';

interface Props {
    imageSrc: string;
    config: ServerWatermarkConfig;
}

type SharpResult = {
    key: string;
    imageSrc: string;
    objectUrl: string;
};

type RequestPhase = 'waiting' | 'processing' | 'error';
const DEBOUNCE_MS = 50;

export function HybridBatchPreview({ imageSrc, config }: Props) {
    const requestKey = useMemo(
        () => JSON.stringify([imageSrc, config]),
        [imageSrc, config],
    );

    const [result, setResult] = useState<SharpResult | null>(null);
    const [phase, setPhase] = useState<RequestPhase>('waiting');
    const [error, setError] = useState('');

    const samePhoto = result?.imageSrc === imageSrc;
    const upToDate = samePhoto && result?.key === requestKey;
    const displayedUrl = samePhoto ? result.objectUrl : imageSrc;

    useEffect(() => {
        const url = result?.objectUrl;
        return () => {
            if (url) URL.revokeObjectURL(url);
        };
    }, [result?.objectUrl]);

    useEffect(() => {
        const controller = new AbortController();
        let cancelled = false;

        setPhase('waiting');
        setError('');

        const timeout = window.setTimeout(() => {
            if (cancelled) return;
            setPhase('processing');

            void (async () => {
                let objectUrl: string | null = null;
                try {
                    const blob = await requestSharpPreview(imageSrc, config, controller.signal);
                    if (cancelled || controller.signal.aborted) return;

                    objectUrl = URL.createObjectURL(blob);
                    // Decode before displaying, avoiding an empty frame during replacement.
                    const image = new Image();
                    image.src = objectUrl;
                    await image.decode();

                    if (cancelled || controller.signal.aborted) {
                        URL.revokeObjectURL(objectUrl);
                        return;
                    }
                    setResult({ key: requestKey, imageSrc, objectUrl });
                    objectUrl = null; // The result cleanup effect now owns this URL.
                    setPhase('waiting');
                } catch (reason) {
                    if (objectUrl) URL.revokeObjectURL(objectUrl);
                    if (cancelled || controller.signal.aborted) return;
                    setError(reason instanceof Error ? reason.message : 'Sharp preview failed');
                    setPhase('error');
                }
            })();
        }, DEBOUNCE_MS);

        return () => {
            cancelled = true;
            window.clearTimeout(timeout);
            controller.abort();
        };
    }, [imageSrc, requestKey]);

    let label: string;
    let statusClass: string;

    if (upToDate) {
        label = '● Exact Sharp preview · up to date';
        statusClass = 'hybrid-preview-exact';
    } else if (phase === 'error') {
        label = `Sharp preview failed: ${error}. ${samePhoto ? 'Showing previous result.' : 'Showing original photo.'}`;
        statusClass = 'hybrid-preview-error';
    } else if (samePhoto) {
        label = 'Updating Sharp preview… Previous result is shown until the new one is ready.';
        statusClass = 'hybrid-preview-pending';
    } else {
        label = 'Generating Sharp preview… Original photo shown temporarily.';
        statusClass = 'hybrid-preview-pending';
    }

    return (
        <div className="hybrid-batch-preview">
            <div className="hybrid-preview-visual">
                <img
                    className="hybrid-preview-photo"
                    src={displayedUrl}
                    alt={samePhoto
                        ? 'Server-rendered watermark preview'
                        : 'Original selected image while generating server preview'}
                />
            </div>
            <div className="hybrid-preview-status" role="status" aria-live="polite">
                <span className={statusClass}>{label}</span>
            </div>
        </div>
    );
}
