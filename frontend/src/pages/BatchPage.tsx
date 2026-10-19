import { PageHeading } from '../components/PageHeading';
import { PreviewCanvas } from '../components/PreviewCanvas';
import { WatermarkSettingsPanel } from '../components/WatermarkSettingsPanel';
import { useApp } from '../context/AppContext';

export function BatchPage() {
    const { images, selectedIds, batchImages, batchScope, setBatchScope, settings, watermarkType, setPage } = useApp();
    return <div className="page-shell">
        <PageHeading title="Batch Processing" subtitle="One watermark template for your whole catalog" actions={<span className="page-pill page-pill-muted" >Preview mode</span>} />
        <div className="work-layout">
            <div className="settings-column">
                <div className="panel scope-panel">
                    <div className="panel-heading"><h2>Processing scope</h2><span className="muted-label">DEMO</span></div>
                    <div className="scope-segmented">
                        <button className={batchScope === 'selected' ? 'active' : ''} onClick={() => setBatchScope('selected')}>Selected ({selectedIds.length})</button>
                        <button className={batchScope === 'all' ? 'active' : ''} onClick={() => setBatchScope('all')}>All ({images.length})</button>
                    </div>
                    <p className="scope-description"><strong>{batchImages.length}</strong> images included</p>
                </div>
                <WatermarkSettingsPanel title="Shared template" includeType />
            </div>
            <div className="panel preview-panel">
                <div className="panel-heading preview-header"><h2>Template preview</h2><span className="muted-label">Applied proportionally to each image</span></div>
                <div className="preview-stage"><PreviewCanvas templateOnly settings={settings} visible={watermarkType === 'visible'} /></div>
                <div className="preview-bottom batch-bottom"><span><span className="small-dot" /> Same settings as Editor</span><button className="btn btn-primary" disabled title="Requires NestJS processing backend">Start processing →</button></div>
                <div className="batch-footer-info">Batch execution will become available after backend and worker integration. <button onClick={() => setPage('library')}>Manage selection</button></div>
            </div>
        </div>
    </div>;
}
