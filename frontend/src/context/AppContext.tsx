import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../services/api';
import type { Page, ProductImage, WatermarkSettings, WatermarkType, WorkspaceSession } from '../types';

const IS_BACKEND = import.meta.env.VITE_DATA_SOURCE === 'backend';
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const VALID_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
type Scope = 'all' | 'selected';

interface ImportResult { imported: number; skipped: number; }

interface AppContextValue {
    page: Page;
    setPage: (page: Page) => void;
    session: WorkspaceSession;
    images: ProductImage[];
    catalogLoading: boolean;
    catalogError: string | null;
    refreshCatalog: () => Promise<void>;
    addLocalImages: (files: File[]) => ImportResult;
    removeLocalImage: (imageId: string) => void;
    activeImage: ProductImage | undefined;
    openEditor: (imageId: string) => void;
    selectedIds: string[];
    toggleImage: (imageId: string) => void;
    selectAll: () => void;
    clearSelection: () => void;
    settings: WatermarkSettings;
    updateSettings: (update: Partial<WatermarkSettings>) => void;
    watermarkType: WatermarkType;
    setWatermarkType: (type: WatermarkType) => void;
    batchScope: Scope;
    setBatchScope: (scope: Scope) => void;
    batchImages: ProductImage[];
}

const DEMO_SESSION: WorkspaceSession = {
    workspace: { id: 'demo', name: 'Demo Workspace' },
    user: { displayName: 'Demo Admin' },
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
    const [page, setPage] = useState<Page>('dashboard');
    const [session, setSession] = useState<WorkspaceSession>(DEMO_SESSION);
    const [images, setImages] = useState<ProductImage[]>([]);
    const [catalogLoading, setCatalogLoading] = useState(IS_BACKEND);
    const [catalogError, setCatalogError] = useState<string | null>(null);
    const [activeImageId, setActiveImageId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [batchScope, setBatchScope] = useState<Scope>('selected');
    const [watermarkType, setWatermarkType] = useState<WatermarkType>('visible');
    const [settings, setSettings] = useState<WatermarkSettings>({
        text: '© WATERMARK', color: '#7465f8', opacity: 55,
        size: 5, layout: 'single', position: 'bottom-right',
    });
    // Browser object URLs belong only to this component. Revoke them on deletion/unmount.
    const localUrls = useRef(new Map<string, string>());

    async function refreshCatalog() {
        if (!IS_BACKEND) return;
        setCatalogLoading(true);
        try {
            const { items } = await api.getImages();
            // Never remove user-selected local files when refreshing the remote catalog.
            setImages(current => [...current.filter(image => image.source === 'local'),
                ...items.map(image => ({ ...image, source: image.source ?? 'server' as const }))]);
            setCatalogError(null);
        } catch (error) {
            setCatalogError(error instanceof Error ? error.message : 'Could not load catalog');
        } finally {
            setCatalogLoading(false);
        }
    }

    useEffect(() => {
        if (IS_BACKEND) {
            void refreshCatalog();
            api.getSession().then(setSession).catch(() => {
                // The demo identity remains visible until authentication is implemented.
            });
        }
        const urls = localUrls.current;
        return () => { urls.forEach(url => URL.revokeObjectURL(url)); urls.clear(); };
        // Initial loading is performed once when the provider mounts.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function addLocalImages(files: File[]): ImportResult {
        const accepted: ProductImage[] = [];
        let skipped = 0;
        for (const file of files) {
            if (!VALID_TYPES.has(file.type) || file.size > MAX_FILE_BYTES || file.size === 0) {
                skipped++;
                continue;
            }
            const id = `local-${crypto.randomUUID()}`;
            const src = URL.createObjectURL(file);
            localUrls.current.set(id, src);
            accepted.push({ id, filename: file.name, src, source: 'local' });
        }
        if (accepted.length) {
            setImages(current => [...current, ...accepted]);
            setActiveImageId(current => current ?? accepted[0].id);
        }
        return { imported: accepted.length, skipped };
    }

    function removeLocalImage(id: string) {
        const url = localUrls.current.get(id);
        if (!url) return; // Remote images cannot be deleted from this prototype.
        localUrls.current.delete(id);
        URL.revokeObjectURL(url);
        setImages(current => current.filter(image => image.id !== id));
        setSelectedIds(current => current.filter(value => value !== id));
        setActiveImageId(current => current === id ? null : current);
    }

    function toggleImage(id: string) {
        setSelectedIds(current => current.includes(id)
            ? current.filter(value => value !== id)
            : [...current, id]);
    }

    function openEditor(id: string) {
        setActiveImageId(id);
        setPage('editor');
    }

    const activeImage = images.find(image => image.id === activeImageId) ?? images[0];
    const batchImages = batchScope === 'all'
        ? images
        : images.filter(image => selectedIds.includes(image.id));

    return <AppContext.Provider value={{
        page, setPage, session, images, catalogLoading, catalogError, refreshCatalog,
        addLocalImages, removeLocalImage, activeImage, openEditor,
        selectedIds, toggleImage, selectAll: () => setSelectedIds(images.map(i => i.id)),
        clearSelection: () => setSelectedIds([]), settings,
        updateSettings: update => setSettings(current => ({ ...current, ...update })),
        watermarkType, setWatermarkType, batchScope, setBatchScope, batchImages,
    }}>{children}</AppContext.Provider>;
}

export function useApp() {
    const context = useContext(AppContext);
    if (!context) throw new Error('useApp must be used within AppProvider');
    return context;
}
