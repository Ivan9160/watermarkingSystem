import { useEffect, useMemo, useState } from 'react';
import { PageHeading } from '../components/PageHeading';
import { PreviewCanvas } from '../components/PreviewCanvas';
import { UploadToServiceModal } from '../components/UploadToServiceModal';
import { HybridBatchPreview } from '../components/HybridBatchPreview';
import { WatermarkSettingsPanel } from '../components/WatermarkSettingsPanel';
import { WatermarkTemplatePanel } from '../components/WatermarkTemplatePanel';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { buildServerWatermarkConfig } from '../utils/serverWatermarkConfig';
import { countDownloadableImages, downloadBatchZip } from '../utils/downloadBatchZip';
import type {
    BatchResultsResponse, BatchStatusResponse, CreateBatchRequest,
    ProductImage, ServerWatermarkFormat,
} from '../types';

const ACTIVE_BATCH_KEY = 'waterm.activeBatchId.v1';
const POLL_MS = 1500;
const MAX_PRODUCTS = 20;
const MAX_IMAGES = 100;
const MAX_IMAGES_PER_PRODUCT = 20;

function offerIdOf(image: ProductImage): string | null {
    return image.offerId ?? image.filename.match(/^(.+)-\d{2}\.[^.]+$/)?.[1] ?? null;
}

function canUseAsBatchSource(image: ProductImage): boolean {
    if (image.source !== 'allegro' || !offerIdOf(image)) return false;
    try {
        return new URL(image.src).protocol === 'https:';
    } catch {
        return false;
    }
}

function buildProducts(images: ProductImage[]) {
    const grouped = new Map<string, Set<string>>();
    for (const image of images) {
        const offerId = offerIdOf(image);
        if (!offerId) continue;
        const urls = grouped.get(offerId) ?? new Set<string>();
        urls.add(image.src);
        grouped.set(offerId, urls);
    }
    return Array.from(grouped, ([offerId, urls]) => ({ offerId, images: [...urls] }));
}

function getMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unexpected batch processing error';
}

function isFinished(status: string) {
    return status === 'COMPLETED' || status === 'FAILED';
}

export function BatchPage() {
    const {
        images, selectedIds,
        settings, watermarkType, setPage,
    } = useApp();

    const [format, setFormat] = useState<ServerWatermarkFormat>('jpeg');
    const [quality, setQuality] = useState(90);

    const [batchId, setBatchId] = useState<string | null>(() => {
        try { return localStorage.getItem(ACTIVE_BATCH_KEY); }
        catch { return null; }
    });
    const [status, setStatus] = useState<BatchStatusResponse | null>(null);
    const [results, setResults] = useState<BatchResultsResponse | null>(null);
    const [busy, setBusy] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState('');
    const [uploadOpen, setUploadOpen] = useState(false);
    const [message, setMessage] = useState('');
    const [checkVersion, setCheckVersion] = useState(0);
    const [needsOrganization, setNeedsOrganization] = useState(false);
    const [organizationName, setOrganizationName] = useState('My WaterM Store');

    const chosenImages = useMemo(
        () => images.filter(image => selectedIds.includes(image.id)),
        [images, selectedIds],
    );
    const eligible = useMemo(() => chosenImages.filter(canUseAsBatchSource), [chosenImages]);
    const skipped = chosenImages.length - eligible.length;
    const products = useMemo(() => buildProducts(eligible), [eligible]);
    const imageCount = products.reduce((n, p) => n + p.images.length, 0);
    const serverConfig = useMemo(
        () => buildServerWatermarkConfig(settings, format, quality),
        [settings, format, quality],
    );

    const validationError = useMemo(() => {
        if (watermarkType !== 'visible') return 'Only visible watermarks are supported by the processing backend.';
        if (!settings.text.trim()) return 'Enter watermark text before processing.';
        if (!imageCount) return 'Select Allegro images in Image Library first. Local uploads are not yet supported by this endpoint.';
        if (imageCount > MAX_IMAGES) return `Too many images (${imageCount}). Maximum is ${MAX_IMAGES} per batch.`;
        if (products.length > MAX_PRODUCTS) return `Too many products (${products.length}). Maximum is ${MAX_PRODUCTS}.`;
        if (products.some(p => p.images.length > MAX_IMAGES_PER_PRODUCT)) {
            return `A product has over ${MAX_IMAGES_PER_PRODUCT} images. Reduce the selection.`;
        }
        return null;
    }, [watermarkType, settings.text, imageCount, products]);

    const finished = Boolean(status && isFinished(status.status));
    const active = Boolean(batchId && !finished);
    const completedCount = (status?.counts.succeeded ?? 0) + (status?.counts.failed ?? 0);
    const percent = status?.totalImages
        ? Math.min(100, Math.round(completedCount / status.totalImages * 100))
        : 0;

    useEffect(() => {
        if (!batchId) return;
        let stopped = false;
        let timeout: ReturnType<typeof setTimeout> | undefined;

        async function check() {
            try {
                const next = await api.getBatchStatus(batchId!);
                if (stopped) return;
                setStatus(next);
                setMessage('');

                if (isFinished(next.status)) {
                    const jobResults = await api.getBatchResults(batchId!);
                    if (!stopped) {
                        setResults(jobResults);
                        try { localStorage.removeItem(ACTIVE_BATCH_KEY); } catch { /* Storage can be blocked */ }
                    }
                    return;
                }
                timeout = setTimeout(() => { void check(); }, POLL_MS);
            } catch (error) {
                if (!stopped) setMessage(getMessage(error));
            }
        }

        void check();
        return () => {
            stopped = true;
            if (timeout) clearTimeout(timeout);
        };
    }, [batchId, checkVersion]);

    async function startBatch() {
        if (validationError || busy || active) return;
        const payload: CreateBatchRequest = {
            products,
            watermarkConfig: serverConfig,
        };
        setBusy(true);
        setMessage('');
        setNeedsOrganization(false);
        setResults(null);
        setDownloadProgress('');
        try {
            const created = await api.createBatch(payload);
            setStatus(null);
            setBatchId(created.batchId);
            try { localStorage.setItem(ACTIVE_BATCH_KEY, created.batchId); }
            catch { /* Not available in private browsing */ }
        } catch (error) {
            const reason = getMessage(error);
            setMessage(reason);
            if (reason.includes('Create an organization before creating a batch')) {
                setNeedsOrganization(true);
            }
        } finally {
            setBusy(false);
        }
    }

    async function createOrganization() {
        if (!organizationName.trim() || busy) return;
        setBusy(true);
        setMessage('');
        try {
            await api.createOrganization(organizationName.trim());
            setNeedsOrganization(false);
            setMessage('Organization created. You can now start the batch.');
        } catch (error) {
            setMessage(getMessage(error));
        } finally {
            setBusy(false);
        }
    }

    function resetJob() {
        if (active) return;
        setBatchId(null);
        setStatus(null);
        setResults(null);
        setMessage('');
        setDownloadProgress('');
        setUploadOpen(false);
        try { localStorage.removeItem(ACTIVE_BATCH_KEY); } catch { /* ignored */ }
    }

    const resultImages = results?.products.flatMap(product =>
        product.images.map(image => ({ ...image, offerId: product.offerId }))) ?? [];
    const readyCount = countDownloadableImages(results);
    const firstOutputUrl = resultImages.find(image => Boolean(image.url))?.url;

    async function downloadAll() {
        if (!batchId || !finished || !readyCount || downloading) return;
        setDownloading(true);
        setMessage('');
        setDownloadProgress('Updating download links…');
        try {
            // RustFS presigned URLs expire, so fetch fresh links before downloading.
            const latestResults = await api.getBatchResults(batchId);
            setResults(latestResults);
            const count = countDownloadableImages(latestResults);
            if (!count) throw new Error('There are no downloadable results.');
            await downloadBatchZip(batchId, latestResults, format, (current, total) => {
                setDownloadProgress(`Downloading ${current} / ${total} images…`);
            });
            setDownloadProgress(`ZIP created with ${count} images.`);
        } catch (error) {
            setMessage(getMessage(error));
            setDownloadProgress('');
        } finally {
            setDownloading(false);
        }
    }

    return (
        <div className="page-shell batch-processing-page">
            <PageHeading title="Batch Processing" actions={
                <span className="page-pill">Real time processing</span>
            } />
            <div className="work-layout watermark-workspace">
                <div className="settings-column">
                    <section className="panel batch-options-panel" aria-label="Batch setup">
                        <div className="panel-heading"><h2>Batch setup</h2></div>
                        <div className="batch-selection-row">
                            <div className="batch-selection-count">
                                <strong>{selectedIds.length}</strong>
                                <span>{selectedIds.length === 1 ? 'photo selected' : 'photos selected'}</span>
                            </div>
                            <button type="button" className="btn btn-secondary batch-choose-images"
                                onClick={() => setPage('library')}>Choose images</button>
                        </div>
                        {skipped > 0 && <p className="batch-note">
                            {skipped} selected image(s) cannot be processed by this endpoint (Allegro HTTPS images only).
                        </p>}
                        {imageCount > 0 && <p className="batch-selected-summary">
                            {imageCount} ready for processing · {products.length} {products.length === 1 ? 'offer' : 'offers'}
                        </p>}

                        <div className="batch-options-divider" />
                        <h3 className="batch-options-subtitle">Server output</h3>
                        <div className="batch-options-grid">
                            <label className="form-field"><span>Output format</span>
                                <select value={format} onChange={e => setFormat(e.target.value as ServerWatermarkFormat)}>
                                    <option value="jpeg">JPEG</option>
                                    <option value="png">PNG</option>
                                    <option value="webp">WebP</option>
                                </select>
                            </label>
                            {format !== 'png' && <label className="form-field"><span>Quality ({quality})</span>
                                <input type="range" min="1" max="100" value={quality}
                                    onChange={e => setQuality(Number(e.target.value))} />
                            </label>}
                        </div>
                    </section>
                    <WatermarkSettingsPanel title="Shared watermark" includeType />
                </div>

                <div className="panel preview-panel">
                    <div className="panel-heading preview-header">
                        <h2>{Boolean(firstOutputUrl)
                            ? 'Processed image' : 'Batch preview'}</h2>
                        <span className="muted-label">{Boolean(firstOutputUrl)
                            ? 'Actual output from Sharp' : eligible.length ? 'First selected photo · Browser simulation' : 'Select a photo to preview'}</span>
                    </div>
                    <div className="preview-stage">
                        {firstOutputUrl
                            ? <img
                                className="preview-canvas batch-actual-result"
                                src={firstOutputUrl}
                                alt="Actual watermarked output returned by the processing server"
                            />
                            : eligible[0] && watermarkType === 'visible' && settings.text.trim()
                                ? <HybridBatchPreview imageSrc={eligible[0].src} config={serverConfig} />
                                : <PreviewCanvas templateOnly settings={settings} visible={watermarkType === 'visible'} />}
                    </div>

                    {batchId && <section className="batch-job-panel" aria-live="polite">
                        <div className="batch-job-heading">
                            <strong>Batch {batchId.slice(0, 8)}…</strong>
                            <span className="status-chip">{status?.status ?? 'CONNECTING'}</span>
                        </div>
                        <div className="batch-progress-row">
                            <span>{completedCount} / {status?.totalImages ?? imageCount} processed</span>
                            <strong>{percent}%</strong>
                        </div>
                        <progress className="batch-progress" value={percent} max="100">{percent}%</progress>
                        <div className="batch-stats">
                            <span>Queued: {status?.counts.pending ?? '—'}</span>
                            <span>Running: {status?.counts.processing ?? '—'}</span>
                            <span>Success: {status?.counts.succeeded ?? '—'}</span>
                            <span>Failed: {status?.counts.failed ?? '—'}</span>
                        </div>
                        {finished && <div className="batch-job-actions">
                            <button type="button" className="btn btn-secondary" onClick={() => void downloadAll()}
                                disabled={downloading || readyCount === 0}>
                                {downloading ? 'Preparing ZIP…' : 'Download all'}
                            </button>
                            <button type="button" className="btn btn-secondary" onClick={() => setUploadOpen(true)}
                                disabled={readyCount === 0}>
                                Upload to service
                            </button>
                            {downloadProgress && <span className="batch-download-progress" role="status">{downloadProgress}</span>}
                        </div>}
                    </section>}

                    {results && <section className="batch-results" aria-label="Processed image results">
                        <div className="batch-results-heading">
                            <strong>Results ({resultImages.filter(image => image.url).length} ready)</strong>
                            <button type="button" className="subtle-link" onClick={() => setCheckVersion(x => x + 1)}>Refresh links</button>
                        </div>
                        <p className="batch-note">Files are stored on RustFS. Download links expire; refresh them when needed.</p>
                        <div className="batch-results-list">
                            {resultImages.map(image => <div className="batch-result-item" key={image.id}>
                                <span className="batch-result-name" title={`${image.offerId} · Image ${image.index + 1}`}>
                                    {image.offerId} · #{image.index + 1}
                                </span>
                                <span className="batch-result-status">{image.status}</span>
                                {image.url ? <a className="batch-result-link" href={image.url}
                                    target="_blank" rel="noopener noreferrer">Preview</a>
                                    : image.error ? <span className="batch-result-error" title={image.error}>{image.error}</span> : null}
                            </div>)}
                        </div>
                    </section>}

                    {message && <p className="batch-message" role="alert">{message}</p>}
                    {needsOrganization && <div className="batch-organization-panel">
                        <p>A WaterM organization is required for your Allegro seller before the first batch.</p>
                        <label className="form-field"><span>Organization name</span>
                            <input type="text" maxLength={100} value={organizationName}
                                onChange={e => setOrganizationName(e.target.value)} />
                        </label>
                        <button type="button" className="btn btn-secondary" disabled={busy || !organizationName.trim()}
                            onClick={() => void createOrganization()}>Create organization</button>
                    </div>}

                    <div className="preview-bottom batch-bottom">
                        <span><span className="small-dot" /> Original images will not be overwritten</span>
                        {finished
                            ? <button type="button" className="btn btn-primary" onClick={resetJob}
                                disabled={busy || downloading}>New batch →</button>
                            : <button type="button" className="btn btn-primary"
                                onClick={() => void startBatch()}
                                disabled={busy || active || Boolean(validationError)}>
                                {busy ? 'Starting…' : active ? 'Processing…' : 'Start processing →'}
                            </button>}
                    </div>
                    <div className="batch-footer-info">
                        {validationError ?? 'Runs asynchronously using NestJS, Redis, Sharp and RustFS.'}

                    </div>
                </div>
                <WatermarkTemplatePanel />
            </div>
            {uploadOpen && batchId && <UploadToServiceModal
                batchId={batchId}
                imageCount={readyCount}
                onClose={() => setUploadOpen(false)}
                onNavigate={setPage}
            />}
        </div>
    );
}
