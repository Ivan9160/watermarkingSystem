import { PageHeading } from '../components/PageHeading';
import { useApp } from '../context/AppContext';

export function RemovalPage() {
    const { activeImage, setPage } = useApp();
    return <div className="page-shell">
        <PageHeading title="Watermark Removal" subtitle="Restore product images with future removal tools" actions={<span className="page-pill page-pill-muted">Planned feature</span>} />
        <div className="analysis-layout">
            <section className="panel image-review-panel">
                <div className="panel-heading"><h2>Source image</h2><span className="muted-label">{activeImage?.filename ?? 'No image selected'}</span></div>
                <div className="review-image-area">{activeImage ? <img src={activeImage.src} alt={`Source ${activeImage.filename}`} /> : <p>Choose an image in Library</p>}</div>
                <div className="panel-footer"><span>Reference preview</span><button className="subtle-link" onClick={() => setPage('library')}>Choose image →</button></div>
            </section>
            <section className="panel analysis-controls">
                <div className="panel-heading"><h2>Removal tool</h2><span className="muted-label">COMING SOON</span></div>
                <div className="analysis-illustration"><span>◈</span></div>
                <h3>Watermark removal</h3>
                <p>Automatic watermark detection and removal will be added when the image-processing engine is ready.</p>
                <label className="form-field"><span>Method</span><select disabled><option>Automatic removal (planned)</option></select></label>
                <label className="form-field"><span>Processing quality</span><select disabled><option>Balanced</option></select></label>
                <button className="btn btn-primary full-width" disabled>Remove watermark →</button>
                <div className="info-note">No images are currently modified or processed.</div>
            </section>
        </div>
    </div>;
}
