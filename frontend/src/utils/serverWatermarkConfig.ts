import type { ServerWatermarkConfig, ServerWatermarkFormat, WatermarkSettings } from '../types';

export function buildServerWatermarkConfig(
    settings: WatermarkSettings,
    format: ServerWatermarkFormat,
    quality: number,
): ServerWatermarkConfig {
    return {
        text: settings.text.trim(),
        mode: settings.layout === 'pattern' ? 'tile' : 'single',
        position: settings.position,
        color: settings.color,
        opacity: settings.opacity / 100,
        scale: Math.min(1, Math.max(0.05, Number((settings.size / 25).toFixed(3)))),
        angle: settings.layout === 'pattern' ? -30 : 0,
        spacing: 0.4,
        stagger: true,
        shadow: true,
        format,
        quality,
    };
}
