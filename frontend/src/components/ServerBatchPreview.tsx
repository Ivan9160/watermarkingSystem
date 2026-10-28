import { useEffect, useRef, useState } from 'react';
import type { ServerWatermarkConfig } from '../types';

interface Props {
    imageSrc: string;
    config: ServerWatermarkConfig;
}

const CANVAS_WIDTH = 920;
const CANVAS_HEIGHT = 585;

interface LoadedImage {
    src: string;
    image: HTMLImageElement;
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Failed to load preview image'));
        // The Allegro image may not send CORS headers. We draw only; never export this canvas.
        image.src = src;
    });
}

function escapeXml(value: string): string {
    return value.replace(/[<>&"']/g, character => {
        const replacement: Record<string, string> = {
            '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
        };
        return replacement[character] ?? character;
    });
}

function shadowColorFor(hex: string): string {
    const raw = hex.replace('#', '');
    const h = raw.length === 3 ? raw.split('').map(c => c + c).join('') : raw;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#ffffff';
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    return canvas;
}

async function createServerOverlay(
    config: ServerWatermarkConfig,
    imageWidth: number,
): Promise<HTMLCanvasElement> {
    const text = config.text;
    const targetWidth = Math.max(16, Math.round(imageWidth * config.scale));
    const fontSize = Math.max(8, Math.round((targetWidth * 0.94) / (text.length * 0.78)));
    const overlayHeight = Math.round(fontSize * 1.5);
    const baselineY = Math.round(fontSize * 1.1);
    const centerX = targetWidth / 2;

    const shadow = config.shadow
        ? `<text x="${centerX + 1}" y="${baselineY + 1}" fill="${shadowColorFor(config.color)}" fill-opacity="${config.opacity * 0.7}">${escapeXml(text)}</text>`
        : '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${targetWidth}" height="${overlayHeight}">
        <g font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="bold" text-anchor="middle">
            ${shadow}
            <text x="${centerX}" y="${baselineY}" fill="${config.color}" fill-opacity="${config.opacity}">${escapeXml(text)}</text>
        </g>
    </svg>`;

    const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    const original = makeCanvas(targetWidth, overlayHeight);
    original.getContext('2d')?.drawImage(image, 0, 0);

    if (config.angle === 0) return original;
    const angle = config.angle * Math.PI / 180;
    const cos = Math.abs(Math.cos(angle));
    const sin = Math.abs(Math.sin(angle));
    const rotated = makeCanvas(
        Math.ceil(original.width * cos + original.height * sin),
        Math.ceil(original.height * cos + original.width * sin),
    );
    const ctx = rotated.getContext('2d');
    if (!ctx) return original;
    ctx.translate(rotated.width / 2, rotated.height / 2);
    ctx.rotate(angle);
    ctx.drawImage(original, -original.width / 2, -original.height / 2);
    return rotated;
}

function makeTile(overlay: HTMLCanvasElement, config: ServerWatermarkConfig): HTMLCanvasElement {
    const cellWidth = overlay.width + Math.round(overlay.width * config.spacing);
    const cellHeight = overlay.height + Math.round(overlay.height * config.spacing);
    const tile = makeCanvas(
        config.stagger ? cellWidth * 2 : cellWidth,
        config.stagger ? cellHeight * 2 : cellHeight,
    );
    const ctx = tile.getContext('2d');
    ctx?.drawImage(overlay, 0, 0);
    if (config.stagger) ctx?.drawImage(overlay, cellWidth, cellHeight);
    return tile;
}

export function ServerBatchPreview({ imageSrc, config }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [loaded, setLoaded] = useState<LoadedImage | null>(null);
    const [error, setError] = useState('');
    const [sizeWarning, setSizeWarning] = useState(false);

    useEffect(() => {
        let active = true;
        setError('');
        setSizeWarning(false);
        void loadImage(imageSrc)
            .then(image => { if (active) setLoaded({ src: imageSrc, image }); })
            .catch(() => { if (active) { setLoaded(null); setError('Cannot load this photo for preview.'); } });
        return () => { active = false; };
    }, [imageSrc]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;
        let cancelled = false;
        if (!loaded || loaded.src !== imageSrc || !config.text.trim()) {
            ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            return;
        }

        void (async () => {
            const image = loaded.image;
            const originalWidth = image.naturalWidth;
            const originalHeight = image.naturalHeight;
            if (!originalWidth || !originalHeight) return;
            const offscreen = makeCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
            const paint = offscreen.getContext('2d');
            if (!paint) return;

            paint.fillStyle = '#222b3a';
            paint.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            const displayScale = Math.min(
                (CANVAS_WIDTH - 48) / originalWidth,
                (CANVAS_HEIGHT - 48) / originalHeight,
            );
            const x = (CANVAS_WIDTH - originalWidth * displayScale) / 2;
            const y = (CANVAS_HEIGHT - originalHeight * displayScale) / 2;

            paint.save();
            paint.translate(x, y);
            paint.scale(displayScale, displayScale);
            paint.drawImage(image, 0, 0);

            const overlay = await createServerOverlay(config, originalWidth);
            if (cancelled) return;
            let oversized = false;

            if (config.mode === 'tile') {
                const tile = makeTile(overlay, config);
                oversized = tile.width > originalWidth || tile.height > originalHeight;
                const pattern = paint.createPattern(tile, 'repeat');
                if (pattern) {
                    paint.fillStyle = pattern;
                    paint.fillRect(0, 0, originalWidth, originalHeight);
                }
            } else {
                const margin = 20; // Backend's DEFAULTS.margin
                let left = originalWidth - overlay.width - margin;
                let top = originalHeight - overlay.height - margin;
                if (config.position.includes('left')) left = margin;
                if (config.position.includes('top')) top = margin;
                if (config.position === 'center') {
                    left = (originalWidth - overlay.width) / 2;
                    top = (originalHeight - overlay.height) / 2;
                }
                oversized = overlay.width > originalWidth || overlay.height > originalHeight;
                paint.drawImage(overlay, Math.max(0, Math.round(left)), Math.max(0, Math.round(top)));
            }
            paint.restore();
            if (cancelled) return;
            ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            ctx.drawImage(offscreen, 0, 0);
            setSizeWarning(oversized);
            setError('');
        })().catch(() => { if (!cancelled) setError('Could not build watermark preview.'); });

        return () => { cancelled = true; };
    }, [loaded, imageSrc, config]);

    return <div className="server-batch-preview">
        <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="preview-canvas"
            aria-label="Browser simulation of the server watermark on the first selected Allegro image"
        />
        {error && <p className="batch-preview-warning" role="status">{error}</p>}
        {sizeWarning && <p className="batch-preview-warning" role="status">
            The watermark tile may exceed this image's dimensions. Sharp can reject this combination.
        </p>}
    </div>;
}
