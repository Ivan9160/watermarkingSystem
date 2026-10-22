import { useApp } from '../context/AppContext';
import { TemplateControls } from './TemplateControls';
import type { WatermarkPosition } from '../types';

interface Props {
    title?: string;
    includeType?: boolean;
}

export function WatermarkSettingsPanel({ title = 'Watermark settings', includeType = false }: Props) {
    const { settings, updateSettings, watermarkType, setWatermarkType } = useApp();
    const unavailable = watermarkType === 'invisible';

    return (
        <div className="panel settings-panel">
            <div className="panel-heading"><h2>{title}</h2><span className="muted-label">TEMPLATES</span></div>
            <TemplateControls />
            {includeType && <label className="form-field">
                <span>Type</span>
                <select value={watermarkType} onChange={event => setWatermarkType(event.target.value as 'visible' | 'invisible')}>
                    <option value="visible">Visible watermark</option>
                    <option value="invisible">Invisible watermark</option>
                </select>
            </label>}
            {unavailable && <div className="notice-box"><strong>Invisible watermark — planned</strong><span>Embedding and extraction require the processing engine. You can store this setting in a template, but it cannot be rendered yet.</span></div>}
            <fieldset className="settings-fields" disabled={unavailable}>
                <label className="form-field">
                    <span>Watermark text</span>
                    <input type="text" value={settings.text} maxLength={70} onChange={event => updateSettings({ text: event.target.value })} />
                </label>
                <div className="form-field color-row">
                    <span>Text color</span>
                    <input type="color" aria-label="Watermark color" value={settings.color} onChange={event => updateSettings({ color: event.target.value })} />
                    <span className="color-hex">{settings.color.toUpperCase()}</span>
                </div>
                <label className="form-field range-field">
                    <span>Opacity <output>{settings.opacity}%</output></span>
                    <input type="range" min={0} max={100} value={settings.opacity} onChange={event => updateSettings({ opacity: Number(event.target.value) })} />
                </label>
                <label className="form-field range-field">
                    <span>Size <output>{settings.size}%</output></span>
                    <input type="range" min={2} max={12} value={settings.size} onChange={event => updateSettings({ size: Number(event.target.value) })} />
                </label>
                <label className="form-field">
                    <span>Layout</span>
                    <select value={settings.layout} onChange={event => updateSettings({ layout: event.target.value as 'single' | 'pattern' })}>
                        <option value="single">Single mark</option>
                        <option value="pattern">Repeating pattern</option>
                    </select>
                </label>
                <label className="form-field">
                    <span>Position</span>
                    <select disabled={settings.layout === 'pattern'} value={settings.position} onChange={event => updateSettings({ position: event.target.value as WatermarkPosition })}>
                        <option value="bottom-right">Bottom right</option>
                        <option value="bottom-left">Bottom left</option>
                        <option value="top-right">Top right</option>
                        <option value="top-left">Top left</option>
                        <option value="center">Center</option>
                    </select>
                </label>
            </fieldset>
            <div className="settings-footnote"><span className="small-dot" /> Changes are previewed locally</div>
        </div>
    );
}
