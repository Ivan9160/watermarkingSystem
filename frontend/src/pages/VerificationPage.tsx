import { PageHeading } from '../components/PageHeading';
import { useApp } from '../context/AppContext';

export function VerificationPage() {
    const { activeImage, setPage } = useApp();
    return <div className="page-shell">
        <PageHeading title="Watermark Verification" subtitle="Detect and validate embedded watermarks" actions={<span className="page-pill page-pill-muted">Planned feature</span>} />
        <div className="analysis-layout">
            <section className="panel image-review-panel">
                <div className="panel-heading"><h2>Image for verification</h2><span className="muted-label">{activeImage?.filename ?? 'No image selected'}</span></div>
                <div className="review-image-area">{activeImage ? <img src={activeImage.src} alt={`Verify ${activeImage.filename}`} /> : <p>Choose an image in Library</p>}</div>
                <div className="panel-footer"><span>Reference preview</span><button className="subtle-link" onClick={() => setPage('library')}>Choose image →</button></div>
            </section>
            <section className="panel analysis-controls">
                <div className="panel-heading"><h2>Detection</h2><span className="muted-label">COMING SOON</span></div>
                <div className="analysis-illustration"><span>◎</span></div>
                <h3>Verify ownership</h3>
                <p>Later, this panel will display the extracted watermark identifier and detection result.</p>
                <label className="form-field"><span>Algorithm</span><select disabled><option>Automatic detection (planned)</option></select></label>
                <button className="btn btn-primary full-width" disabled>Verify image →</button>
                <div className="info-note">Verification requires a watermark extraction algorithm.</div>
            </section>
        </div>
    </div>;
}
