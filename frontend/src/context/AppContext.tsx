import {createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode,
} from 'react';

import { api } from '../services/api';

import type {Page, ProductImage, WatermarkSettings, WatermarkType, WorkspaceSession, ImportProgress,
} from '../types';

const IS_BACKEND = import.meta.env.VITE_DATA_SOURCE === 'backend';

const MAX_FILE_BYTES = 25 * 1024 * 1024;

const VALID_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
]);

type Scope = 'all' | 'selected';

export type LibrarySourceFilter = 'all' | 'local' | 'allegro';

interface ImportResult {
    imported: number;
    skipped: number;
}

interface AppContextValue {
    page: Page;
    setPage: (page: Page) => void;

    session: WorkspaceSession;

    images: ProductImage[];
    catalogLoading: boolean;
    catalogError: string | null;
    refreshCatalog: () => Promise<void>;

    importAllegroImages: (items: ProductImage[]) => void;
    clearAllegroImages: () => void;

    librarySourceFilter: LibrarySourceFilter;
    setLibrarySourceFilter: (filter: LibrarySourceFilter) => void;

    addLocalImages: (files: File[]) => ImportResult;
    removeLocalImage: (imageId: string) => void;
    removeImages: (imageIds: string[]) => void;

    activeImage: ProductImage | undefined;
    openEditor: (imageId: string) => void;

    selectedIds: string[];
    toggleImage: (imageId: string) => void;
    selectAll: () => void;
    clearSelection: () => void;

    selectImages: (imageIds: string[]) => void;
    deselectImages: (imageIds: string[]) => void;
    selectProductImages: (offerId: string) => void;

    importProgress: ImportProgress;
    setImportProgress: (progress: ImportProgress) => void;

    settings: WatermarkSettings;
    updateSettings: (update: Partial<WatermarkSettings>) => void;
    watermarkType: WatermarkType;
    setWatermarkType: (type: WatermarkType) => void;

    batchScope: Scope;
    setBatchScope: (scope: Scope) => void;
    batchImages: ProductImage[];
}

const DEMO_SESSION: WorkspaceSession = {
    workspace: {
        id: 'demo',
        name: 'Demo Workspace',
    },
    user: {
        displayName: 'Demo Admin',
    },
};

const INITIAL_IMPORT_PROGRESS: ImportProgress = {
    stage: 'idle',
    totalOffers: null,
    processedOffers: 0,
    importedImages: 0,
    failedOffers: 0,
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {

    const [page, setPage] = useState<Page>(() => {
        const params = new URLSearchParams(window.location.search);

        return params.get('allegro') === 'connected'
            ? 'integrations'
            : 'dashboard';
    });

    const [session, setSession] = useState<WorkspaceSession>(DEMO_SESSION);
    const [images, setImages] = useState<ProductImage[]>([]);
    const [catalogLoading, setCatalogLoading] = useState(IS_BACKEND);
    const [catalogError, setCatalogError] = useState<string | null>(null);
    const [librarySourceFilter, setLibrarySourceFilter] = useState<LibrarySourceFilter>('all');
    const [activeImageId, setActiveImageId] = useState<string | null>(null);
    const localUrls = useRef(new Map<string, string>());
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [batchScope, setBatchScope] = useState<Scope>('selected');

    const [importProgress, setImportProgress] =
        useState<ImportProgress>(INITIAL_IMPORT_PROGRESS);


    const [watermarkType, setWatermarkType] =
        useState<WatermarkType>('visible');

    const [settings, setSettings] = useState<WatermarkSettings>({
        text: '© WATERMARK',
        color: '#7465f8',
        opacity: 55,
        size: 5,
        layout: 'single',
        position: 'bottom-right',
    });

    const importAllegroImages = useCallback(
        (items: ProductImage[]) => {

            setImages(current => [
                ...current.filter(
                    image => image.source !== 'allegro'
                ),
                ...items.map(image => ({
                    ...image,
                    source: 'allegro' as const,
                })),
            ]);

            const validIds = new Set(items.map(image => image.id));

            setSelectedIds(current =>
                current.filter(id =>
                    !id.startsWith('allegro-') || validIds.has(id)
                )
            );
        },
        []
    );

    const clearAllegroImages = useCallback(() => {

        setImages(current =>
            current.filter(image => image.source !== 'allegro')
        );

        setSelectedIds(current =>
            current.filter(id => !id.startsWith('allegro-'))
        );

        setActiveImageId(current =>
            current?.startsWith('allegro-') ? null : current
        );

        setImportProgress(INITIAL_IMPORT_PROGRESS);

    }, []);

    async function refreshCatalog() {
        if (!IS_BACKEND) return;

        setCatalogLoading(true);

        try {
            const { items } = await api.getImages();

            setImages(current => [
                ...current.filter(image =>
                    image.source === 'local' ||
                    image.source === 'allegro'
                ),
                ...items.map(image => ({
                    ...image,
                    source: image.source ?? ('server' as const),
                })),
            ]);

            setCatalogError(null);
        } catch (error) {
            setCatalogError(
                error instanceof Error
                    ? error.message
                    : 'Could not load catalog'
            );
        } finally {
            setCatalogLoading(false);
        }
    }

    useEffect(() => {
        if (IS_BACKEND) {
            void refreshCatalog();

            api.getSession()
                .then(setSession)
                .catch(() => {
                });
        }

        const urls = localUrls.current;

        return () => {
            urls.forEach(url => URL.revokeObjectURL(url));
            urls.clear();
        };
    }, []);

    function loadImageDimensions(id: string, url: string) {
        const image = new Image();

        image.onload = () => {
            if (!localUrls.current.has(id)) return;

            setImages(current =>
                current.map(item =>
                    item.id === id
                        ? {
                            ...item,
                            width: image.naturalWidth,
                            height: image.naturalHeight,
                        }
                        : item
                )
            );
        };
        image.onerror = () => {
        };

        image.src = url;
    }

    function addLocalImages(files: File[]): ImportResult {
        const accepted: ProductImage[] = [];
        const pendingDimensions: Array<{
            id: string;
            url: string;
        }> = [];

        let skipped = 0;

        for (const file of files) {
            if (
                !VALID_TYPES.has(file.type) ||
                file.size > MAX_FILE_BYTES ||
                file.size === 0
            ) {
                skipped++;
                continue;
            }

            const id = `local-${crypto.randomUUID()}`;
            const src = URL.createObjectURL(file);

            localUrls.current.set(id, src);

            accepted.push({
                id,
                filename: file.name,
                src,
                source: 'local',
                sizeBytes: file.size,
                mimeType: file.type,
                uploadedAt: new Date().toISOString(),
            });

            pendingDimensions.push({ id, url: src });
        }

        if (accepted.length > 0) {
            setImages(current => [...current, ...accepted]);

            setActiveImageId(current =>
                current ?? accepted[0].id
            );

            for (const item of pendingDimensions) {
                loadImageDimensions(item.id, item.url);
            }
        }

        return {
            imported: accepted.length,
            skipped,
        };
    }

    
    function removeImages(imageIds: string[]) {
        const idsToRemove = new Set(imageIds);

        if (idsToRemove.size === 0) return;

        for (const id of idsToRemove) {
            const url = localUrls.current.get(id);

            if (url) {
                URL.revokeObjectURL(url);
                localUrls.current.delete(id);
            }
        }

        setImages(current =>
            current.filter(image => !idsToRemove.has(image.id))
        );

        setSelectedIds(current =>
            current.filter(id => !idsToRemove.has(id))
        );

        setActiveImageId(current =>
            current !== null && idsToRemove.has(current)
                ? null
                : current
        );
    }

    function removeLocalImage(id: string) {
        if (!localUrls.current.has(id)) return;

        removeImages([id]);
    }

    function toggleImage(id: string) {
        setSelectedIds(current =>
            current.includes(id)
                ? current.filter(value => value !== id)
                : [...current, id]
        );
    }

    function selectImages(imageIds: string[]) {
        const availableIds = new Set(
            images.map(image => image.id)
        );

        setSelectedIds(current => [
            ...new Set([
                ...current,
                ...imageIds.filter(id => availableIds.has(id)),
            ]),
        ]);
    }

    function deselectImages(imageIds: string[]) {
        const removeIds = new Set(imageIds);

        setSelectedIds(current =>
            current.filter(id => !removeIds.has(id))
        );
    }

    function selectProductImages(offerId: string) {
        const productImageIds = images
            .filter(image =>
                image.source === 'allegro' &&
                image.offerId === offerId
            )
            .map(image => image.id);

        selectImages(productImageIds);
    }


    function openEditor(id: string) {
        setActiveImageId(id);
        setPage('editor');
    }

    const activeImage =
        images.find(image => image.id === activeImageId) ??
        images[0];

    const batchImages =
        batchScope === 'all'
            ? images
            : images.filter(image =>
                selectedIds.includes(image.id)
            );

    return (
        <AppContext.Provider
            value={{
                page,
                setPage,

                session,

                images,
                catalogLoading,
                catalogError,
                refreshCatalog,

                importAllegroImages,
                clearAllegroImages,

                librarySourceFilter,
                setLibrarySourceFilter,

                addLocalImages,
                removeLocalImage,
                removeImages,

                activeImage,
                openEditor,

                selectedIds,
                toggleImage,

                selectAll: () =>
                    setSelectedIds(images.map(image => image.id)),

                clearSelection: () => setSelectedIds([]),

                selectImages,
                deselectImages,
                selectProductImages,

                importProgress,
                setImportProgress,

                settings,
                updateSettings: update =>
                    setSettings(current => ({
                        ...current,
                        ...update,
                    })),

                watermarkType,
                setWatermarkType,

                batchScope,
                setBatchScope,
                batchImages,
            }}
        >
            {children}
        </AppContext.Provider>
    );
}

export function useApp() {
    const context = useContext(AppContext);

    if (!context) {
        throw new Error(
            'useApp must be used within AppProvider'
        );
    }

    return context;
}
