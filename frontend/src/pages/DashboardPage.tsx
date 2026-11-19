import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeading } from '../components/PageHeading';
import { useApp } from '../context/AppContext';
import { useTemplates } from '../context/TemplateContext';
import { api } from '../services/api';
import type {
    AllegroConnection, ImportProgress, Page, ProductImage,
} from '../types';

function offerIdOf(image: ProductImage): string | undefined {
    return image.offerId || (image.source === 'allegro'
        ? image.filename.match(/^(.+)-\d{2}\.(?:jpe?g|png|webp)$/i)?.[1]
        : undefined);
}

function batchEligible(image: ProductImage): boolean {
    if (image.source !== 'allegro' || !offerIdOf(image)) return false;
    try { return new URL(image.src).protocol === 'https:'; }
    catch { return false; }
}

function readableDate(date: string | undefined | null): string {
    if (!date) return 'Not available';
    const time = new Date(date);
    return Number.isNaN(time.getTime()) ? 'Not available'
        : time.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function latestStageLabel(stage: ImportProgress['stage']): string {
    switch (stage) {
        case 'fetching-offers': return 'Finding Allegro offers…';
        case 'fetching-images': return 'Importing offer images…';
        case 'completed': return 'Latest import finished';
        case 'failed': return 'Latest import failed';
        default: return 'Import from the Integrations page';
    }
}

export function DashboardPage() {
    const {
        images, selectedIds, session, setPage,
        settings, watermarkType, importProgress, catalogLoading, catalogError,
    } = useApp();
    const { templates, activeTemplate } = useTemplates();

    const [connection, setConnection] = useState<AllegroConnection | null>(null);
    const [connectionError, setConnectionError] = useState('');
    const [connectionLoading, setConnectionLoading] = useState(true);
    const [remoteImport, setRemoteImport] = useState<ImportProgress | null>(null);
    const [connectionRefresh, setConnectionRefresh] = useState(0);

    const refreshConnection = useCallback(() => setConnectionRefresh(current => current + 1), []);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setConnectionLoading(true);
            try {
                const next = await api.getAllegroStatus();
                if (cancelled) return;
                setConnection(next);
                setConnectionError('');
                if (next.connected) {
                    try {
                        const progress = await api.getAllegroImportProgress();
                        if (!cancelled) setRemoteImport(progress);
                    } catch { if (!cancelled) setRemoteImport(null); }
                } else {
                    setRemoteImport(null);
                }
            } catch (error) {
                if (!cancelled) {
                    setConnection(null);
                    setRemoteImport(null);
                    setConnectionError(error instanceof Error ? error.message : 'Could not check connection');
                }
            } finally { if (!cancelled) setConnectionLoading(false); }
        }
        void load();
        return () => { cancelled = true; };
    }, [connectionRefresh]);

    const allegroImages = useMemo(() => images.filter(image => image.source === 'allegro'), [images]);
    const localImages = useMemo(() => images.filter(image => image.source === 'local'), [images]);
    const offers = useMemo(() => new Set(allegroImages.map(offerIdOf).filter(Boolean)).size, [allegroImages]);
    const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
    const eligibleCount = useMemo(() => images.filter(image => selectedSet.has(image.id) && batchEligible(image)).length,
        [images, selectedSet]);
    const selectedEligible = useMemo(() => images.filter(image => selectedSet.has(image.id) && batchEligible(image)),
        [images, selectedSet]);
    const selectedOffers = useMemo(() => new Set(selectedEligible.map(offerIdOf).filter(Boolean)).size, [selectedEligible]);
    const batchReady = useMemo(() => {
        const groups = new Map<string, Set<string>>();
        for (const image of selectedEligible) {
            const offer = offerIdOf(image);
            if (!offer) continue;
            const urls = groups.get(offer) ?? new Set<string>();
            urls.add(image.src);
            groups.set(offer, urls);
        }
        const total = Array.from(groups.values()).reduce((sum, urls) => sum + urls.size, 0);
        return watermarkType === 'visible' && !!settings.text.trim() &&
            total > 0 && total <= 100 && groups.size <= 20 &&
            Array.from(groups.values()).every(urls => urls.size <= 20);
    }, [selectedEligible, watermarkType, settings.text]);
    const effectiveImport = importProgress.stage !== 'idle' ? importProgress : remoteImport;
    const connected = connection?.connected === true;
    const recentImages = images.slice(-5).reverse();

    function navigate(page: Page) { setPage(page); }

    return (
        <div className="page-shell dashboard-page wm-dashboard-page">
            <PageHeading
                title="Dashboard"
                subtitle="Your product image workspace at a glance"
                actions={<button type="button" className="btn btn-primary" onClick={() => navigate('batch')}>
                    <span aria-hidden="true">＋</span> New batch
                </button>}
            />
            <div className="wm-dashboard-content scrollable-content">
                <section className="wm-dash-hero" aria-label="Workspace overview">
                    <div className="wm-dash-hero-media" aria-hidden="true">
                        <img
                            src="/assets/waterm_dashboard_animation.gif"
                            alt=""
                            className="wm-dash-hero-gif"
                        />
                        <div className="wm-dash-hero-overlay" />
                    </div>

                    <div className="wm-dash-hero-main">
                        <span className="wm-dash-eyebrow">
                            <span className="wm-dash-spark">✦</span> WatermarkOS / WORKSPACE
                        </span>
                        <h2>
                            Your images.<br />
                            <span>Ready to protect.</span>
                        </h2>
                        <p>
                            Manage your catalog, apply reusable watermarks and keep processing in one place.
                        </p>
                        <div className="wm-dash-hero-buttons">
                            <button
                                type="button"
                                className="btn btn-light"
                                onClick={() => navigate('library')}
                            >
                                Open image library <span aria-hidden="true">↗</span>
                            </button>
                            <button
                                type="button"
                                className="wm-dash-hero-text-btn"
                                onClick={() => navigate('templates')}
                            >
                                Browse templates <span aria-hidden="true">→</span>
                            </button>
                        </div>
                    </div>
                    <div className="wm-dash-workspace-card">
                        <div className="wm-dash-workspace-top">
                            <span>YOUR WORKSPACE</span>
                            <span aria-hidden="true">◈</span>
                        </div>
                        <strong title={session.workspace.name}>
                            {session.workspace.name}
                        </strong>
                        <div className="wm-dash-workspace-divider" />
                        <div className="wm-dash-workspace-line">
                            <span>Connected service</span>
                            <b>
                                {connectionLoading
                                    ? 'Checking…'
                                    : connected
                                        ? 'Allegro'
                                        : connectionError
                                            ? 'Unavailable'
                                            : 'None'}
                            </b>
                        </div>
                        <div className="wm-dash-workspace-line">
                            <span>Watermark draft</span>
                            <b>
                                {settings.layout === 'pattern'
                                    ? 'Repeating pattern'
                                    : 'Single watermark'}
                            </b>
                        </div>
                    </div>
                </section>

                <section className="wm-dash-stats" aria-label="Live workspace statistics">
                    <Stat label="Images in library" value={catalogLoading ? '…' : images.length}
                        note={`${localImages.length} local · ${allegroImages.length} Allegro`} symbol="▧" />
                    <Stat label="Selected images" value={selectedIds.length}
                        note={`${eligibleCount} eligible for Batch`} symbol="✓" />
                    <Stat label="Allegro offers" value={offers}
                        note="Unique offers in imported library" symbol="▣" />
                    <Stat label="Saved templates" value={templates.length}
                        note={activeTemplate ? `Active: ${activeTemplate.name}` : 'Stored in this browser'} symbol="◈" />
                </section>

                {catalogError && <p className="wm-dash-inline-alert" role="alert">Catalog sync: {catalogError}</p>}

                <div className="wm-dash-main-grid">
                    <section className="panel wm-dash-card wm-dash-store" aria-label="Allegro integration">
                        <div className="wm-dash-section-top">
                            <div><h2>Connected marketplace</h2><p>Your e-commerce image source</p></div>
                            <button type="button" className="wm-dash-inline-action" onClick={refreshConnection}>Refresh <span aria-hidden="true">↻</span></button>
                        </div>
                        <div className="wm-dash-service">
                            <div className="wm-dash-service-logo" aria-hidden="true">a</div>
                            <div className="wm-dash-service-name"><strong>Allegro</strong><span>{connection?.sellerName || 'Product catalog integration'}</span></div>
                            <span className={`wm-dash-status ${connected ? 'wm-dash-status--completed' : ''}`}>
                                {connectionLoading ? 'Checking…' : connected ? 'Connected' : connectionError ? 'Unavailable' : 'Not connected'}
                            </span>
                        </div>
                        {connectionError && <p role="alert" className="wm-dash-inline-alert">{connectionError}</p>}
                        <div className="wm-dash-store-metrics">
                            <div><strong>{offers}</strong><span>Imported offers</span></div>
                            <div><strong>{allegroImages.length}</strong><span>Product photos</span></div>
                            <div><strong>{selectedOffers}</strong><span>Selected offers</span></div>
                        </div>
                        <div className="wm-dash-sync-box">
                            <span className="wm-dash-sync-dot" />
                            <div><strong>{effectiveImport ? latestStageLabel(effectiveImport.stage) : connected ? 'Ready to import' : 'Connect your store to import'}</strong>
                                <small>{connection?.lastSyncedAt
                                    ? `Last sync: ${readableDate(connection.lastSyncedAt)}`
                                    : connected ? 'Manage imports in Integrations' : 'No live catalog connection'}
                                </small>
                            </div>
                        </div>
                        <button type="button" className="btn btn-secondary wm-dash-full-button" onClick={() => navigate('integrations')}>
                            {connected ? 'Manage Allegro connection' : 'Connect Allegro'} <span aria-hidden="true">→</span>
                        </button>
                    </section>
                </div>

                <section className="panel wm-dash-card wm-dash-workflow" aria-label="Catalog workflow">
                    <div className="wm-dash-section-top"><div><h2>Your workflow</h2><p>From imported photos to watermarked results</p></div>
                        <span className="muted-label">3 STEPS</span>
                    </div>
                    <div className="wm-dash-workflow-grid">
                        <WorkflowStep number="01" title="Connect & import" note={connected ? `${allegroImages.length} Allegro photos in Library` : 'Connect a marketplace account'}
                            active={connected} action="Integrations" onClick={() => navigate('integrations')} />
                        <WorkflowStep number="02" title="Select images" note={`${eligibleCount} eligible selected · ${selectedOffers} offers`}
                            active={eligibleCount > 0} action="Image library" onClick={() => navigate('library')} />
                        <WorkflowStep number="03" title="Apply watermark" note="Preview and process selected photos"
                            active={batchReady} action="Batch processing" onClick={() => navigate('batch')} />
                    </div>
                    <div className="wm-dash-workflow-footnote">Uploading processed photos back to Allegro is planned for a future update.</div>
                </section>

                <div className="wm-dash-bottom-grid">
                    <section className="panel wm-dash-card wm-dash-library" aria-label="Image library preview">
                        <div className="wm-dash-section-top"><div><h2>Image library</h2><p>Photos currently available in your workspace</p></div>
                            <button type="button" className="wm-dash-inline-action" onClick={() => navigate('library')}>View all →</button>
                        </div>
                        {recentImages.length ? <div className="wm-dash-gallery">
                            {recentImages.map(image => <button type="button" className="wm-dash-gallery-item" key={image.id}
                                onClick={() => navigate('library')} title={image.filename} aria-label={`Open library to view ${image.filename}`}>
                                <img src={image.src} alt={image.filename} loading="lazy" />
                                <span>{image.source === 'allegro' ? 'ALLEGRO' : image.source === 'local' ? 'LOCAL' : 'SERVER'}</span>
                            </button>)}
                        </div> : <div className="wm-dash-small-empty">No photos yet. Import from Allegro or upload your own images.</div>}
                    </section>
                    <section className="panel wm-dash-card wm-dash-template" aria-label="Watermark template overview">
                        <div className="wm-dash-section-top"><div><h2>Watermark templates</h2><p>Your reusable watermark presets</p></div>
                            <button type="button" className="wm-dash-inline-action" onClick={() => navigate('templates')}>Manage →</button>
                        </div>
                        <div className="wm-dash-template-body">
                            <div className="wm-dash-template-icon" aria-hidden="true">◈</div>
                            <div><span className="wm-dash-template-caption">{activeTemplate ? 'ACTIVE TEMPLATE' : 'CURRENT DRAFT'}</span>
                                <strong>{activeTemplate?.name || 'Unsaved watermark'}</strong>
                                <small>{settings.layout === 'pattern' ? 'Repeating pattern' : 'Single mark'} · {settings.opacity}% opacity</small>
                            </div>
                        </div>
                        <div className="wm-dash-template-footer">
                            <span>{templates.length} saved {templates.length === 1 ? 'template' : 'templates'}</span>
                            <button type="button" className="wm-dash-inline-action" onClick={() => navigate('editor')}>Open editor →</button>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}

function Stat({ label, value, note, symbol }: { label: string; value: string | number; note: string; symbol: string }) {
    return <div className="wm-dash-stat">
        <div className="wm-dash-stat-top"><span>{label}</span><span className="wm-dash-stat-symbol" aria-hidden="true">{symbol}</span></div>
        <strong>{value}</strong><small title={note}>{note}</small>
    </div>;
}

function WorkflowStep({ number, title, note, active, action, onClick }: {
    number: string; title: string; note: string; active: boolean; action: string; onClick: () => void;
}) {
    return <div className="wm-dash-step">
        <div className="wm-dash-step-upper"><span className="wm-dash-step-number">{number}</span>
            <span className={`wm-dash-step-state ${active ? 'wm-dash-step-state--ready' : ''}`}>{active ? 'Ready' : 'Next step'}</span>
        </div>
        <strong>{title}</strong><small>{note}</small>
        <button type="button" className="wm-dash-step-button" onClick={onClick}>{action} <span aria-hidden="true">→</span></button>
    </div>;
}
