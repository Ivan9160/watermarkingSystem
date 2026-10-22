import { useCallback, useEffect, useRef, useState } from 'react';
import { PageHeading } from '../components/PageHeading';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import type { AllegroConnection, ImportProgress } from '../types';

const POLL_INTERVAL_MS = 1000;
const EMPTY_PROGRESS: ImportProgress = {
    stage: 'idle',
    totalOffers: null,
    processedOffers: 0,
    importedImages: 0,
    failedOffers: 0,
};

function isImportRunning(stage: ImportProgress['stage']): boolean {
    return stage === 'fetching-offers' || stage === 'fetching-images';
}

function getProgressLabel(progress: ImportProgress): string {
    switch (progress.stage) {
        case 'fetching-offers':
            return 'Finding seller offers in Allegro...';
        case 'fetching-images':
            return 'Collecting photos from each product...';
        case 'completed':
            return 'Import completed';
        case 'failed':
            return 'Import failed';
        default:
            return 'Ready to import product photos';
    }
}

export function IntegrationsPage() {
    const {
        setPage,
        importAllegroImages,
        clearAllegroImages,
        setLibrarySourceFilter,
        importProgress,
        setImportProgress,
    } = useApp();

    const [connection, setConnection] = useState<AllegroConnection>({ connected: false });
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState('');

    const returnedFromOAuth = useRef(
        new URLSearchParams(window.location.search).get('allegro') === 'connected',
    );

    const activeRequest = useRef(0);

    const runImport = useCallback(async (resume: boolean) => {
        const requestId = ++activeRequest.current;
        const stillActive = () => activeRequest.current === requestId;

        setBusy(true);
        setNotice('');

        try {
            let progress = resume
                ? await api.getAllegroImportProgress()
                : await api.startAllegroImport();

            if (!stillActive()) return;
            setImportProgress(progress);

            if (progress.stage === 'idle') return;

            while (isImportRunning(progress.stage)) {
                await new Promise<void>(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
                if (!stillActive()) return;

                progress = await api.getAllegroImportProgress();
                if (!stillActive()) return;
                setImportProgress(progress);
            }

            if (!stillActive()) return;

            if (progress.stage === 'failed') {
                setNotice(progress.error ?? 'Allegro could not finish importing photos.');
                return;
            }

            if (progress.stage !== 'completed') {
                setNotice('Import stopped unexpectedly. Try importing again.');
                return;
            }

            const { items, offerCount, failedOffers } = await api.getAllegroImages();
            if (!stillActive()) return;

            importAllegroImages(items);
            setLibrarySourceFilter('allegro');
            if (failedOffers > 0) {
                setNotice(
                    `Imported ${items.length} photos from ${offerCount} offers. ` +
                    `${failedOffers} offers could not be loaded.`,
                );
            }
            setPage('library');
        } catch (error) {
            if (stillActive()) {
                setNotice(error instanceof Error ? error.message : 'Could not import Allegro photos');
            }
        } finally {
            if (stillActive()) setBusy(false);
        }
    }, [importAllegroImages, setImportProgress, setLibrarySourceFilter, setPage]);

    useEffect(() => {
        let mounted = true;
        if (returnedFromOAuth.current) {
            const url = new URL(window.location.href);
            url.searchParams.delete('allegro');
            window.history.replaceState(null, '', url.pathname + url.search + url.hash);
        }

        async function initialize() {
            try {
                const status = await api.getAllegroStatus();
                if (!mounted) return;
                setConnection(status);

                if (!status.connected) {
                    clearAllegroImages();
                    returnedFromOAuth.current = false;
                    setImportProgress({ ...EMPTY_PROGRESS });
                    return;
                }

                if (returnedFromOAuth.current) {
                    returnedFromOAuth.current = false;
                    void runImport(false);
                    return;
                }

                const progress = await api.getAllegroImportProgress();
                if (!mounted) return;
                setImportProgress(progress);
                if (isImportRunning(progress.stage)) {
                    void runImport(true);
                }
            } catch (error) {
                if (mounted) {
                    setNotice(error instanceof Error ? error.message : 'Could not load Allegro status');
                }
            }
        }

        void initialize();

        return () => {
            mounted = false;
            activeRequest.current++;
        };
    }, [clearAllegroImages, runImport, setImportProgress]);

    function connect() {
        window.location.assign(api.getAllegroLoginUrl());
    }

    async function disconnect() {
        activeRequest.current++;
        setBusy(true);
        setNotice('');
        try {
            await api.disconnectAllegro();
            clearAllegroImages();
            setConnection({ connected: false });
            setImportProgress({ ...EMPTY_PROGRESS });
            setLibrarySourceFilter('all');
            setNotice('Allegro disconnected. Your local photos are preserved.');
        } catch (error) {
            setNotice(error instanceof Error ? error.message : 'Could not disconnect Allegro');
        } finally {
            setBusy(false);
        }
    }

    function openAllegroLibrary() {
        setLibrarySourceFilter('allegro');
        setPage('library');
    }

    const percent = importProgress.totalOffers === null
        ? undefined
        : importProgress.totalOffers === 0
            ? (importProgress.stage === 'completed' ? 100 : 0)
            : Math.min(100, Math.round(
                (importProgress.processedOffers / importProgress.totalOffers) * 100,
            ));

    const showProgress = connection.connected && (busy || importProgress.stage !== 'idle');

    return (
        <div className="page-shell">
            <PageHeading
                title="Integrations"
                subtitle="Connect your e-commerce image sources"
                actions={<span className="page-pill">Allegro Sandbox</span>}
            />

            <div className="integration-content scrollable-content">
                <section className="panel integration-card">
                    <div className="integration-title">
                        <div className="integration-icon allegro-logo">allegro<span>.</span></div>
                        <div>
                            <h2>Allegro</h2>
                            <p>Import photos from all your seller offers</p>
                        </div>
                        <span className={`status-chip ${connection.connected ? 'connected' : ''}`}>
                            {connection.connected ? 'Connected' : 'Not connected'}
                        </span>
                    </div>

                    {connection.connected && (
                        <div className="connection-details">
                            <span>Seller: <strong>{connection.sellerName ?? 'Authorized account'}</strong></span>
                        </div>
                    )}

                    <div className="integration-actions">
                        {!connection.connected ? (
                            <button className="btn btn-primary" disabled={busy} onClick={connect}>
                                Connect Allegro →
                            </button>
                        ) : (
                            <>
                                <button
                                    className="btn btn-primary"
                                    disabled={busy}
                                    onClick={() => void runImport(false)}
                                >
                                    {busy ? 'Import in progress...' : 'Import all product images'}
                                </button>
                                <button
                                    className="btn btn-secondary"
                                    disabled={busy}
                                    onClick={() => void disconnect()}
                                >
                                    Disconnect Allegro
                                </button>
                            </>
                        )}
                        <button
                            className="btn btn-secondary"
                            onClick={openAllegroLibrary}
                        >
                            Open library (Allegro)
                        </button>
                    </div>

                    {notice && <p className="inline-message" role="status">{notice}</p>}
                </section>

                {showProgress && (
                    <section className="panel integration-progress" aria-live="polite">
                        <div className="panel-heading">
                            <h2>Catalog import progress</h2>
                            <span className="muted-label">
                                {percent === undefined ? 'SCANNING' : `${percent}%`}
                            </span>
                        </div>
                        <p className="integration-progress-label">
                            {getProgressLabel(importProgress)}
                        </p>
                        <progress
                            className="integration-progress-bar"
                            aria-label="Allegro catalog import progress"
                            max={100}
                            value={percent}
                        />
                        <div className="integration-progress-stats">
                            <div className="integration-progress-stat">
                                <span>Offers found</span>
                                <strong>{importProgress.totalOffers ?? '—'}</strong>
                            </div>
                            <div className="integration-progress-stat">
                                <span>Offers processed</span>
                                <strong>{importProgress.processedOffers}</strong>
                            </div>
                            <div className="integration-progress-stat">
                                <span>Photos imported</span>
                                <strong>{importProgress.importedImages}</strong>
                            </div>
                            <div className="integration-progress-stat">
                                <span>Failed offers</span>
                                <strong>{importProgress.failedOffers}</strong>
                            </div>
                        </div>
                        {importProgress.stage === 'failed' && (
                            <p className="inline-message" role="alert">
                                {importProgress.error ?? 'Could not complete import'}
                            </p>
                        )}
                    </section>
                )}

                <section className="panel integration-guide">
                    <h2>How it works</h2>
                    <div className="integration-steps">
                        <div>
                            <b>01</b><strong>Authorize</strong>
                            <p>Sign in on Allegro and approve access to your seller account.</p>
                        </div>
                        <div>
                            <b>02</b><strong>Import</strong>
                            <p>WaterM finds your offers and retrieves every gallery photo.</p>
                        </div>
                        <div>
                            <b>03</b><strong>Watermark</strong>
                            <p>Images appear in Library, ready to select and edit.</p>
                        </div>
                    </div>
                    <p className="integration-note">
                        Photos are shown using their Allegro image URLs. Disconnecting from WaterM
                        does not sign you out of the Allegro website or delete original photos.
                    </p>
                </section>
            </div>
        </div>
    );
}