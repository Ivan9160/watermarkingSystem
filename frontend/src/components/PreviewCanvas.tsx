
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { WatermarkSettings } from '../types';
import { drawWatermark } from '../utils/drawWatermark';

interface Props {
    imageSrc?: string;
    settings: WatermarkSettings;
    templateOnly?: boolean;
    visible?: boolean;
}

const WIDTH = 920;
const HEIGHT = 585;

type LoadedImage = {
    src: string;
    image: HTMLImageElement;
};

export function PreviewCanvas({
    imageSrc,
    settings,
    templateOnly = false,
    visible = true,
}: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [loadedImage, setLoadedImage] = useState<LoadedImage | null>(null);

    // Load the image only when its source changes.
    useEffect(() => {
        if (!imageSrc || templateOnly) return;

        let cancelled = false;
        const image = new Image();

        image.onload = () => {
            if (!cancelled) {
                setLoadedImage({ src: imageSrc, image });
            }
        };

        image.onerror = () => {
            if (!cancelled) setLoadedImage(null);
        };

        image.src = imageSrc;

        return () => {
            cancelled = true;
            image.onload = null;
            image.onerror = null;
        };
    }, [imageSrc, templateOnly]);

    // Redraw without reloading the image or resetting canvas size.
    useLayoutEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');

        if (!ctx) return;

        ctx.clearRect(0, 0, WIDTH, HEIGHT);

        // Empty template preview or image not loaded yet.
        if (templateOnly || !imageSrc || loadedImage?.src !== imageSrc) {
            ctx.fillStyle = '#e5e9f0';
            ctx.fillRect(0, 0, WIDTH, HEIGHT);

            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgba(55,68,93,0.075)';

            for (let x = 0; x <= WIDTH; x += 46) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, HEIGHT);
                ctx.stroke();
            }

            for (let y = 0; y <= HEIGHT; y += 46) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(WIDTH, y);
                ctx.stroke();
            }

            if (visible && (templateOnly || !imageSrc)) {
                drawWatermark(ctx, WIDTH, HEIGHT, settings);
            }

            return;
        }

        // Use the already loaded image.
        const image = loadedImage.image;

        ctx.fillStyle = '#222b3a';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        const scale = Math.min(
            (WIDTH - 48) / image.naturalWidth,
            (HEIGHT - 48) / image.naturalHeight
        );

        const width = image.naturalWidth * scale;
        const height = image.naturalHeight * scale;

        const left = (WIDTH - width) / 2;
        const top = (HEIGHT - height) / 2;

        ctx.drawImage(image, left, top, width, height);

        // Draw the watermark on top of the existing image.
        if (visible) {
            ctx.save();

            ctx.translate(left, top);
            ctx.beginPath();
            ctx.rect(0, 0, width, height);
            ctx.clip();

            drawWatermark(ctx, width, height, settings);

            ctx.restore();
        }
    }, [imageSrc, loadedImage, settings, templateOnly, visible]);

    return (
        <canvas
            ref={canvasRef}
            width={WIDTH}
            height={HEIGHT}
            className="preview-canvas"
            aria-label={
                templateOnly
                    ? 'Watermark template preview'
                    : 'Image watermark preview'
            }
        />
    );
}
