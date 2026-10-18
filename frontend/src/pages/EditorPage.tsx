import { PageHeading } from '../components/PageHeading';
import { PreviewCanvas } from '../components/PreviewCanvas';
import { WatermarkSettingsPanel } from '../components/WatermarkSettingsPanel';
import { useApp } from '../context/AppContext';

export function EditorPage() {
    const { activeImage, settings, watermarkType, setPage } = useApp();
    return <div className="page-shell">
        <PageHeading title="Watermark Editor" subtitle={activeImage?.filename ?? 'Select an image from Library'} actions={
            <button className="btn btn-secondary" onClick={() => setPage('library')}>← Library</button>
        } />
        <div className="work-layout">
            <WatermarkSettingsPanel title="Edit watermark" includeType />
            <div className="panel preview-panel">
                <div className="panel-heading preview-header"><h2>Live preview</h2><span className="muted-label">{activeImage?.filename ?? 'No image'} · {watermarkType === 'visible' ? 'Visible' : 'Original only'}</span></div>
                <div className="preview-stage"><PreviewCanvas imageSrc={activeImage?.src} settings={settings} visible={watermarkType === 'visible'} /></div>
                <div className="preview-bottom"><span><span className="small-dot" /> Local preview</span><span>Original is not modified</span></div>
            </div>
        </div>
    </div>;
}
