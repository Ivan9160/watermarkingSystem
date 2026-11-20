import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type ChangeEvent,
    type DragEvent,
} from 'react';
import { PageHeading } from '../components/PageHeading';
import { useApp, type LibrarySourceFilter } from '../context/AppContext';
import type { ProductImage } from '../types';
import { api } from '../services/api';
import { LibraryGroupGrid } from '../components/LibraryGroupGrid';
import {
    VALID_TYPES, MAX_FILE_BYTES, getOfferId, productKey, getFormat, formatBytes,
    type ImageGroup, type Dimensions, type LibraryViewMode, type SortOrder, type UploadPreview,
} from '../utils/libraryHelpers';

export function LibraryPage() {
    const {
        images, catalogLoading, catalogError, selectedIds, toggleImage,
        openEditor, setPage, clearSelection, selectImages, deselectImages,
        addLocalImages, markLocalUploaded, markLocalUploadFailed, removeImages, librarySourceFilter,
        setLibrarySourceFilter,
    } = useApp();

    const fileInput = useRef<HTMLInputElement>(null);
    const previewUrls = useRef<string[]>([]);
    const libraryGridRef = useRef<HTMLDivElement>(null);
    const [query, setQuery] = useState('');
    const [viewMode, setViewMode] = useState<LibraryViewMode>('photos');
    const [selectedOnly, setSelectedOnly] = useState(false);
    const [sort, setSort] = useState<SortOrder>('asc');
    const [dimensions, setDimensions] = useState<Record<string, Dimensions>>({});
    const [detailId, setDetailId] = useState<string | null>(null);
    const [uploadPreviews, setUploadPreviews] = useState<UploadPreview[]>([]);
    const [uploadNotice, setUploadNotice] = useState('');
    const [uploadError, setUploadError] = useState('');
    const [recentUploadIds, setRecentUploadIds] = useState<Set<string>>(() => new Set());
    const [showUploadDetails, setShowUploadDetails] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());

    useEffect(() => () => {
        previewUrls.current.forEach(url => URL.revokeObjectURL(url));
        previewUrls.current = [];
    }, []);

    useEffect(() => {
        if (detailId === null) return;
        function onKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') setDetailId(null);
        }
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [detailId]);

    const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

    const visible = useMemo(() => images
        .filter(image => {
            const term = `${image.filename} ${image.productName ?? ''} ${getOfferId(image) ?? ''}`.toLowerCase();
            return term.includes(query.trim().toLowerCase());
        })
        .filter(image => librarySourceFilter === 'all' || image.source === librarySourceFilter)
        .filter(image => !selectedOnly || selectedSet.has(image.id))
        .sort((a, b) => Number(recentUploadIds.has(b.id)) - Number(recentUploadIds.has(a.id)) ||
            a.filename.localeCompare(b.filename, undefined, { numeric: true }) * (sort === 'asc' ? 1 : -1)),
        [images, query, librarySourceFilter, selectedOnly, selectedSet, sort, recentUploadIds]);

    const visibleGroups = useMemo<ImageGroup[]>(() => {
        const groups = new Map<string, ImageGroup>();
        for (const image of visible) {
            const key = productKey(image);
            let group = groups.get(key);
            if (!group) {
                const offerId = getOfferId(image);
                group = {
                    key,
                    title: image.productName?.trim() ||
                        (offerId ? `Offer ${offerId}` : image.filename),
                    offerId,
                    source: image.source,
                    images: [],
                };
                groups.set(key, group);
            }
            group.images.push(image);
        }
        return Array.from(groups.values());
    }, [visible]);

    const displayGroups: ImageGroup[] = viewMode === 'products'
        ? visibleGroups
        : visible.length > 0 ? [{
            key: 'all-photos',
            title: 'All Photos',
            source: visible[0].source,
            images: visible,
        }] : [];

    const detailImage = images.find(image => image.id === detailId);
    const detailGroup = detailImage
        ? images.filter(image => productKey(image) === productKey(detailImage))
        : [];
    const visibleIds = visible.map(image => image.id);
    const visibleSelected = visibleIds.filter(id => selectedSet.has(id)).length;
    const localCount = images.filter(image => image.source === 'local').length;
    const allegroCount = images.filter(image => image.source === 'allegro').length;

    function rememberDimensions(id: string, width: number, height: number) {
        if (width <= 0 || height <= 0) return;
        setDimensions(current => {
            const previous = current[id];
            if (previous?.width === width && previous.height === height) return current;
            return { ...current, [id]: { width, height } };
        });
    }

    function toggleGroupCollapsed(key: string) {
        setCollapsedGroups(current => {
            const next = new Set(current);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }

    function toggleGroupSelection(group: ImageGroup) {
        const ids = group.images.map(image => image.id);
        const allSelected = ids.every(id => selectedSet.has(id));
        if (allSelected) deselectImages(ids);
        else selectImages(ids);
    }

    function watermarkGroup(group: ImageGroup) {
        selectImages(group.images.map(image => image.id));
        setPage('batch');
    }

    async function importFiles(files: File[]) {
        if (!files.length) return;
        setUploadError('');
        previewUrls.current.forEach(url => URL.revokeObjectURL(url));
        previewUrls.current = [];
        setQuery('');
        setSelectedOnly(false);
        setLibrarySourceFilter('all');
        const { imported, skipped, accepted } = addLocalImages(files);
        const byFile = new Map(accepted.map(item => [item.file, item.id]));
        const previews: UploadPreview[] = files.slice(0, 11).map(file => {
            const issue = !VALID_TYPES.has(file.type)
                ? 'Unsupported image format'
                : file.size === 0 ? 'Empty file'
                    : file.size > MAX_FILE_BYTES ? 'Over 10 MB' : undefined;
            const url = !issue ? URL.createObjectURL(file) : undefined;
            if (url) previewUrls.current.push(url);
            return {
                id: byFile.get(file) ?? crypto.randomUUID(),
                name: file.name,
                url,
                issue,
                status: issue ? undefined : 'Uploading to RustFS…',
            };
        });
        setUploadPreviews(previews);
        setShowUploadDetails(true);
        setRecentUploadIds(new Set(accepted.map(item => item.id)));
        setUploadNotice(`${imported} image(s) added to Library · uploading to RustFS…${skipped ? ` · ${skipped} skipped` : ''}`);
        requestAnimationFrame(() => libraryGridRef.current?.scrollTo({ top: 0 }));
        if (!accepted.length) {
            setUploadError('No valid files selected. Choose JPG, PNG or WebP under 10 MB.');
            return;
        }
        let completed = 0;
        let uploadedCount = 0;
        const failures: string[] = [];
        for (let start = 0; start < accepted.length; start += 3) {
            await Promise.all(accepted.slice(start, start + 3).map(async ({ id, file, offerId }) => {
                try {
                    const uploaded = await api.uploadLocalImage(file, offerId);
                    markLocalUploaded(id, uploaded);
                    uploadedCount++;
                    setUploadPreviews(current => current.map(item => item.id === id
                        ? { ...item, status: 'RustFS ready', issue: undefined } : item));
                } catch (error) {
                    const reason = error instanceof Error ? error.message : 'Unknown upload error';
                    const message = /unauthori[sz]ed|connect allegro|401|session|invalid token/i.test(reason)
                        ? 'Allegro session expired. Open Integrations and reconnect Allegro.'
                        : reason;
                    failures.push(`${file.name}: ${message}`);
                    markLocalUploadFailed(id);
                    setUploadPreviews(current => current.map(item => item.id === id
                        ? { ...item, status: undefined, issue: `Failed: ${message}` } : item));
                } finally {
                    completed++;
                    setUploadNotice(`${completed} / ${accepted.length} checked · ${uploadedCount} uploaded · ${failures.length} failed`);
                }
            }));
        }
        if (failures.length) {
            setUploadError(`${failures.length} upload(s) failed. ${failures[0]}${failures.length > 1 ? ' (See image details for other errors.)' : ''}`);
            setUploadNotice(`${uploadedCount} saved to RustFS · ${failures.length} failed`);
        } else {
            setUploadNotice(`${uploadedCount} photo(s) successfully saved to RustFS${skipped ? ` · ${skipped} skipped` : ''}`);
        }
    }

    function handleInput(event: ChangeEvent<HTMLInputElement>) {
        importFiles(Array.from(event.target.files ?? []));
        event.target.value = '';
    }

    function handleDrop(event: DragEvent<HTMLDivElement>) {
        event.preventDefault();
        setDragOver(false);
        importFiles(Array.from(event.dataTransfer.files));
    }

    async function deleteImage(image: ProductImage) {
        const confirmed = window.confirm(
            `Remove "${image.filename}" from your WatermarkOS library?\n\n` +
            'The original image will NOT be deleted from Allegro or your computer.'
        );
        if (!confirmed) return;
        if (image.source === 'local' && image.sourceRef) {
            try { await api.deleteLocalImage(image.sourceRef); }
            catch (error) {
                setUploadNotice(error instanceof Error ? error.message : 'Could not delete uploaded image from RustFS');
                return;
            }
        }
        removeImages([image.id]);
        if (detailId === image.id) setDetailId(null);
    }

    async function removeWithConfirm(targets: ProductImage[], message: string) {
        if (!targets.length) return;
        if (!window.confirm(message)) return;
        const removedIds: string[] = [];
        for (const image of targets) {
            if (image.source === 'local' && image.sourceRef) {
                try { await api.deleteLocalImage(image.sourceRef); }
                catch (error) {
                    setUploadNotice(error instanceof Error ? error.message : `Could not delete ${image.filename} from RustFS`);
                    continue;
                }
            }
            removedIds.push(image.id);
        }
        removeImages(removedIds);
        if (detailId !== null && removedIds.includes(detailId)) setDetailId(null);
    }

    async function deleteSelectedImages() {
        const presentIds = new Set(images.map(image => image.id));
        const ids = selectedIds.filter(id => presentIds.has(id));
        if (!ids.length) return;
        const selected = images.filter(image => ids.includes(image.id));
        await removeWithConfirm(
            selected,
            `Remove ${ids.length} selected image${ids.length === 1 ? '' : 's'} from WatermarkOS?\n\n` +
            'The original files on Allegro and your computer will NOT be deleted.'
        );
    }

    async function deleteGroup(group: ImageGroup) {
        await removeWithConfirm(
            group.images,
            `Remove all ${group.images.length} photo${group.images.length === 1 ? '' : 's'} of "${group.title}" from WatermarkOS?\n\n` +
            'The original files on Allegro and your computer will NOT be deleted.'
        );
    }

    function resetFilters() {
        setQuery('');
        setSelectedOnly(false);
        setLibrarySourceFilter('all');
    }

    return (
        <div className="page-shell"
            onDragOver={event => { event.preventDefault(); setDragOver(true); }}
            onDragLeave={event => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false);
            }}
            onDrop={handleDrop}>
            <input ref={fileInput} type="file" hidden multiple
                accept="image/png,image/jpeg,image/webp" onChange={handleInput}
                aria-label="Choose product images" />
            <PageHeading title="Image Library"
                subtitle="Browse, filter and manage product photos"
                actions={<>
                    <button className="btn btn-secondary" onClick={() => setPage('integrations')}>↗ Connect store</button>
                    <button className="btn btn-primary" onClick={() => setPage('batch')}>Go to Batch →</button>
                </>} />
            <div className="library-toolbar library-toolbar--compact">
                <div className="library-topline">
                    <div className="library-metrics">
                        <span className="counter">{images.length} images</span>
                        <span className="counter counter-accent">{selectedIds.length} selected</span>
                        <span className="counter">{visible.length} matching</span>
                    </div>
                    <div className="library-view-switch" role="group" aria-label="Library view mode">
                        <button type="button" className={viewMode === 'photos' ? 'active' : ''}
                            aria-pressed={viewMode === 'photos'} onClick={() => setViewMode('photos')}>
                            All Photos
                        </button>
                        <button type="button" className={viewMode === 'products' ? 'active' : ''}
                            aria-pressed={viewMode === 'products'} onClick={() => setViewMode('products')}>
                            By Products
                        </button>
                    </div>
                </div>
                <div className="library-controls library-controls--compact">
                    <div className="search-input"><span>⌕</span>
                        <input aria-label="Search images" placeholder="Search file, product or offer ID..."
                            value={query} onChange={event => setQuery(event.target.value)} />
                    </div>
                    <select aria-label="Image source" value={librarySourceFilter}
                        onChange={event => setLibrarySourceFilter(event.target.value as LibrarySourceFilter)}>
                        <option value="all">All sources ({images.length})</option>
                        <option value="local">Uploaded by me ({localCount})</option>
                        <option value="allegro">Allegro ({allegroCount})</option>
                    </select>
                    <select aria-label="Selection filter" value={selectedOnly ? 'selected' : 'all'}
                        onChange={event => setSelectedOnly(event.target.value === 'selected')}>
                        <option value="all">All images</option>
                        <option value="selected">Selected only</option>
                    </select>
                    <select aria-label="Sort images" value={sort}
                        onChange={event => setSort(event.target.value as SortOrder)}>
                        <option value="asc">Name A–Z</option>
                        <option value="desc">Name Z–A</option>
                    </select>
                    <button type="button" className="btn btn-secondary" onClick={resetFilters}>Reset</button>
                    <button type="button" className="btn btn-primary" onClick={() => fileInput.current?.click()}>
                        + Upload images
                    </button>
                </div>
            </div>
            <div className="library-selection-row">
                <span>{visibleSelected} of {visible.length} matching images selected</span>
                <div className="library-selection-actions">
                    <button className="subtle-link" onClick={() => selectImages(visibleIds)}>Select matching</button>
                    <button className="subtle-link" onClick={() => deselectImages(visibleIds)}>Deselect matching</button>
                    <button className="subtle-link" onClick={() => selectImages(images.map(image => image.id))}>Select all</button>
                    <button className="subtle-link" onClick={clearSelection}>Clear selection</button>
                    {viewMode === 'products' && <>
                        <button className="subtle-link"
                            onClick={() => setCollapsedGroups(new Set(visibleGroups.map(group => group.key)))}>
                            Collapse all
                        </button>
                        <button className="subtle-link" onClick={() => setCollapsedGroups(new Set())}>Expand all</button>
                    </>}
                    {selectedIds.length > 0 && <button className="subtle-link subtle-link-danger" onClick={deleteSelectedImages}>
                        Delete selected ({selectedIds.length})
                    </button>}
                </div>
            </div>
            {(uploadNotice || uploadError || (showUploadDetails && uploadPreviews.length > 0)) &&
                <div className={`panel library-upload library-upload--compact${dragOver ? ' library-upload--dragging' : ''}`}>
                    {uploadNotice && <div role="status" className="library-upload-notice">
                        <span className="library-upload-notice-text">{uploadNotice}</span>
                        {uploadPreviews.length > 0 && <button type="button" className="subtle-link"
                            onClick={() => setShowUploadDetails(value => !value)}>
                            {showUploadDetails ? 'Hide details' : 'Show upload details'}
                        </button>}
                    </div>}
                    {uploadError && <div className="wm-local-upload-error" role="alert">
                        <strong>Local image upload failed</strong>
                        <span>{uploadError}</span>
                        {/unauthori[sz]ed|reconnect allegro|401|session/i.test(uploadError) &&
                            <button type="button" className="btn btn-secondary"
                                onClick={() => setPage('integrations')}>Reconnect Allegro</button>}
                    </div>}
                    {showUploadDetails && uploadPreviews.length > 0 && <div className="library-upload-preview-list">
                        {uploadPreviews.map(item => <div key={item.id} className="library-upload-preview-item">
                            <div className="library-upload-preview-image">
                                {item.url ? <img src={item.url} alt="" /> : <span>⚠</span>}
                            </div>
                            <div title={item.name} className="library-upload-preview-name">{item.name}</div>
                            <div className={`library-upload-preview-status${item.issue ? ' library-upload-preview-status--error' : ''}`}>{item.issue ?? item.status ?? 'Uploading…'}</div>
                        </div>)}
                    </div>}
                </div>}
            <div
                ref={libraryGridRef}
                className={`library-product-groups scrollable-content library-product-groups--${viewMode}${dragOver ? ' library-drag-active' : ''}${visible.length === 0 ? ' library-empty' : ''}`}
            >
                {catalogLoading && (
                    <div className="empty-library">Loading images...</div>
                )}
                {catalogError && (
                    <div className="empty-library" role="alert">
                        Remote catalog unavailable: {catalogError}
                    </div>
                )}
                {displayGroups.length > 0 && (
                    <LibraryGroupGrid
                        groups={displayGroups}
                        selectedSet={selectedSet}
                        viewMode={viewMode}
                        collapsedGroups={collapsedGroups}
                        dimensions={dimensions}
                        toggleGroupSelection={toggleGroupSelection}
                        toggleGroupCollapsed={toggleGroupCollapsed}
                        watermarkGroup={watermarkGroup}
                        deleteGroup={deleteGroup}
                        toggleImage={toggleImage}
                        rememberDimensions={rememberDimensions}
                        setDetailId={setDetailId}
                        openEditor={openEditor}
                        deleteImage={deleteImage}
                    />
                )}
                {!catalogLoading && visible.length === 0 && (
                    <div className="empty-library dropzone">
                        <div className="drop-icon">▧</div>
                        <strong>
                            {images.length
                                ? 'No images match your search or filters'
                                : 'Your image library is empty'}
                        </strong>
                        <p>
                            {images.length
                                ? 'Reset filters or try another search.'
                                : 'Upload photos or connect an Allegro seller account.'}
                        </p>
                        <div className="empty-actions">
                            <button
                                className="btn btn-primary"
                                onClick={() => fileInput.current?.click()}
                            >
                                Choose images
                            </button>
                            <button
                                className="btn btn-secondary"
                                onClick={images.length
                                    ? resetFilters
                                    : () => setPage('integrations')}
                            >
                                {images.length ? 'Reset filters' : 'Connect store →'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
            {detailImage && <div role="presentation" className="image-details-backdrop" onClick={() => setDetailId(null)}>
                <aside role="dialog" aria-modal="true" aria-labelledby="image-details-title"
                    onClick={event => event.stopPropagation()}
                    className="image-details-panel">
                    <div className="image-details-heading">
                        <h2 id="image-details-title">Image Details</h2>
                        <button className="btn btn-secondary" onClick={() => setDetailId(null)} aria-label="Close image details">✕</button>
                    </div>
                    <div className="image-details-preview">
                        <img src={detailImage.src} alt={detailImage.productName ?? detailImage.filename}
                            onLoad={event => rememberDimensions(detailImage.id, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
                        />
                    </div>
                    <div className="image-details-metadata">
                        {([
                            ['Filename', detailImage.filename],
                            ['Product', detailImage.productName ?? '—'],
                            ['Source', detailImage.source === 'allegro' ? 'Allegro' : detailImage.source === 'local' ? 'Local upload' : 'Catalog'],
                            ['Offer / local group ID', getOfferId(detailImage) ?? '—'],
                            ['Product photos', String(detailGroup.length)],
                            ['Format', getFormat(detailImage).toUpperCase()],
                            ['Resolution', detailImage.width && detailImage.height
                                ? `${detailImage.width} × ${detailImage.height}`
                                : dimensions[detailImage.id]
                                    ? `${dimensions[detailImage.id].width} × ${dimensions[detailImage.id].height}`
                                    : 'Not available'],
                            ['File size', formatBytes(detailImage.sizeBytes)],
                            ['Uploaded', detailImage.uploadedAt ? new Date(detailImage.uploadedAt).toLocaleString() : 'Not available'],
                        ] as Array<[string, string]>).map(([label, value]) =>
                            <div key={label} className="image-details-row">
                                <span className="image-details-label">{label}</span>
                                <span className="image-details-value">{value}</span>
                            </div>)}
                    </div>
                    <div className="image-details-actions">
                        <button className="btn btn-primary" onClick={() => { openEditor(detailImage.id); setDetailId(null); }}>Edit this image →</button>
                        <button className="btn btn-secondary" onClick={() => selectImages(detailGroup.map(item => item.id))}>Select all {detailGroup.length} photos of this product</button>
                        <button className="btn btn-secondary" onClick={() => deselectImages(detailGroup.map(item => item.id))}>Deselect product photos</button>
                        <button className="btn btn-secondary btn-danger"
                            onClick={() => deleteImage(detailImage)}>Delete from WatermarkOS</button>
                    </div>
                    <p className="image-details-note">Allegro file size may be unavailable until the backend provides it. Offer ID is inferred from the current filename when not supplied directly.</p>
                </aside>
            </div>}
        </div>
    );
}
