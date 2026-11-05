import type { ChangeEvent } from 'react';

interface Props {
    visible: boolean;
    invisible: boolean;
    onVisibleChange: (enabled: boolean) => void;
    onInvisibleChange: (enabled: boolean) => void;
}

export function BatchWatermarkModes({ visible, invisible, onVisibleChange, onInvisibleChange }: Props) {
    return (
        <section className="panel wm-batch-modes" aria-label="Watermark methods">
            <div className="panel-heading"><h2>Watermarks</h2></div>
            <div className="wm-batch-modes-row">
                <label className={`wm-batch-mode${visible ? ' is-on' : ''}`}>
                    <input type="checkbox" checked={visible} disabled={visible && !invisible}
                        onChange={(event: ChangeEvent<HTMLInputElement>) => onVisibleChange(event.target.checked)} />
                    <span>Visible</span>
                </label>
                <label className={`wm-batch-mode${invisible ? ' is-on' : ''}`}>
                    <input type="checkbox" checked={invisible} disabled={invisible && !visible}
                        onChange={(event: ChangeEvent<HTMLInputElement>) => onInvisibleChange(event.target.checked)} />
                    <span>Invisible <small>PixelSeal</small></span>
                </label>
            </div>
            {invisible && <p className="wm-batch-modes-note">PNG output · Auto ID per image</p>}
        </section>
    );
}
