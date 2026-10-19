import { useEffect, useState } from 'react';
import { PageHeading } from '../components/PageHeading';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import type { AllegroConnection } from '../types';

const IS_BACKEND = import.meta.env.VITE_DATA_SOURCE === 'backend';
const ALLOWED_OAUTH_HOSTS = new Set(['allegro.pl', 'allegro.pl.allegrosandbox.pl']);

export function IntegrationsPage() {
    const { setPage, refreshCatalog } = useApp();
    const [connection, setConnection] = useState<AllegroConnection>({ connected: false });
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState('');

    useEffect(() => {
        if (!IS_BACKEND) return;
        let active = true;
        api.getAllegroStatus()
            .then(value => { if (active) setConnection(value); })
            .catch(error => { if (active) setNotice(error instanceof Error ? error.message : 'Could not load Allegro connection'); });
        return () => { active = false; };
    }, []);

    async function connect() {
        if (!IS_BACKEND) {
            setNotice('Connect a NestJS backend and register an Allegro Sandbox app to enable OAuth. This demo does not sign you in.');
            return;
        }
        setBusy(true);
        setNotice('');
        try {
            const { url } = await api.getAllegroAuthorizationUrl();
            const target = new URL(url);
            if (target.protocol !== 'https:' || !ALLOWED_OAUTH_HOSTS.has(target.hostname) || !target.pathname.startsWith('/auth/oauth/')) {
                throw new Error('Backend returned an unexpected OAuth destination.');
            }
            window.location.assign(url);
        } catch (error) {
            setNotice(error instanceof Error ? error.message : 'Could not start OAuth');
            setBusy(false);
        }
    }

    async function sync() {
        setBusy(true);
        setNotice('');
        try {
            const { jobId } = await api.syncAllegroCatalog();
            setNotice(`Import job ${jobId} submitted. Refresh the library when ingestion has finished.`);
        } catch (error) {
            setNotice(error instanceof Error ? error.message : 'Could not sync catalog');
        } finally { setBusy(false); }
    }

    async function refresh() {
        setBusy(true);
        try {
            await refreshCatalog();
            setNotice('Requested latest catalog data from backend.');
        } finally { setBusy(false); }
    }

    return <div className="page-shell">
        <PageHeading title="Integrations" subtitle="Connect your e-commerce image sources" actions={<span className="page-pill page-pill-muted">{IS_BACKEND ? 'Backend mode' : 'Demo mode'}</span>} />
        <div className="integration-content scrollable-content">
            <section className="panel integration-card">
                <div className="integration-title"><div className="integration-icon allegro-logo">allegro<span>.</span></div>
                    <div><h2>Allegro</h2><p>Import images from your seller offers</p></div>
                    <span className={`status-chip ${connection.connected ? 'connected' : ''}`}>{connection.connected ? 'Connected' : 'Not connected'}</span>
                </div>
                {connection.connected && <div className="connection-details"><span>Seller: <strong>{connection.sellerName ?? 'Authorized account'}</strong></span><span>Last sync: <strong>{connection.lastSyncedAt ?? 'Never'}</strong></span></div>}
                <div className="integration-actions">
                    {!connection.connected ? <button className="btn btn-primary" disabled={busy} onClick={connect}>Connect Allegro →</button>
                        : <><button className="btn btn-primary" disabled={busy} onClick={sync}>Sync catalog</button><button className="btn btn-secondary" disabled={busy} onClick={refresh}>Refresh library</button></>}
                    <button className="btn btn-secondary" onClick={() => setPage('library')}>Open library</button>
                </div>
                {notice && <p className="inline-message" role="status">{notice}</p>}
            </section>
            <section className="panel integration-guide">
                <h2>How it works</h2>
                <div className="integration-steps">
                    <div><b>01</b><strong>Authorize</strong><p>Sign in on Allegro and grant access to your seller offers.</p></div>
                    <div><b>02</b><strong>Import</strong><p>We collect offer image URLs and save image copies.</p></div>
                    <div><b>03</b><strong>Watermark</strong><p>Images appear in Library, ready for processing.</p></div>
                </div>
                <p className="integration-note">OAuth, tokens and image ingestion will run in NestJS, not in your browser. Local images can already be added from the Library page.</p>
            </section>
        </div>
    </div>;
}
