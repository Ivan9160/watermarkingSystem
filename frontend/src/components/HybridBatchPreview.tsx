import { useEffect, useMemo, useState } from 'react';
import { requestSharpPreview } from '../services/watermarkPreviewApi';
import type { ServerWatermarkConfig } from '../types';

interface Props {
    imageSrc: string;
    previewInput?: string;
    config: ServerWatermarkConfig;
}

type SharpResult = {
    key: string;
    imageSrc: string;
    objectUrl: string;
};

const DEBOUNCE_MS = 50;

export function HybridBatchPreview({ imageSrc, previewInput, config }: Props) {
    const requestKey = useMemo(
        () => JSON.stringify([imageSrc, previewInput, config]),
        [imageSrc, previewInput, config],
    );

    const [result, setResult] = useState<SharpResult | null>(null);

    const samePhoto = result?.imageSrc === imageSrc;
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

        const timeout = window.setTimeout(() => {
            if (cancelled) return;

            void (async () => {
                let objectUrl: string | null = null;
                try {
                    const blob = await requestSharpPreview(previewInput ?? imageSrc, config, controller.signal);
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
                } catch (reason) {
                    if (objectUrl) URL.revokeObjectURL(objectUrl);
                    if (cancelled || controller.signal.aborted) return;
                }
            })();
        }, DEBOUNCE_MS);

        return () => {
            cancelled = true;
            window.clearTimeout(timeout);
            controller.abort();
        };
    }, [imageSrc, requestKey]);

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
        </div>
    );
}
