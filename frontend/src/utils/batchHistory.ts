const HISTORY_KEY = 'waterm.recentBatchIds.v1';
const ACTIVE_KEY = 'waterm.activeBatchId.v1';
const MAX_SAVED = 8;

function safeRead(key: string): string | null {
    try { return window.localStorage.getItem(key); }
    catch { return null; }
}

function validId(value: unknown): value is string {
    return typeof value === 'string' && value.length >= 6 && value.length <= 128
        && /^[\w-]+$/.test(value);
}

export function getRecentBatchIds(): string[] {
    let saved: string[] = [];
    try {
        const parsed: unknown = JSON.parse(safeRead(HISTORY_KEY) || '[]');
        if (Array.isArray(parsed)) saved = parsed.filter(validId);
    } catch { /* Ignore damaged storage. */ }
    // Supports an in-progress job created before this feature was installed.
    const active = safeRead(ACTIVE_KEY);
    return [...new Set([...(active && validId(active) ? [active] : []), ...saved])].slice(0, MAX_SAVED);
}

export function rememberBatch(batchId: string): void {
    if (!validId(batchId)) return;
    const ids = [batchId, ...getRecentBatchIds().filter(id => id !== batchId)].slice(0, MAX_SAVED);
    try {
        window.localStorage.setItem(HISTORY_KEY, JSON.stringify(ids));
        window.dispatchEvent(new Event('waterm:batch-history-updated'));
    } catch { /* Storage unavailable; live Batch UI still works. */ }
}
