const RECENT_KEY = 'waterm.recentBatchIds.v1';
const PUBLICATION_PREFIX = 'waterm.allegroPublication.v1.';
// const TEMPLATES_KEY = 'waterm.watermarkTemplates.v1';
const ACTIVE_KEY = 'waterm.activeBatchId.v1';
const ORG_KEY = 'waterm.organizationId.v1';

function readIds(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function forgetBatch(batchId: string): void {
  try {
    const next = readIds().filter((id) => id !== batchId);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    localStorage.removeItem(PUBLICATION_PREFIX + batchId);
  } catch {
  }
}

export function purgeBatchState(): void {
  try {
    localStorage.removeItem(ACTIVE_KEY);
    for (const key of Object.keys(localStorage)) {
      if (key === RECENT_KEY || key.startsWith(PUBLICATION_PREFIX)) {
        localStorage.removeItem(key);
      }
    }
    // localStorage.removeItem(TEMPLATES_KEY);
  } catch {
  }
}

export function syncOrganization(organizationId: string | null): void {
  try {
    const saved = localStorage.getItem(ORG_KEY);
    if (saved && saved !== organizationId) {
      purgeBatchState();
    }
    if (organizationId) {
      localStorage.setItem(ORG_KEY, organizationId);
    } else {
      localStorage.removeItem(ORG_KEY);
    }
  } catch {
  }
}