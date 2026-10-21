
import { PageHeading } from '../components/PageHeading';
import { useApp } from '../context/AppContext';

export function DashboardPage() {
    const {
        images,
        selectedIds,
        settings,
        setPage,
    } = useApp();

    return (
        <div className="page-shell dashboard-page">

            <PageHeading title="Dashboard" />

            <div className="dashboard-content scrollable-content">

                {/* Welcome banner */}
                <div className="welcome-banner">
                    <div className="welcome-copy">
                        <span className="eyebrow">
                            WATERM / WORKSPACE
                        </span>

                        <h2>
                            One watermark.
                            <br />
                            <span>Your entire catalog.</span>
                        </h2>

                        <p>
                            Manage product images and preview
                            your watermark template.
                        </p>

                        <button
                            className="btn btn-light"
                            onClick={() => setPage('library')}
                        >
                            Open library <span>↗</span>
                        </button>
                    </div>

                    <div className="welcome-art" aria-hidden="true">
                        <div className="art-back" />
                        <div className="art-front">
                            <span>◈</span>
                            <small>WATERM</small>
                        </div>
                        <div className="art-float">
                            ✦ <span>Protected</span>
                        </div>
                    </div>
                </div>

                {/* Statistics */}
                <div className="stats-grid">
                    <div className="stat-card">
                        <div className="stat-heading">
                            <span>Images in library</span>
                            <span className="stat-icon">▦</span>
                        </div>
                        <strong>{images.length}</strong>
                        <small>Local + connected sources</small>
                    </div>

                    <div className="stat-card">
                        <div className="stat-heading">
                            <span>Selected images</span>
                            <span className="stat-icon">✓</span>
                        </div>
                        <strong>{selectedIds.length}</strong>
                        <small>Ready for batch preview</small>
                    </div>

                    <div className="stat-card">
                        <div className="stat-heading">
                            <span>Active jobs</span>
                            <span className="stat-icon">▤</span>
                        </div>
                        <strong>0</strong>
                        <small>Processing not connected</small>
                    </div>

                    <div className="stat-card">
                        <div className="stat-heading">
                            <span>Draft template</span>
                            <span className="stat-icon">✎</span>
                        </div>
                        <strong>01</strong>
                        <small>
                            {settings.layout === 'pattern'
                                ? 'Pattern'
                                : 'Single mark'}
                        </small>
                    </div>
                </div>

                {/* Lower dashboard panels */}
                <div className="dashboard-lower">

                    <section className="panel dashboard-panel">
                        <div className="panel-heading">
                            <h2>Quick actions</h2>
                        </div>

                        <div className="quick-actions">
                            <button
                                className="quick-action"
                                onClick={() => setPage('library')}
                            >
                                <span className="quick-icon">▦</span>
                                <span>
                                    <strong>Image library</strong>
                                    <small>
                                        Add and select product photos
                                    </small>
                                </span>
                                <b>→</b>
                            </button>

                            <button
                                className="quick-action"
                                onClick={() => setPage('editor')}
                            >
                                <span className="quick-icon">✎</span>
                                <span>
                                    <strong>Watermark editor</strong>
                                    <small>
                                        Adjust your watermark preview
                                    </small>
                                </span>
                                <b>→</b>
                            </button>

                            <button
                                className="quick-action"
                                onClick={() => setPage('batch')}
                            >
                                <span className="quick-icon">▤</span>
                                <span>
                                    <strong>Batch preview</strong>
                                    <small>
                                        One template for selected images
                                    </small>
                                </span>
                                <b>→</b>
                            </button>
                        </div>
                    </section>

                    <section className="panel dashboard-panel allegro-card">
                        <div className="panel-heading">
                            <h2>External libraries</h2>
                            <span className="muted-label">
                                INTEGRATIONS
                            </span>
                        </div>

                        <div className="allegro-header">
                            <div className="allegro-logo">
                                allegro<span>.</span>
                            </div>
                            <span className="status-chip">
                                Manage in Integrations
                            </span>
                        </div>

                        <p>
                            Import product photos from an
                            Allegro seller account.
                        </p>

                        <div className="allegro-foot">
                            <button
                                className="btn btn-primary"
                                onClick={() => setPage('integrations')}
                            >
                                Manage integrations →
                            </button>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}