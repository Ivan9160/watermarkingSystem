import { useApp } from '../context/AppContext';
import type { Page } from '../types';

const navigation: { id: Page; label: string; icon: string; group: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: '◫', group: 'WORKSPACE' },
    { id: 'library', label: 'Image Library', icon: '▦', group: 'WORKSPACE' },
    { id: 'editor', label: 'Watermark Editor', icon: '✎', group: 'WORKSPACE' },
    { id: 'batch', label: 'Batch Processing', icon: '▤', group: 'WORKSPACE' },
    { id: 'integrations', label: 'Integrations', icon: '↗', group: 'WORKSPACE' },
    { id: 'removal', label: 'Watermark Removal', icon: '◈', group: 'TOOLS' },
    { id: 'verification', label: 'Verification', icon: '◎', group: 'TOOLS' },
];

export function Sidebar() {
    const { page, setPage } = useApp();
    let lastGroup = '';

    return (
        <aside className="sidebar">
            <div className="brand">
                <span className="brand-mark">◈</span>
                <span>WaterM<span className="brand-period">.</span></span>
            </div>
            <nav className="sidebar-navigation" aria-label="Main navigation">
                {navigation.map(item => {
                    const showGroup = item.group !== lastGroup;
                    lastGroup = item.group;
                    return (
                        <div key={item.id}>
                            {showGroup && <p className="nav-group">{item.group}</p>}
                            <button
                                className={`nav-link${page === item.id ? ' active' : ''}`}
                                type="button"
                                aria-current={page === item.id ? 'page' : undefined}
                                onClick={() => setPage(item.id)}
                            >
                                <span className="nav-symbol" aria-hidden="true">{item.icon}</span>
                                {item.label}
                            </button>
                        </div>
                    );
                })}
            </nav>
            <div className="sidebar-bottom">
                <div className="sidebar-divider" />
                <strong>Capstone project prototype</strong>
                <span>Tsimafei Kazlou · Ivan Bolbas</span>
                <span>Oleh Chaikovskyi · Igor Paderewski</span>
                <small>version v0.2</small>
            </div>
        </aside>
    );
}
