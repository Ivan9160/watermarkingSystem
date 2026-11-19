import { useApp } from '../context/AppContext';
import { useLayoutEffect, useRef, useState } from 'react';
import type { Page } from '../types';

const navigation: { id: Page; label: string; icon: string; group: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: '◫', group: 'WORKSPACE' },
    { id: 'library', label: 'Image Library', icon: '▦', group: 'WORKSPACE' },
    { id: 'editor', label: 'Watermark Editor', icon: '✎', group: 'WORKSPACE' },
    { id: 'templates', label: 'Templates', icon: '▧', group: 'WORKSPACE' },
    { id: 'batch', label: 'Batch Processing', icon: '▤', group: 'WORKSPACE' },
    { id: 'integrations', label: 'Integrations', icon: '↗', group: 'WORKSPACE' },
    { id: 'removal', label: 'Watermark Removal', icon: '◈', group: 'TOOLS' },
    { id: 'verification', label: 'Verification', icon: '◎', group: 'TOOLS' },
];


export function Sidebar() {
    const { page, setPage } = useApp();
    const navRef = useRef<HTMLElement>(null);
    const [indicator, setIndicator] = useState<{
        top: number;
        height: number;
    } | null>(null);

    useLayoutEffect(() => {
        const nav = navRef.current;
        if (!nav) return;

        const updateIndicator = () => {
            const active = nav.querySelector<HTMLElement>(
                '.nav-link.active'
            );

            if (!active) return;

            const navRect = nav.getBoundingClientRect();
            const activeRect = active.getBoundingClientRect();

            setIndicator(previous => {
                const next = {
                    top: activeRect.top - navRect.top,
                    height: activeRect.height,
                };

                if (
                    previous?.top === next.top &&
                    previous.height === next.height
                ) {
                    return previous;
                }

                return next;
            });
        };

        updateIndicator();

        const observer = new ResizeObserver(updateIndicator);
        observer.observe(nav);

        window.addEventListener('resize', updateIndicator);

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updateIndicator);
        };
    }, [page]);

    let lastGroup = '';

    return (
        <aside className="sidebar">
            <div className="brand">
                <span className="brand-mark">◈</span>
                <span>
                    WatermarkOS
                    <span className="brand-period">.</span>
                </span>
            </div>

            <nav
                ref={navRef}
                className="sidebar-navigation"
                aria-label="Main navigation"
            >
                {indicator && (
                    <div
                        className="nav-active-indicator"
                        aria-hidden="true"
                        style={{
                            height: indicator.height,
                            transform: `translateY(${indicator.top}px)`,
                        }}
                    />
                )}

                {navigation.map(item => {
                    const showGroup = item.group !== lastGroup;
                    lastGroup = item.group;

                    return (
                        <div key={item.id}>
                            {showGroup && (
                                <p className="nav-group">
                                    {item.group}
                                </p>
                            )}

                            <button
                                type="button"
                                className={`nav-link${
                                    page === item.id ? ' active' : ''
                                }`}
                                aria-current={
                                    page === item.id ? 'page' : undefined
                                }
                                onClick={() => setPage(item.id)}
                            >
                                <span
                                    className="nav-symbol"
                                    aria-hidden="true"
                                >
                                    {item.icon}
                                </span>
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
                <small>version v0.5</small>
            </div>
        </aside>
    );
}