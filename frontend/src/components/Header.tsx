import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useNotifications } from '../context/NotificationContext';

export function Header() {
    const { session, setPage } = useApp();
    const { notifications, unreadCount, markRead, markAllRead, clearAll } = useNotifications();
    const [accountOpen, setAccountOpen] = useState(false);
    const [notificationsOpen, setNotificationsOpen] = useState(false);
    const accountRoot = useRef<HTMLDivElement>(null);
    const notificationRoot = useRef<HTMLDivElement>(null);
    const name = session.user.displayName;

    useEffect(() => {
        function outside(event: MouseEvent) {
            if (accountRoot.current && !accountRoot.current.contains(event.target as Node)) setAccountOpen(false);
            if (notificationRoot.current && !notificationRoot.current.contains(event.target as Node)) setNotificationsOpen(false);
        }
        function escape(event: KeyboardEvent) {
            if (event.key === 'Escape') { setAccountOpen(false); setNotificationsOpen(false); }
        }
        document.addEventListener('mousedown', outside);
        document.addEventListener('keydown', escape);
        return () => {
            document.removeEventListener('mousedown', outside);
            document.removeEventListener('keydown', escape);
        };
    }, []);

    return <header className="topbar">
        <div className="topbar-store"><span className="store-pulse" />
            <span>{session.workspace.name}</span><span className="topbar-slash">/</span> Workspace
        </div>
        <div className="topbar-actions">
            <span className="demo-badge"><span className="demo-dot" /> DEMO</span>
            <div className="wm-notification-root" ref={notificationRoot}>
                <button type="button" className="wm-notification-trigger" aria-label={`Notifications, ${unreadCount} unread`}
                    aria-haspopup="true" aria-expanded={notificationsOpen}
                    onClick={() => { setNotificationsOpen(open => !open); setAccountOpen(false); }}>
                    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8"
                        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                        <path d="M10 21h4" />
                    </svg>
                    {unreadCount > 0 && <span className="wm-notification-count">{unreadCount > 9 ? '9+' : unreadCount}</span>}
                </button>
                {notificationsOpen && <div className="wm-notification-menu" role="region" aria-label="Notifications">
                    <div className="wm-notification-heading">
                        <strong>Notifications</strong>
                        {unreadCount > 0 && <button type="button" onClick={markAllRead}>Mark all read</button>}
                    </div>
                    <div className="wm-notification-list">
                        {notifications.length === 0 ? <p className="wm-notification-empty">No notifications yet</p> :
                            notifications.map(item => <button type="button" key={item.id}
                                className={`wm-notification-item ${item.read ? '' : 'wm-notification-item--unread'}`}
                                onClick={() => {
                                    markRead(item.id);
                                    setNotificationsOpen(false);
                                    if (item.page) setPage(item.page);
                                }}>
                                <span className={`wm-notification-kind wm-notification-kind--${item.kind}`} aria-hidden="true">
                                    {item.kind === 'success' ? '✓' : item.kind === 'error' ? '!' : 'i'}
                                </span>
                                <span className="wm-notification-copy">
                                    <strong>{item.title}</strong><small>{item.message}</small>
                                    <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
                                </span>
                            </button>)}
                    </div>
                    {notifications.length > 0 && <div className="wm-notification-footer">
                        <button type="button" onClick={clearAll}>Clear notifications</button>
                    </div>}
                </div>}
            </div>
            <div className="account-wrapper" ref={accountRoot}>
                <button type="button" className="account-trigger" aria-expanded={accountOpen} aria-haspopup="true"
                    onClick={() => { setAccountOpen(open => !open); setNotificationsOpen(false); }}>
                    <span className="avatar">{name.charAt(0).toUpperCase()}</span>
                    <span className="account-label">{name}</span><span className="account-caret" />
                </button>
                {accountOpen && <div className="account-menu">
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
