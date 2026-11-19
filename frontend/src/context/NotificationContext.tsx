import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../services/api';
import { getRecentBatchIds } from '../utils/batchHistory';
import type { Page } from '../types';

const STORAGE_KEY = 'waterm.notifications.v1';
const SEEN_KEY = 'waterm.notifications.seenBatches.v1';
const POLL_MS = 5000;

export type NotificationKind = 'success' | 'error' | 'info';
export interface WaterMNotification {
    id: string;
    kind: NotificationKind;
    title: string;
    message: string;
    createdAt: string;
    read: boolean;
    page?: Page;
}
export type NotificationInput = Pick<WaterMNotification, 'id' | 'kind' | 'title' | 'message' | 'page'>;

interface NotificationContextValue {
    notifications: WaterMNotification[];
    unreadCount: number;
    notify: (input: NotificationInput) => void;
    markRead: (id: string) => void;
    markAllRead: () => void;
    clearAll: () => void;
}
const NotificationContext = createContext<NotificationContextValue | null>(null);

function readStored<T>(key: string, fallback: T): T {
    try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) as T : fallback;
    } catch { return fallback; }
}

export function NotificationProvider({ children }: { children: ReactNode }) {
    const [notifications, setNotifications] = useState<WaterMNotification[]>(() => {
        const value = readStored<unknown>(STORAGE_KEY, []);
        return Array.isArray(value) ? value.filter((item): item is WaterMNotification =>
            typeof item === 'object' && item !== null && typeof item.id === 'string' &&
            typeof item.title === 'string' && typeof item.message === 'string' &&
            typeof item.createdAt === 'string' && typeof item.read === 'boolean'
        ).slice(0, 50) : [];
    });
    const seen = useRef<Set<string>>(new Set(readStored<string[]>(SEEN_KEY, [])));
    const polling = useRef(false);

    useEffect(() => {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications)); }
        catch { /* Private mode or blocked storage. */ }
    }, [notifications]);

    const notify = useCallback((input: NotificationInput) => {
        setNotifications(current => {
            if (current.some(item => item.id === input.id)) return current;
            return [{ ...input, read: false, createdAt: new Date().toISOString() }, ...current].slice(0, 50);
        });
    }, []);
    const markRead = useCallback((id: string) => {
        setNotifications(current => current.map(item => item.id === id ? { ...item, read: true } : item));
    }, []);
    const markAllRead = useCallback(() => {
        setNotifications(current => current.map(item => item.read ? item : { ...item, read: true }));
    }, []);
    const clearAll = useCallback(() => setNotifications([]), []);

    useEffect(() => {
        function onNotification(event: Event) {
            const detail = (event as CustomEvent<NotificationInput>).detail;
            if (detail && typeof detail.id === 'string') notify(detail);
        }
        window.addEventListener('waterm:notify', onNotification);
        return () => window.removeEventListener('waterm:notify', onNotification);
    }, [notify]);

    useEffect(() => {
        let active = true;
        async function checkBatches() {
            if (polling.current) return;
            const ids = getRecentBatchIds();
            if (!ids.length) return;
            polling.current = true;
            try {
                await Promise.all(ids.map(async id => {
                    if (seen.current.has(id)) return;
                    try {
                        const batch = await api.getBatchStatus(id);
                        if (!active || (batch.status !== 'COMPLETED' && batch.status !== 'FAILED')) return;
                        seen.current.add(id);
                        try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen.current].slice(-200))); }
                        catch { /* Storage unavailable. */ }
                        const succeeded = batch.counts.succeeded;
                        const failed = batch.counts.failed;
                        const isSuccess = batch.status === 'COMPLETED' && failed === 0;
                        notify({
                            id: `batch-terminal:${id}`,
                            kind: isSuccess ? 'success' : 'error',
                            title: isSuccess ? 'Batch completed' : batch.status === 'FAILED' ? 'Batch failed' : 'Batch completed with errors',
                            message: `Batch ${id.slice(0, 8)} · ${succeeded} successful, ${failed} failed`,
                            page: 'batch',
                        });
                    } catch { /* Retry next interval while API is temporarily unavailable. */ }
                }));
            } finally { polling.current = false; }
        }
        void checkBatches();
        const timer = window.setInterval(() => { void checkBatches(); }, POLL_MS);
        function onChange() { void checkBatches(); }
        window.addEventListener('waterm:batch-history-updated', onChange);
        window.addEventListener('storage', onChange);
        return () => {
            active = false;
            window.clearInterval(timer);
            window.removeEventListener('waterm:batch-history-updated', onChange);
            window.removeEventListener('storage', onChange);
        };
    }, [notify]);

    return <NotificationContext.Provider value={{
        notifications, unreadCount: notifications.filter(item => !item.read).length,
        notify, markRead, markAllRead, clearAll,
    }}>{children}</NotificationContext.Provider>;
}

export function useNotifications(): NotificationContextValue {
    const context = useContext(NotificationContext);
    if (!context) throw new Error('useNotifications must be used within NotificationProvider');
    return context;
}
