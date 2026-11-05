import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../services/api';
import {
    AllegroPublishError,
    applyBatchToAllegro,
    clearPublishRecord,
    readPublishRecord,
    savePublishRecord,
    type PublishRecord,
} from '../services/allegroUpload';
import type { BatchResultsResponse, Page } from '../types';

interface Props {
    batchId: string;
    imageCount: number;
    onClose: () => void;
    onNavigate: (page: Page) => void;
}

type Connection = 'checking' | 'connected' | 'disconnected' | 'unavailable';

const PROVIDERS = [{
    id: 'allegro',
    title: 'Allegro',
    description: 'Replace selected image positions in the connected Allegro offers.',
}] as const;

function displayDate(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
}

export function UploadToServiceModal({ batchId, imageCount, onClose, onNavigate }: Props) {
    const closeRef = useRef<HTMLButtonElement>(null);
    const inFlightRef = useRef(false);
    const [provider, setProvider] = useState<string>('allegro');
    const [connection, setConnection] = useState<Connection>('checking');
    const [results, setResults] = useState<BatchResultsResponse | null>(null);
    const [loadingResults, setLoadingResults] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [confirmed, setConfirmed] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [publishError, setPublishError] = useState('');
    const [record, setRecord] = useState<PublishRecord | null>(() => readPublishRecord(batchId));

    useEffect(() => {
        closeRef.current?.focus();
        function onKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape' && !inFlightRef.current) onClose();
        }
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    useEffect(() => {
        let alive = true;
        void api.getAllegroStatus()
            .then(data => { if (alive) setConnection(data.connected ? 'connected' : 'disconnected'); })
            .catch(() => { if (alive) setConnection('unavailable'); });
        void api.getBatchResults(batchId)
            .then(data => { if (alive) setResults(data); })
            .catch(error => {
                if (alive) setLoadError(error instanceof Error ? error.message : 'Could not load batch results.');
            })
            .finally(() => { if (alive) setLoadingResults(false); });
        return () => { alive = false; };
    }, [batchId]);

    const prepared = useMemo(() => {
        const offers = (results?.products ?? []).map(item => ({
            offerId: item.offerId,
            ready: item.images.filter(image => image.status === 'SUCCEEDED' && Boolean(image.url)).length,
            skipped: item.images.filter(image => image.status !== 'SUCCEEDED' || !image.url).length,
        }));
        return {
            offers,
            ready: offers.reduce((total, item) => total + item.ready, 0),
            skipped: offers.reduce((total, item) => total + item.skipped, 0),
            hasUnfinished: results?.products.some(item =>
                item.images.some(image => image.status === 'PENDING' || image.status === 'PROCESSING')) ?? false,
        };
    }, [results]);

    const published = record?.state === 'confirmed' ? record.response : null;
    const canPublish = provider === 'allegro' && connection === 'connected' &&
        !loadingResults && !loadError && !publishing && !published &&
        prepared.ready > 0 && !prepared.hasUnfinished;

    async function publish() {
        if (!canPublish || inFlightRef.current) return;
        inFlightRef.current = true;
        setPublishing(true);
        setPublishError('');
        const pending: PublishRecord = { state: 'pending', savedAt: new Date().toISOString() };
        savePublishRecord(batchId, pending);
        setRecord(pending);
        try {
            const response = await applyBatchToAllegro(batchId);
            const completed: PublishRecord = {
                state: 'confirmed',
                savedAt: new Date().toISOString(),
                response,
            };
            savePublishRecord(batchId, completed);
            setRecord(completed);
            setConfirmed(false);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown publishing error';
            setPublishError(message);
            if (error instanceof AllegroPublishError && [400, 401, 403, 404, 409, 422].includes(error.status ?? -1)) {
                clearPublishRecord(batchId);
                setRecord(null);
            }
        } finally {
            setPublishing(false);
            inFlightRef.current = false;
        }
    }

    function navigateToIntegrations() {
        if (publishing) return;
        onClose();
        onNavigate('integrations');
    }

    const resultSucceededOffers = published?.offers.filter(item => item.status === 'APPLIED').length ?? 0;
    const resultFailedOffers = published?.offers.filter(item => item.status === 'FAILED').length ?? 0;

    return createPortal(
        <div className="upload-dialog-backdrop" onMouseDown={event => {
            if (event.target === event.currentTarget && !inFlightRef.current) onClose();
        }}>
            <section className="upload-dialog upload-dialog-publish" role="dialog" aria-modal="true"
                aria-labelledby="upload-dialog-title" aria-describedby="upload-dialog-description">
                <div className="upload-dialog-head">
                    <div>
                        <h2 id="upload-dialog-title">Upload to service</h2>
                        <p id="upload-dialog-description">
                            {published ? 'Allegro publishing report' : 'Review the offers before publishing watermarked photographs.'}
                        </p>
                    </div>
                    <button type="button" ref={closeRef} className="upload-dialog-close" aria-label="Close upload window"
                        disabled={publishing} onClick={onClose}>×</button>
                </div>

                <div className="upload-dialog-body">
                    <div className="upload-dialog-summary">
                        <strong>{published ? `${published.appliedImagesCount} images applied` : `${prepared.ready || imageCount} processed images`}</strong>
                        <span>Batch {batchId.slice(0, 10)}…</span>
                    </div>

                    <div className="upload-provider-list" role="radiogroup" aria-label="Destination service">
                        {PROVIDERS.map(item => (
                            <button type="button" key={item.id} role="radio" aria-checked={provider === item.id}
                                disabled={publishing || Boolean(published)}
                                className={`upload-provider-option${provider === item.id ? ' is-selected' : ''}`}
                                onClick={() => setProvider(item.id)}>
                                <span className="upload-provider-logo" aria-hidden="true">A</span>
                                <span className="upload-provider-info">
                                    <strong>{item.title}</strong>
                                    <span>{item.description}</span>
                                    <em className={`upload-provider-state is-${connection}`}>
                                        {connection === 'checking' ? 'Checking connection…'
                                            : connection === 'connected' ? 'Account connected'
                                            : connection === 'disconnected' ? 'Account not connected'
                                            : 'Connection status unavailable'}
                                    </em>
                                </span>
                                <span className="upload-provider-radio" aria-hidden="true" />
                            </button>
                        ))}
                    </div>

                    {published ? (
                        <section className="wm-publish-result" aria-live="polite">
                            <div className="wm-publish-result-head">
                                <strong>Publication {published.status === 'APPLIED' ? 'completed' : 'partially completed'}</strong>
                                <span className={`wm-publish-state ${published.status === 'APPLIED' ? 'is-applied' : 'is-partial'}`}>
                                    {published.status}
                                </span>
                            </div>
                            <div className="wm-publish-metrics">
                                <span><strong>{published.appliedImagesCount}</strong> Images applied</span>
                                <span><strong>{resultSucceededOffers}</strong> Offers updated</span>
                                <span><strong>{resultFailedOffers}</strong> Offers failed</span>
                                <span><strong>{published.skippedImages.length}</strong> Images skipped</span>
                            </div>
                            <p className="wm-publish-muted">Response received {record?.savedAt ? displayDate(record.savedAt) : ''}. These results are saved in this browser.</p>
                            <div className="wm-publish-offers">
                                {published.offers.map(item => (
                                    <div className="wm-publish-offer" key={item.offerId}>
                                        <div className="wm-publish-offer-top">
                                            <strong>Offer {item.offerId}</strong>
                                            <span className={`wm-publish-state ${item.status === 'APPLIED' ? 'is-applied' : 'is-failed'}`}>
                                                {item.status}
                                            </span>
                                        </div>
                                        {item.status === 'APPLIED'
                                            ? <small>{item.images?.length ?? 0} image(s) replaced on Allegro</small>
                                            : <small className="wm-publish-error">{item.error ?? 'Unknown publication error'}</small>}
                                    </div>
                                ))}
                            </div>
                            {published.skippedImages.length > 0 && <div className="wm-publish-skipped">
                                <strong>Skipped images</strong>
                                <ul>{published.skippedImages.map(item => (
                                    <li key={item.imageId} title={item.reason}>
                                        {item.offerId} · {item.status}: {item.reason}
                                    </li>
                                ))}</ul>
                            </div>}
                            <p className="wm-publish-hint">
                                {published.status === 'PARTIAL'
                                    ? 'Some offers or images were not updated. Check Allegro before attempting any manual retry; the applied offers have already changed.'
                                    : 'The processed images have been sent to Allegro. Reimport the catalog to refresh the photos shown in WaterM.'}
                            </p>
                        </section>
                    ) : (
                        <>
                            <section className="wm-publish-review" aria-label="Publishing review">
                                <div className="wm-publish-section-head">
                                    <strong>Images to publish</strong>
                                    <span>{loadingResults ? 'Loading…' : `${prepared.offers.length} offer(s)`}</span>
                                </div>
                                {loadError && <p className="wm-publish-error" role="alert">{loadError}</p>}
                                {loadingResults && <p className="wm-publish-muted">Checking the latest batch results…</p>}
                                {!loadingResults && !loadError && <>
                                    <div className="wm-publish-counts">
                                        <span>{prepared.ready} ready to publish</span>
                                        <span>{prepared.skipped} skipped</span>
                                    </div>
                                    <div className="wm-publish-offers">
                                        {prepared.offers.map(item => (
                                            <div className="wm-publish-offer" key={item.offerId}>
                                                <strong>Offer {item.offerId}</strong>
                                                <small>{item.ready} ready · {item.skipped} skipped</small>
                                            </div>
                                        ))}
                                    </div>
                                    {prepared.hasUnfinished && <p className="wm-publish-error">Batch is still processing. Publication is unavailable.</p>}
                                    {prepared.ready === 0 && <p className="wm-publish-error">No successfully processed images are ready to publish.</p>}
                                </>}
                            </section>
                            <div className="upload-dialog-notice">
                                <strong>Allegro offer images will be replaced.</strong>
                                <p>The backend updates the same image indexes in each offer. This is not a preview-only action. It may replace original product photos. Failed batch images are skipped.</p>
                            </div>
                            <label className="wm-publish-confirm">
                                <input type="checkbox" checked={confirmed} disabled={publishing}
                                    onChange={event => setConfirmed(event.target.checked)} />
                                <span>I understand that this will replace images on the connected Allegro offers.</span>
                            </label>
                            {publishError && <p className="wm-publish-error wm-publish-server-error" role="alert">{publishError}</p>}
                            {publishing && <p className="wm-publish-progress" role="status">
                                Publishing images to Allegro… Do not close or reload this page.
                            </p>}
                        </>
                    )}
                </div>

                <div className="upload-dialog-footer">
                    {published ? <>
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
                        <button type="button" className="btn btn-primary" onClick={navigateToIntegrations}>Manage Allegro / Reimport</button>
                    </> : <>
                        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={publishing}>Cancel</button>
                        {connection !== 'connected' && <button type="button" className="btn btn-secondary"
                            onClick={navigateToIntegrations} disabled={publishing}>Allegro connection</button>}
                        <button type="button" className="btn btn-primary" disabled={!canPublish}
                            onClick={() => void publish()}>
                            {publishing ? 'Publishing…' : 'Confirm and upload to Allegro'}
                        </button>
                    </>}
                </div>
            </section>
        </div>,
        document.body,
    );
}