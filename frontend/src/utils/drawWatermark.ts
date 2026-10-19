import type { WatermarkSettings } from '../types';

export function drawWatermark(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    settings: WatermarkSettings,
) {
    const text = settings.text.trim();
    if (!text || settings.opacity === 0) return;

    const fontSize = Math.max(14, width * settings.size / 100);
    ctx.save();
    ctx.globalAlpha = settings.opacity / 100;
    ctx.fillStyle = settings.color;
    ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.2)';
    ctx.shadowBlur = 2;

    if (settings.layout === 'pattern') {
        ctx.translate(width / 2, height / 2);
        ctx.rotate(-Math.PI / 6);
        ctx.textAlign = 'center';
        const stepX = Math.max(ctx.measureText(text).width + fontSize * 2.1, width * 0.27);
        const stepY = Math.max(fontSize * 3.3, height * 0.2);
        const extent = Math.hypot(width, height);
        for (let y = -extent; y <= extent; y += stepY) {
            for (let x = -extent; x <= extent; x += stepX) {
                ctx.fillText(text, x, y);
            }
        }
    } else {
        const margin = Math.max(15, width * 0.045);
        let x = width - margin;
        let y = height - margin - fontSize / 2;
        ctx.textAlign = 'right';
        if (settings.position.includes('left')) {
            x = margin;
            ctx.textAlign = 'left';
        }
        if (settings.position.includes('top')) y = margin + fontSize / 2;
        if (settings.position === 'center') {
            x = width / 2;
            y = height / 2;
            ctx.textAlign = 'center';
        }
        ctx.fillText(text, x, y, width - 2 * margin);
    }
    ctx.restore();
}
