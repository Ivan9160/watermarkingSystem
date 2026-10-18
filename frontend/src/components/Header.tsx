import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';

export function Header() {
    const { session } = useApp();
    const [isOpen, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const name = session.user.displayName;

    useEffect(() => {
        function outside(event: MouseEvent) {
            if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
        }
        function onEscape(event: KeyboardEvent) {
            if (event.key === 'Escape') setOpen(false);
        }
        document.addEventListener('mousedown', outside);
        document.addEventListener('keydown', onEscape);
        return () => {
            document.removeEventListener('mousedown', outside);
            document.removeEventListener('keydown', onEscape);
        };
    }, []);

    return <header className="topbar">
        <div className="topbar-store"><span className="store-pulse" />
            <span>{session.workspace.name}</span> <span className="topbar-slash">/</span> Workspace
        </div>
        <div className="topbar-actions">
            <span className="demo-badge"><span className="demo-dot" /> DEMO</span>
            <div className="account-wrapper" ref={root}>
                <button type="button" className="account-trigger" aria-expanded={isOpen} aria-haspopup="true" onClick={() => setOpen(v => !v)}>
                    <span className="avatar">{name.charAt(0).toUpperCase()}</span>
                    <span className="account-label">{name}</span><span className="account-caret"></span>
                </button>
                {isOpen && <div className="account-menu">
                    <div className="account-summary"><span className="avatar avatar-large">{name.charAt(0).toUpperCase()}</span>
                        <div><strong>{name}</strong><small>{session.user.email ?? 'Demo profile'}</small></div></div>
                    <div className="account-divider" />
                    <div className="account-row">Workspace <strong>{session.workspace.name}</strong></div>
                    <div className="account-row">Access <strong>Frontend prototype</strong></div>
                </div>}
            </div>
        </div>
    </header>;
}
