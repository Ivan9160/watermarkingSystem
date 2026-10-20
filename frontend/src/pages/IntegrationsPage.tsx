import { useEffect, useState } from 'react';
import { PageHeading } from '../components/PageHeading';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import type { AllegroConnection } from '../types';

export function IntegrationsPage() {
    const { setPage, importAllegroImages, clearAllegroImages, setLibrarySourceFilter } = useApp();
    const [connection, setConnection] = useState<AllegroConnection>({ connected: false });
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState('');

    useEffect(() => {
        let active = true;
        const justConnected = new URLSearchParams(window.location.search)
            .get('allegro') === 'connected';

        async function initialize() {
            if (justConnected) setBusy(true);
            try {
                const status = await api.getAllegroStatus();
                if (!active) return;
                setConnection(status);
                if (!status.connected) clearAllegroImages();

                if (justConnected && status.connected) {
                    const { items, offerCount, failedOffers } = await api.getAllegroImages();
                    if (!active) return;
                    importAllegroImages(items);
                    setLibrarySourceFilter('allegro');
                    window.history.replaceState(null, '', window.location.pathname);
                    if (failedOffers > 0) {
                        setNotice(`Loaded ${items.length} images from ${offerCount} offers; ${failedOffers} offers failed to load.`);
                    }
                    setPage('library');
                } else if (justConnected) {
                    window.history.replaceState(null, '', window.location.pathname);
                    setNotice('Allegro session could not be found. Please reconnect.');
                }
            } catch (error) {
                if (!active) return;
                window.history.replaceState(null, '', window.location.pathname);
                setNotice(error instanceof Error ? error.message : 'Could not load Allegro data');
            } finally {
                if (active) setBusy(false);
            }
        }
        void initialize();
        return () => { active = false; };
    }, [clearAllegroImages, importAllegroImages, setLibrarySourceFilter, setPage]);

    function connect() {
        window.location.assign(api.getAllegroLoginUrl());
    }

    async function sync() {
        setBusy(true);
        setNotice('');
        try {
            const { items, offerCount, failedOffers } = await api.getAllegroImages();
            importAllegroImages(items);
            setLibrarySourceFilter('allegro');
            setNotice(`Loaded ${items.length} images from ${offerCount} offers.${failedOffers ? ` ${failedOffers} offers could not be loaded.` : ''}`);
            setPage('library');
        } catch (error) {
            setNotice(error instanceof Error ? error.message : 'Could not load product images');
        } finally {
            setBusy(false);
        }
    }

    async function disconnect() {
        setBusy(true);
        setNotice('');
        try {
            await api.disconnectAllegro();
            clearAllegroImages();
            setConnection({ connected: false });
            setLibrarySourceFilter('all');
            setNotice('Allegro disconnected from WaterM. Local photos are preserved.');
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

    return <div className="page-shell">
        <PageHeading title="Integrations" subtitle="Connect your e-commerce image sources" actions={<span className="page-pill">Allegro Sandbox</span>} />
        <div className="integration-content scrollable-content">
            <section className="panel integration-card">
                <div className="integration-title"><div className="integration-icon allegro-logo">allegro<span>.</span></div>
                    <div><h2>Allegro</h2><p>Import images from your seller offers</p></div>
                    <span className={`status-chip ${connection.connected ? 'connected' : ''}`}>{connection.connected ? 'Connected' : 'Not connected'}</span>
                </div>
                {connection.connected && <div className="connection-details"><span>Seller: <strong>{connection.sellerName ?? 'Authorized account'}</strong></span></div>}
                <div className="integration-actions">
                    {!connection.connected
                        ? <button className="btn btn-primary" disabled={busy} onClick={connect}>Connect Allegro →</button>
                        : <><button className="btn btn-primary" disabled={busy} onClick={() => void sync()}>{busy ? 'Loading all photos...' : 'Import all product images'}</button>
                            <button className="btn btn-secondary" disabled={busy} onClick={() => void disconnect()}>Disconnect Allegro</button></>}
                    <button className="btn btn-secondary" disabled={busy && !connection.connected} onClick={openAllegroLibrary}>Open library (Allegro)</button>
                </div>
                {notice && <p className="inline-message" role="status">{notice}</p>}
            </section>
            <section className="panel integration-guide">
                <h2>How it works</h2>
                <div className="integration-steps">
                    <div><b>01</b><strong>Authorize</strong><p>Sign in on Allegro and confirm which seller account to connect.</p></div>
                    <div><b>02</b><strong>Import</strong><p>WaterM fetches all offer pages and every photo in each offer gallery.</p></div>
                    <div><b>03</b><strong>Watermark</strong><p>Photos appear in the Library under the Allegro source filter.</p></div>
                </div>
                <p className="integration-note">Disconnect removes the local WaterM session, not the sign-in session at allegro.pl. Reconnecting will show Allegro account confirmation; entering a password again depends on Allegro's own session.</p>
            </section>
        </div>
    </div>;
}
