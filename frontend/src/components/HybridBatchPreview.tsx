import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { ServerWatermarkConfig } from '../types';
export type DragPosition = { x: number; y: number };

interface Props {
    imageSrc: string;
    previewInput?: string;
    config: ServerWatermarkConfig;
    onPositionChange?: (position: DragPosition) => void;
    onPatternOffsetChange?: (position: DragPosition) => void;
    disabled?: boolean;
}

type Dimensions = { src: string; width: number; height: number };
type DragSession = {
    pointerId: number;
    mode: 'single' | 'tile';
    startX: number;
    startY: number;
    originX: number;
    originY: number;
};
type Stamp = { x: number; y: number; key: string };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round4 = (v: number) => Math.round(v * 10000) / 10000;
const wrap = (v: number) => ((v % 1) + 1) % 1;

function geometry(config: ServerWatermarkConfig, width: number) {
    const markW = Math.max(16, Math.round(width * config.scale));
    const fontSize = Math.max(8, Math.round((markW * 0.94) / (Math.max(1, config.text.length) * 0.78)));
    const markH = Math.round(fontSize * 1.5);
    const baseline = Math.round(fontSize * 1.1);
    const radians = config.angle * Math.PI / 180;
    const rotatedW = Math.ceil(Math.abs(markW * Math.cos(radians)) + Math.abs(markH * Math.sin(radians)));
    const rotatedH = Math.ceil(Math.abs(markW * Math.sin(radians)) + Math.abs(markH * Math.cos(radians)));
    return { markW, markH, fontSize, baseline, rotatedW, rotatedH };
}

function shade(hex: string): string {
    const raw = hex.slice(1);
    const h = raw.length === 3 ? [...raw].map(ch => ch + ch).join('') : raw;
    const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? '#000' : '#fff';
}

function preset(position: ServerWatermarkConfig['position'], w: number, h: number, markW: number, markH: number): [number, number] {
    const margin = 20;
    return ({
        'top-left': [margin, margin],
        'top-right': [w - markW - margin, margin],
        'bottom-left': [margin, h - markH - margin],
        'bottom-right': [w - markW - margin, h - markH - margin],
        center: [(w - markW) / 2, (h - markH) / 2],
    } as Record<ServerWatermarkConfig['position'], [number, number]>)[position];
}

function stamps(w: number, h: number, ow: number, oh: number, spacing: number, stagger: boolean, offset: DragPosition): Stamp[] {
    const cellW = ow + Math.round(ow * spacing);
    const cellH = oh + Math.round(oh * spacing);
    const periodW = cellW * (stagger ? 2 : 1);
    const periodH = cellH * (stagger ? 2 : 1);
    const dx = offset.x * periodW;
    const dy = offset.y * periodH;
    const list: Stamp[] = [];
    const bases = stagger ? [[0, 0], [cellW, cellH]] : [[0, 0]];
    for (let row = -2; row <= Math.ceil(h / periodH) + 1; row++) {
        for (let col = -2; col <= Math.ceil(w / periodW) + 1; col++) {
            for (const [bx, by] of bases) {
                const x = Math.round(col * periodW + bx + dx);
                const y = Math.round(row * periodH + by + dy);
                if (x >= 0 && y >= 0 && x + ow <= w && y + oh <= h) {
                    list.push({ x, y, key: `${col}-${row}-${bx}-${by}` });
                }
            }
        }
    }
    return list;
}

export function HybridBatchPreview({ imageSrc, config, onPositionChange, onPatternOffsetChange, disabled = false }: Props) {
    const [dimensions, setDimensions] = useState<Dimensions | null>(null);
    const [loadError, setLoadError] = useState(false);
    const [draft, setDraft] = useState<DragPosition | null>(null);
    const [dragging, setDragging] = useState(false);
    const svgRef = useRef<SVGSVGElement>(null);
    const sessionRef = useRef<DragSession | null>(null);
    const draftRef = useRef<DragPosition | null>(null);
    const svgId = useId().replace(/[^a-zA-Z0-9_-]/g, '_');

    useEffect(() => {
        let cancelled = false;
        const img = new Image();
        setDimensions(null);
        setLoadError(false);
        img.onload = () => { if (!cancelled) setDimensions({ src: imageSrc, width: img.naturalWidth, height: img.naturalHeight }); };
        img.onerror = () => { if (!cancelled) setLoadError(true); };
        img.src = imageSrc;
        return () => { cancelled = true; img.onload = null; img.onerror = null; };
    }, [imageSrc]);

    const ready = dimensions?.src === imageSrc && dimensions.width > 0 && dimensions.height > 0;
    const w = ready ? dimensions.width : 1;
    const h = ready ? dimensions.height : 1;
    const { markW, markH, fontSize, baseline, rotatedW, rotatedH } = geometry(config, w);
    const maxX = Math.max(0, w - markW);
    const maxY = Math.max(0, h - markH);
    const singlePosition = config.mode === 'single' ? draft ?? config.customPosition : config.customPosition;
    const [presetX, presetY] = preset(config.position, w, h, markW, markH);
    const left = Math.round(clamp(singlePosition ? maxX * singlePosition.x : presetX, 0, maxX));
    const top = Math.round(clamp(singlePosition ? maxY * singlePosition.y : presetY, 0, maxY));
    const patternOffset = config.mode === 'tile' ? draft ?? config.patternOffset ?? { x: 0, y: 0 } : { x: 0, y: 0 };
    const cellW = rotatedW + Math.round(rotatedW * config.spacing);
    const cellH = rotatedH + Math.round(rotatedH * config.spacing);
    const periodW = cellW * (config.stagger ? 2 : 1);
    const periodH = cellH * (config.stagger ? 2 : 1);
    const canDragSingle = ready && config.mode === 'single' && !!onPositionChange && !disabled && !!config.text.trim();
    const canDragPattern = ready && config.mode === 'tile' && !!onPatternOffsetChange && !disabled && !!config.text.trim();
    const shadow = shade(config.color);
    const textPresent = Boolean(config.text.trim());
    const repeated = useMemo(() => textPresent && config.mode === 'tile'
        ? stamps(w, h, rotatedW, rotatedH, config.spacing, config.stagger, patternOffset)
        : [], [w, h, rotatedW, rotatedH, config.spacing, config.stagger, patternOffset.x, patternOffset.y, config.mode, textPresent]);

    function toImagePoint(event: { clientX: number; clientY: number }) {
        const svg = svgRef.current;
        const matrix = svg?.getScreenCTM();
        if (!svg || !matrix) return { x: 0, y: 0 };
        const point = svg.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        const original = point.matrixTransform(matrix.inverse());
        return { x: original.x, y: original.y };
    }

    function startDrag(event: ReactPointerEvent<SVGElement>, mode: 'single' | 'tile') {
        if ((mode === 'single' ? !canDragSingle : !canDragPattern) || event.button !== 0 || sessionRef.current) return;
        const pt = toImagePoint(event);
        const start = mode === 'single'
            ? config.customPosition ?? { x: maxX ? left / maxX : 0, y: maxY ? top / maxY : 0 }
            : config.patternOffset ?? { x: 0, y: 0 };
        sessionRef.current = { pointerId: event.pointerId, mode, startX: pt.x, startY: pt.y, originX: start.x, originY: start.y };
        draftRef.current = start;
        svgRef.current?.setPointerCapture(event.pointerId);
        setDragging(true);
        event.preventDefault();
    }

    function moveDrag(event: ReactPointerEvent<SVGSVGElement>) {
        const current = sessionRef.current;
        if (!current || current.pointerId !== event.pointerId) return;
        const pt = toImagePoint(event);
        const deltaX = pt.x - current.startX;
        const deltaY = pt.y - current.startY;
        const next = current.mode === 'single'
            ? { x: maxX ? round4(clamp(current.originX + deltaX / maxX, 0, 1)) : 0, y: maxY ? round4(clamp(current.originY + deltaY / maxY, 0, 1)) : 0 }
            : { x: round4(wrap(current.originX + deltaX / periodW)), y: round4(wrap(current.originY + deltaY / periodH)) };
        draftRef.current = next;
        setDraft(next); // Local only — no request to the server.
    }

    function finishDrag(event: ReactPointerEvent<SVGSVGElement>, cancelled = false) {
        const current = sessionRef.current;
        if (!current || current.pointerId !== event.pointerId) return;
        const next = draftRef.current;
        sessionRef.current = null;
        draftRef.current = null;
        setDragging(false);
        setDraft(null);
        if (svgRef.current?.hasPointerCapture(event.pointerId)) svgRef.current.releasePointerCapture(event.pointerId);
        if (next && !cancelled) {
            if (current.mode === 'single') onPositionChange?.(next);
            else onPatternOffsetChange?.(next);
        }
    }

    function keyboardMove(event: ReactKeyboardEvent<SVGGElement>) {
        if (!canDragSingle) return;
        const step = event.shiftKey ? 0.05 : 0.01;
        const curr = config.customPosition ?? { x: maxX ? left / maxX : 0, y: maxY ? top / maxY : 0 };
        let { x, y } = curr;
        if (event.key === 'ArrowLeft') x -= step;
        else if (event.key === 'ArrowRight') x += step;
        else if (event.key === 'ArrowUp') y -= step;
        else if (event.key === 'ArrowDown') y += step;
        else if (event.key === 'Home') { x = 0.5; y = 0.5; }
        else return;
        event.preventDefault();
        onPositionChange?.({ x: round4(clamp(x, 0, 1)), y: round4(clamp(y, 0, 1)) });
    }

    const textNode = (key: string) => <>
        {config.shadow && <text key={`${key}-shadow`} x="1" y={baseline - markH / 2 + 1} fill={shadow} fillOpacity={config.opacity * 0.7}
            textAnchor="middle" fontFamily="Arial,Helvetica,sans-serif" fontSize={fontSize} fontWeight="bold">{config.text}</text>}
        <text key={`${key}-text`} x="0" y={baseline - markH / 2} fill={config.color} fillOpacity={config.opacity}
            textAnchor="middle" fontFamily="Arial,Helvetica,sans-serif" fontSize={fontSize} fontWeight="bold">{config.text}</text>
    </>;

    return <div className="hybrid-batch-preview wm-local-batch-preview">
        <div className="wm-local-preview-area">
            {loadError && <p className="wm-local-preview-message" role="alert">Cannot display the source image. Check your WaterM session.</p>}
            {!loadError && !ready && <p className="wm-local-preview-message">Loading image…</p>}
            {ready && <svg ref={svgRef} className={`wm-local-preview-svg${dragging ? ' is-dragging' : ''}`} width={w} height={h}
                viewBox={`0 0 ${w} ${h}`} xmlns="http://www.w3.org/2000/svg" role="img"
                aria-label="Local browser preview with draggable watermarks" onPointerMove={moveDrag}
                onPointerUp={(event: ReactPointerEvent<SVGSVGElement>) => finishDrag(event)} onPointerCancel={(event: ReactPointerEvent<SVGSVGElement>) => finishDrag(event, true)}>
                <defs><clipPath id={`wm-photo-${svgId}`}><rect x="0" y="0" width={w} height={h}/></clipPath></defs>
                <image href={imageSrc} x="0" y="0" width={w} height={h} preserveAspectRatio="none" pointerEvents="none" />
                {textPresent && config.mode === 'tile' && <g clipPath={`url(#wm-photo-${svgId})`} pointerEvents="none">
                    {repeated.map(mark => <g key={mark.key} transform={`translate(${mark.x + rotatedW / 2}, ${mark.y + rotatedH / 2}) rotate(${config.angle})`}>
                        {textNode(mark.key)}
                    </g>)}
                </g>}
                {textPresent && config.mode === 'single' && <g className={`wm-local-watermark${canDragSingle ? ' is-editable' : ''}`}
                    transform={`translate(${left}, ${top})`} onPointerDown={(event: ReactPointerEvent<SVGGElement>) => startDrag(event, 'single')}
                    onKeyDown={keyboardMove} tabIndex={canDragSingle ? 0 : -1} role={canDragSingle ? 'button' : undefined}
                    aria-label={canDragSingle ? 'Drag watermark or move with arrow keys' : undefined}>
                    <rect className="wm-local-watermark-boundary" x="0" y="0" width={markW} height={markH} fill="transparent"
                        strokeWidth={Math.max(1, w * 0.0015)} rx={Math.max(3, w * 0.003)} />
                    <g transform={`translate(${markW / 2}, ${markH / 2})`} pointerEvents="none">{textNode('single')}</g>
                </g>}
                {config.mode === 'tile' && <rect className={canDragPattern ? 'wm-local-pattern-drag-target' : ''}
                    x="0" y="0" width={w} height={h} fill="transparent"
                    pointerEvents={canDragPattern ? 'all' : 'none'} onPointerDown={(event: ReactPointerEvent<SVGRectElement>) => startDrag(event, 'tile')} />}
            </svg>}
        </div>
    </div>;
}
