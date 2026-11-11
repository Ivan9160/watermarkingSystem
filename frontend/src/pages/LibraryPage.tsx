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

type FormatFilter = 'all' | 'jpeg' | 'png' | 'webp' | 'unknown';
type ResolutionFilter = 'all' | 'small' | 'hd' | 'large' | 'unknown';
type SizeFilter = 'all' | 'under1' | 'from1to5' | 'over5' | 'unknown';
type CountFilter = 'all' | 'multiple' | 'five';
type SortOrder = 'asc' | 'desc';
type Dimensions = { width: number; height: number };
type UploadPreview = { id: string; name: string; url?: string; issue?: string; status?: string };
type ImageGroup = {
    key: string;
    title: string;
    offerId?: string;
    source: ProductImage['source'];
    images: ProductImage[];
};

const MB = 1024 * 1024;
const MAX_FILE_BYTES = 10 * MB;
const VALID_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const COLLAPSED_THUMBS = 8;

function getOfferId(image: ProductImage): string | undefined {
    if (image.offerId) return image.offerId;
    if (image.source !== 'allegro') return undefined;
    return image.filename.match(/^(.+)-\d{2}\.(?:jpe?g|png|webp)$/i)?.[1];
}

function productKey(image: ProductImage): string {
    if (image.source === 'local') {
        if (image.offerId) return `local:${image.offerId}`;

        if (image.productName?.trim()) {
            return `local-name:${image.productName.trim().toLowerCase()}`;
        }
    }

    if (image.source === 'allegro') {
        const offerId = getOfferId(image);

        if (offerId) return `allegro:${offerId}`;

        if (image.productName?.trim()) {
            return `allegro-name:${image.productName.trim().toLowerCase()}`;
        }
    }

    return `individual:${image.id}`;
}

function sourceLabel(source: ProductImage['source']): string {
    return source === 'local' ? 'Local' : source === 'allegro' ? 'Allegro' : 'Catalog';
}

function getFormat(image: ProductImage): Exclude<FormatFilter, 'all'> {
    if (image.mimeType === 'image/jpeg') return 'jpeg';
    if (image.mimeType === 'image/png') return 'png';
    if (image.mimeType === 'image/webp') return 'webp';
    const extension = image.filename.split('.').pop()?.toLowerCase();
    if (extension === 'jpg' || extension === 'jpeg') return 'jpeg';
    if (extension === 'png') return 'png';
    if (extension === 'webp') return 'webp';
    return 'unknown';
}

function formatBytes(bytes: number | undefined): string {
    if (bytes === undefined) return 'Not available';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < MB) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / MB).toFixed(2)} MB`;
}

function GroupCheckbox({ checked, indeterminate, onChange, label }: {
    checked: boolean;
    indeterminate: boolean;
    onChange: () => void;
    label: string;
}) {
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (ref.current) ref.current.indeterminate = indeterminate;
    }, [indeterminate]);
    return <input ref={ref} type="checkbox" className="library-product-group__check"
        checked={checked} onChange={onChange} aria-label={label} />;
}

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
    const [selectedOnly, setSelectedOnly] = useState(false);
    const [sort, setSort] = useState<SortOrder>('asc');
    const [format, setFormat] = useState<FormatFilter>('all');
    const [resolution, setResolution] = useState<ResolutionFilter>('all');
    const [size, setSize] = useState<SizeFilter>('all');
    const [count, setCount] = useState<CountFilter>('all');
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
    const groupCounts = useMemo(() => {
        const counts = new Map<string, number>();
        for (const image of images) {
            const key = productKey(image);
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        return counts;
    }, [images]);

    const visible = useMemo(() => images
        .filter(image => {
            const term = `${image.filename} ${image.productName ?? ''} ${getOfferId(image) ?? ''}`.toLowerCase();
            return term.includes(query.trim().toLowerCase());
        })
        .filter(image => librarySourceFilter === 'all' || image.source === librarySourceFilter)
        .filter(image => !selectedOnly || selectedSet.has(image.id))
        .filter(image => format === 'all' || getFormat(image) === format)
        .filter(image => {
            const width = image.width ?? dimensions[image.id]?.width;
            if (resolution === 'all') return true;
            if (resolution === 'unknown') return width === undefined;
            if (width === undefined) return false;
            if (resolution === 'small') return width < 1280;
            if (resolution === 'hd') return width >= 1280 && width < 3840;
            return width >= 3840;
        })
        .filter(image => {
            const bytes = image.sizeBytes;
            if (size === 'all') return true;
            if (size === 'unknown') return bytes === undefined;
            if (bytes === undefined) return false;
            if (size === 'under1') return bytes < MB;
            if (size === 'from1to5') return bytes >= MB && bytes <= 5 * MB;
            return bytes > 5 * MB;
        })
        .filter(image => {
            const total = groupCounts.get(productKey(image)) ?? 1;
            return count === 'all' || (count === 'multiple' ? total >= 2 : total >= 5);
        })
        .sort((a, b) => Number(recentUploadIds.has(b.id)) - Number(recentUploadIds.has(a.id)) ||
            a.filename.localeCompare(b.filename, undefined, { numeric: true }) * (sort === 'asc' ? 1 : -1)),
    [images, query, librarySourceFilter, selectedOnly, selectedSet, format,
        resolution, size, count, sort, dimensions, groupCounts, recentUploadIds]);

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
        setFormat('all');
        setResolution('all');
        setSize('all');
        setCount('all');
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
            `Remove "${image.filename}" from your WaterM library?\n\n` +
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
            `Remove ${ids.length} selected image${ids.length === 1 ? '' : 's'} from WaterM?\n\n` +
            'The original files on Allegro and your computer will NOT be deleted.'
        );
    }

    async function deleteGroup(group: ImageGroup) {
        await removeWithConfirm(
            group.images,
            `Remove all ${group.images.length} photo${group.images.length === 1 ? '' : 's'} of "${group.title}" from WaterM?\n\n` +
            'The original files on Allegro and your computer will NOT be deleted.'
        );
    }

    function resetFilters() {
        setQuery('');
        setSelectedOnly(false);
        setFormat('all');
        setResolution('all');
        setSize('all');
        setCount('all');
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

            <div className="library-toolbar">
                <div className="library-metrics">
                    <span className="counter">{images.length} images</span>
                    <span className="counter counter-accent">{selectedIds.length} selected</span>
                    <span className="counter">{visible.length} matching</span>
                </div>
                <div className="library-controls">
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
                    <select aria-label="Image format" value={format}
                        onChange={event => setFormat(event.target.value as FormatFilter)}>
                        <option value="all">All formats</option>
                        <option value="jpeg">JPG / JPEG</option>
                        <option value="png">PNG</option>
                        <option value="webp">WebP</option>
                    </select>
                    <select aria-label="Resolution" value={resolution}
                        onChange={event => setResolution(event.target.value as ResolutionFilter)}>
                        <option value="all">Any resolution</option>
                        <option value="small">Under 1280px</option>
                        <option value="hd">1280–3840px</option>
                        <option value="large">3840px and above</option>
                    </select>
                    <select aria-label="File size" value={size}
                        onChange={event => setSize(event.target.value as SizeFilter)}>
                        <option value="all">Any file size</option>
                        <option value="under1">Under 1 MB</option>
                        <option value="from1to5">1–5 MB</option>
                        <option value="over5">Over 5 MB</option>
                    </select>
                    <select aria-label="Photos per product" value={count}
                        onChange={event => setCount(event.target.value as CountFilter)}>
                        <option value="all">Any photo count</option>
                        <option value="multiple">2+ photos per product</option>
                        <option value="five">5+ photos per product</option>
                    </select>
                    <select aria-label="Selection filter" value={selectedOnly ? 'selected' : 'all'}
                        onChange={event => setSelectedOnly(event.target.value === 'selected')}>
                        <option value="all">All photos</option>
                        <option value="selected">Selected only</option>
                    </select>
                    <select aria-label="Sort images" value={sort}
                        onChange={event => setSort(event.target.value as SortOrder)}>
                        <option value="asc">Name A–Z</option>
                        <option value="desc">Name Z–A</option>
                    </select>
                    <button className="btn btn-secondary" onClick={resetFilters}>Reset filters</button>
                </div>
            </div>

            <div className="library-selection-row">
                <span>{visibleSelected} of {visible.length} matching images selected</span>
                <div className="library-selection-actions">
                    <button className="subtle-link" onClick={() => selectImages(visibleIds)}>Select matching</button>
                    <button className="subtle-link" onClick={() => deselectImages(visibleIds)}>Deselect matching</button>
                    <button className="subtle-link" onClick={() => selectImages(images.map(image => image.id))}>Select all</button>
                    <button className="subtle-link" onClick={clearSelection}>Clear selection</button>
                    <button className="subtle-link"
                        onClick={() => setCollapsedGroups(new Set(visibleGroups.map(group => group.key)))}>
                        Collapse all
                    </button>
                    <button className="subtle-link" onClick={() => setCollapsedGroups(new Set())}>Expand all</button>
                    {selectedIds.length > 0 && <button className="subtle-link subtle-link-danger" onClick={deleteSelectedImages}>
                        Delete selected ({selectedIds.length})
                    </button>}
                </div>
            </div>

            <div className={`panel library-upload${dragOver ? ' library-upload--dragging' : ''}`}>
                <div className="library-upload-main">
                    <span aria-hidden="true" className="library-upload-icon">⇪</span>
                    <div className="library-upload-copy">
                        <strong className="library-upload-title">Drop product photos anywhere on this page</strong>
                        <div className="library-upload-description">JPG, PNG, WebP · up to 10 MB per image</div>
                    </div>
                    <button className="btn btn-secondary" onClick={() => fileInput.current?.click()}>Choose files</button>
                </div>
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
            </div>

            <div
                ref={libraryGridRef}
                className={`library-product-groups scrollable-content${dragOver ? ' library-drag-active' : ''}${visible.length === 0 ? ' library-empty' : ''}`}
            >
                {catalogLoading && (
                    <div className="empty-library">Loading images...</div>
                )}

                {catalogError && (
                    <div className="empty-library" role="alert">
                        Remote catalog unavailable: {catalogError}
                    </div>
                )}

                {visibleGroups.map(group => {
                    const selectedCount = group.images.filter(
                        image => selectedSet.has(image.id)
                    ).length;
                    const allSelected = selectedCount === group.images.length;
                    const isCollapsed = collapsedGroups.has(group.key);
                    const classes = [
                        'library-product-group',
                        isCollapsed ? 'library-product-group--collapsed' : '',
                        selectedCount > 0 ? 'library-product-group--active' : '',
                    ].filter(Boolean).join(' ');

                    return (
                        <section key={group.key} className={classes}>
                            <header className="library-product-group__header">
                                <div className="library-product-group__controls">
                                    <GroupCheckbox
                                        checked={allSelected}
                                        indeterminate={selectedCount > 0 && !allSelected}
                                        onChange={() => toggleGroupSelection(group)}
                                        label={`${allSelected ? 'Deselect' : 'Select'} all photos of ${group.title}`}
                                    />
                                    <button
                                        type="button"
                                        className="library-product-group__toggle"
                                        aria-expanded={!isCollapsed}
                                        aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${group.title}`}
                                        onClick={() => toggleGroupCollapsed(group.key)}
                                    >
                                        {isCollapsed ? '▸' : '▾'}
                                    </button>
                                    <span className="library-product-group__source">
                                        {sourceLabel(group.source)}
                                    </span>
                                </div>

                                <div className="library-product-group__info">
                                    <h3 title={group.title}>{group.title}</h3>
                                    <span>
                                        {group.offerId ? `Offer ID: ${group.offerId} · ` : ''}
                                        {group.images.length} {group.images.length === 1 ? 'photo' : 'photos'}
                                    </span>
                                </div>

                                <span className={`library-product-group__selected${selectedCount > 0 ? ' library-product-group__selected--active' : ''}`}>
                                    {selectedCount} / {group.images.length} selected
                                </span>

                                <div className="library-product-group__actions">
                                    <button type="button" className="btn btn-secondary"
                                        onClick={() => watermarkGroup(group)}>
                                        Watermark →
                                    </button>
                                    <button type="button" className="btn btn-secondary btn-danger"
                                        title="Remove this product's photos from WaterM only"
                                        onClick={() => deleteGroup(group)}>
                                        Delete group
                                    </button>
                                </div>
                            </header>

                            {isCollapsed ? (
                                <div className="library-product-group__collapsed-preview">
                                    {group.images.slice(0, COLLAPSED_THUMBS).map(image => (
                                        <img
                                            key={image.id}
                                            src={image.src}
                                            alt={image.productName ?? image.filename}
                                            loading="lazy"
                                            title={image.filename}
                                        />
                                    ))}
                                    {group.images.length > COLLAPSED_THUMBS && (
                                        <span className="library-product-group__more">
                                            +{group.images.length - COLLAPSED_THUMBS}
                                        </span>
                                    )}
                                </div>
                            ) : (
                                <div className="library-product-group__grid">
                                    {group.images.map(image => {
                                        const isSelected = selectedSet.has(image.id);
                                        const d = dimensions[image.id];
                                        const width = image.width ?? d?.width;
                                        const height = image.height ?? d?.height;
                                        const resolutionText = width && height
                                            ? `${width}×${height}`
                                            : 'Resolution loading';
                                        const localStatus = image.source === 'local'
                                            ? (image.uploadStatus === 'ready'
                                                ? 'RustFS ready'
                                                : image.uploadStatus === 'failed'
                                                    ? 'Upload failed'
                                                    : 'Uploading…')
                                            : null;

                                        return (
                                            <article
                                                key={image.id}
                                                className={`image-card ${isSelected ? 'selected' : ''}`}
                                            >
                                                <button
                                                    className="image-thumb"
                                                    type="button"
                                                    onClick={() => toggleImage(image.id)}
                                                    aria-pressed={isSelected}
                                                    aria-label={`${isSelected ? 'Deselect' : 'Select'} ${image.filename}`}
                                                >
                                                    <img
                                                        src={image.src}
                                                        alt={image.productName ?? image.filename}
                                                        loading="lazy"
                                                        onLoad={event => rememberDimensions(
                                                            image.id,
                                                            event.currentTarget.naturalWidth,
                                                            event.currentTarget.naturalHeight
                                                        )}
                                                    />

                                                    <span className="selection-mark" aria-hidden="true">
                                                        {isSelected ? '✓' : ''}
                                                    </span>
                                                </button>

                                                <div className="image-footer">
                                                    <div
                                                        className="image-footer-title"
                                                        title={image.filename}
                                                    >
                                                        {image.filename}
                                                    </div>

                                                    <div className="image-footer-meta">
                                                        {localStatus ? `${localStatus} · ` : ''}
                                                        {resolutionText}
                                                    </div>

                                                    <div className="card-actions">
                                                        <button
                                                            type="button"
                                                            onClick={() => setDetailId(image.id)}
                                                        >
                                                            Details
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => openEditor(image.id)}
                                                        >
                                                            Edit →
                                                        </button>

                                                        <button
                                                            type="button"
                                                            className="remove-local"
                                                            title="Remove from WaterM only"
                                                            aria-label={`Delete ${image.filename} from WaterM`}
                                                            onClick={() => deleteImage(image)}
                                                        >
                                                            Delete
                                                        </button>
                                                    </div>
                                                </div>
                                            </article>
                                        );
                                    })}
                                </div>
                            )}
                        </section>
                    );
                })}

                {!catalogLoading && visible.length === 0 && (
                    <div className="empty-library dropzone">
                        <div className="drop-icon">▧</div>

                        <strong>
                            {images.length
                                ? 'No images match these filters'
                                : 'Your image library is empty'}
                        </strong>

                        <p>
                            {images.length
                                ? 'Reset filters or try another search. Resolution is known only for loaded thumbnails until the backend supplies metadata.'
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
                            onClick={() => deleteImage(detailImage)}>Delete from WaterM</button>
                    </div>
                    <p className="image-details-note">Allegro file size may be unavailable until the backend provides it. Offer ID is inferred from the current filename when not supplied directly.</p>
                </aside>
            </div>}
        </div>
    );
}