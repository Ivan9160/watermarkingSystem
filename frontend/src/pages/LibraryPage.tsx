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

type FormatFilter = 'all' | 'jpeg' | 'png' | 'webp' | 'unknown';
type ResolutionFilter = 'all' | 'small' | 'hd' | 'large' | 'unknown';
type SizeFilter = 'all' | 'under1' | 'from1to5' | 'over5' | 'unknown';
type CountFilter = 'all' | 'multiple' | 'five';
type SortOrder = 'asc' | 'desc';
type Dimensions = { width: number; height: number };
type UploadPreview = { id: string; name: string; url?: string; issue?: string };

const MB = 1024 * 1024;
const MAX_FILE_BYTES = 25 * MB;
const VALID_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function getOfferId(image: ProductImage): string | undefined {
    if (image.offerId) return image.offerId;
    if (image.source !== 'allegro') return undefined;
    return image.filename.match(/^(.+)-\d{2}\.(?:jpe?g|png|webp)$/i)?.[1];
}

function productKey(image: ProductImage): string {
    if (image.source === 'allegro') {
        const offerId = getOfferId(image);
        if (offerId) return `allegro:${offerId}`;
        if (image.productName) return `allegro-name:${image.productName.toLowerCase()}`;
    }
    return `individual:${image.id}`;
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

export function LibraryPage() {
    const {
        images, catalogLoading, catalogError, selectedIds, toggleImage,
        openEditor, setPage, clearSelection, selectImages, deselectImages,
        addLocalImages, removeImages, librarySourceFilter,
        setLibrarySourceFilter,
    } = useApp();

    const fileInput = useRef<HTMLInputElement>(null);
    const previewUrls = useRef<string[]>([]);
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
    const [showUploadDetails, setShowUploadDetails] = useState(false);
    const [dragOver, setDragOver] = useState(false);

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
        .sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }) * (sort === 'asc' ? 1 : -1)),
    [images, query, librarySourceFilter, selectedOnly, selectedSet, format,
        resolution, size, count, sort, dimensions, groupCounts]);

    const detailImage = images.find(image => image.id === detailId);
    const detailGroup = detailImage
        ? images.filter(image => productKey(image) === productKey(detailImage))
        : [];
    const visibleIds = visible.map(image => image.id);
    const gridColumns = Math.min(Math.max(visible.length, 1), 5);
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

    function importFiles(files: File[]) {
        if (!files.length) return;
        previewUrls.current.forEach(url => URL.revokeObjectURL(url));
        previewUrls.current = [];

        const previews = files.slice(0, 11).map(file => {
            const issue = !VALID_TYPES.has(file.type)
                ? 'Unsupported format'
                : file.size === 0 ? 'Empty file'
                    : file.size > MAX_FILE_BYTES ? 'Over 25 MB' : undefined;
            const url = !issue ? URL.createObjectURL(file) : undefined;
            if (url) previewUrls.current.push(url);
            return { id: crypto.randomUUID(), name: file.name, url, issue };
        });

        setUploadPreviews(previews);
        setShowUploadDetails(false);
        const { imported, skipped } = addLocalImages(files);
        setUploadNotice(`${imported} added${skipped ? ` · ${skipped} skipped (format, empty or over 25 MB)` : ''}${files.length > 11 ? ' · showing first 11 files below' : ''}`);
        setSelectedOnly(false);
        if (imported > 0) setLibrarySourceFilter('all');
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

    function deleteImage(image: ProductImage) {
        const confirmed = window.confirm(
            `Remove "${image.filename}" from your WaterM library?\n\n` +
            'The original image will NOT be deleted from Allegro or your computer.'
        );
        if (!confirmed) return;

        removeImages([image.id]);
        if (detailId === image.id) setDetailId(null);
    }

    function deleteSelectedImages() {
        const presentIds = new Set(images.map(image => image.id));
        const ids = selectedIds.filter(id => presentIds.has(id));
        if (!ids.length) return;

        const confirmed = window.confirm(
            `Remove ${ids.length} selected image${ids.length === 1 ? '' : 's'} from WaterM?\n\n` +
            'The original files on Allegro and your computer will NOT be deleted.'
        );
        if (!confirmed) return;

        removeImages(ids);
        if (detailId !== null && ids.includes(detailId)) setDetailId(null);
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
                    <button className="btn btn-primary" onClick={() => setPage('batch')}>Batch preview →</button>
                </>} />

            <div className="library-toolbar" style={{ alignItems: 'flex-start' }}>
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
                        <option value="unknown">Unknown format</option>
                    </select>
                    <select aria-label="Resolution" value={resolution}
                        onChange={event => setResolution(event.target.value as ResolutionFilter)}>
                        <option value="all">Any resolution</option>
                        <option value="small">Width under 1280px</option>
                        <option value="hd">1280–3839px wide</option>
                        <option value="large">3840px and above</option>
                        <option value="unknown">Resolution unknown</option>
                    </select>
                    <select aria-label="File size" value={size}
                        onChange={event => setSize(event.target.value as SizeFilter)}>
                        <option value="all">Any file size</option>
                        <option value="under1">Under 1 MB</option>
                        <option value="from1to5">1–5 MB</option>
                        <option value="over5">Over 5 MB</option>
                        <option value="unknown">Size unknown</option>
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

            <div className="library-selection-row" style={{ flexWrap: 'wrap', gap: 12 }}>
                <span>{visibleSelected} of {visible.length} matching images selected</span>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button className="subtle-link" onClick={() => selectImages(visibleIds)}>Select matching</button>
                    <button className="subtle-link" onClick={() => deselectImages(visibleIds)}>Deselect matching</button>
                    <button className="subtle-link" onClick={() => selectImages(images.map(image => image.id))}>Select all</button>
                    <button className="subtle-link" onClick={clearSelection}>Clear selection</button>
                    {selectedIds.length > 0 && <button className="subtle-link"
                        style={{ color: '#f0a4ad' }} onClick={deleteSelectedImages}>
                        Delete selected ({selectedIds.length})
                    </button>}
                </div>
            </div>

            <div className="panel" style={{ padding: '12px 15px', margin: '7px 0 12px', borderStyle: dragOver ? 'dashed' : 'solid', borderColor: dragOver ? '#8b7aff' : undefined }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span aria-hidden="true" style={{ fontSize: 22 }}>⇪</span>
                    <div style={{ flex: 1, minWidth: 180 }}>
                        <strong style={{ fontSize: 13 }}>Drop product photos anywhere on this page</strong>
                        <div style={{ color: '#9aa7bc', fontSize: 11, marginTop: 3 }}>JPG, PNG, WebP · up to 25 MB per image</div>
                    </div>
                    <button className="btn btn-secondary" onClick={() => fileInput.current?.click()}>Choose files</button>
                </div>
                {uploadNotice && <div role="status" style={{ marginTop: 8, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ color: '#bab1ff', fontSize: 12 }}>{uploadNotice}</span>
                    {uploadPreviews.length > 0 && <button type="button" className="subtle-link"
                        onClick={() => setShowUploadDetails(value => !value)}>
                        {showUploadDetails ? 'Hide details' : 'Show upload details'}
                    </button>}
                </div>}
                {showUploadDetails && uploadPreviews.length > 0 && <div style={{ display: 'flex', gap: 10, overflowX: 'auto', marginTop: 10, paddingBottom: 3 }}>
                    {uploadPreviews.map(item => <div key={item.id} style={{ width: 100, flexShrink: 0 }}>
                        <div style={{ height: 62, background: '#212b3c', borderRadius: 8, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                            {item.url ? <img src={item.url} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : <span>⚠</span>}
                        </div>
                        <div title={item.name} style={{ color: '#bdc7d6', fontSize: 10, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', marginTop: 5 }}>{item.name}</div>
                        <div style={{ color: item.issue ? '#f2a9a9' : '#85d6b5', fontSize: 10 }}>{item.issue ?? 'Added'}</div>
                    </div>)}
                </div>}
            </div>

            <div className={`library-grid library-grid--${gridColumns} scrollable-content${dragOver ? ' library-drag-active' : ''}${visible.length === 0 ? ' library-empty' : ''}`}>
                {catalogLoading && <div className="empty-library">Loading images...</div>}
                {catalogError && <div className="empty-library" role="alert">Remote catalog unavailable: {catalogError}</div>}
                {visible.map(image => {
                    const isSelected = selectedSet.has(image.id);
                    const d = dimensions[image.id];
                    const width = image.width ?? d?.width;
                    const height = image.height ?? d?.height;
                    return <article key={image.id} className={`image-card ${isSelected ? 'selected' : ''}`}>
                        <button className="image-thumb" type="button" onClick={() => toggleImage(image.id)}
                            aria-pressed={isSelected} aria-label={`${isSelected ? 'Deselect' : 'Select'} ${image.filename}`}>
                            <img src={image.src} alt={image.productName ?? image.filename} loading="lazy"
                                onLoad={event => rememberDimensions(image.id, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)} />
                            <span className="selection-mark" aria-hidden="true">{isSelected ? '✓' : ''}</span>
                            <span className="source-mark">{image.source === 'local' ? 'Local' : image.source === 'allegro' ? 'Allegro' : 'Catalog'}</span>
                        </button>
                        <div className="image-footer">
                            <div className="image-footer-title" title={image.filename}>{image.filename}</div>
                            <div className="image-footer-meta" title={image.productName}>
                                {image.productName ?? 'Local upload'} · {width && height ? `${width}×${height}` : 'Resolution loading'}
                            </div>
                            <div className="card-actions">
                                <button type="button" onClick={() => setDetailId(image.id)}>Details</button>
                                <button type="button" onClick={() => openEditor(image.id)}>Edit →</button>
                                <button type="button" className="remove-local"
                                    title="Remove from WaterM only"
                                    aria-label={`Delete ${image.filename} from WaterM`}
                                    onClick={() => deleteImage(image)}>Delete</button>
                            </div>
                        </div>
                    </article>;
                })}
                {!catalogLoading && visible.length === 0 && <div className="empty-library dropzone">
                    <div className="drop-icon">▧</div>
                    <strong>{images.length ? 'No images match these filters' : 'Your image library is empty'}</strong>
                    <p>{images.length ? 'Reset filters or try another search. Resolution is known only for loaded thumbnails until the backend supplies metadata.' : 'Upload photos or connect an Allegro seller account.'}</p>
                    <div className="empty-actions">
                        <button className="btn btn-primary" onClick={() => fileInput.current?.click()}>Choose images</button>
                        <button className="btn btn-secondary" onClick={images.length ? resetFilters : () => setPage('integrations')}>{images.length ? 'Reset filters' : 'Connect store →'}</button>
                    </div>
                </div>}
            </div>

            {detailImage && <div role="presentation" style={{ position: 'fixed', inset: 0, zIndex: 40, background: '#05070dbb' }} onClick={() => setDetailId(null)}>
                <aside role="dialog" aria-modal="true" aria-labelledby="image-details-title"
                    onClick={event => event.stopPropagation()}
                    style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 'min(440px, 100vw)', overflowY: 'auto', background: '#151d2b', borderLeft: '1px solid #354157', padding: 24, boxSizing: 'border-box', boxShadow: '-20px 0 65px #0008' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                        <h2 id="image-details-title" style={{ fontSize: 19 }}>Image Details</h2>
                        <button className="btn btn-secondary" onClick={() => setDetailId(null)} aria-label="Close image details">✕</button>
                    </div>
                    <div style={{ background: '#242e3e', borderRadius: 12, minHeight: 210, margin: '20px 0', padding: 12, display: 'grid', placeItems: 'center' }}>
                        <img src={detailImage.src} alt={detailImage.productName ?? detailImage.filename}
                            onLoad={event => rememberDimensions(detailImage.id, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
                            style={{ maxWidth: '100%', maxHeight: 280, objectFit: 'contain' }} />
                    </div>
                    <div style={{ display: 'grid', gap: 12, fontSize: 13 }}>
                        {([
                            ['Filename', detailImage.filename],
                            ['Product', detailImage.productName ?? '—'],
                            ['Source', detailImage.source === 'allegro' ? 'Allegro' : detailImage.source === 'local' ? 'Local upload' : 'Catalog'],
                            ['Allegro Offer ID', getOfferId(detailImage) ?? '—'],
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
                            <div key={label} style={{ display: 'grid', gridTemplateColumns: '115px minmax(0,1fr)', gap: 12, borderBottom: '1px solid #2d3748', paddingBottom: 10 }}>
                                <span style={{ color: '#94a3b8' }}>{label}</span>
                                <span style={{ overflowWrap: 'anywhere' }}>{value}</span>
                            </div>)}
                    </div>
                    <div style={{ display: 'grid', gap: 9, marginTop: 22 }}>
                        <button className="btn btn-primary" onClick={() => { openEditor(detailImage.id); setDetailId(null); }}>Edit this image →</button>
                        <button className="btn btn-secondary" onClick={() => selectImages(detailGroup.map(item => item.id))}>Select all {detailGroup.length} photos of this product</button>
                        <button className="btn btn-secondary" onClick={() => deselectImages(detailGroup.map(item => item.id))}>Deselect product photos</button>
                        <button className="btn btn-secondary" style={{ color: '#f0a4ad', borderColor: '#794756' }}
                            onClick={() => deleteImage(detailImage)}>Delete from WaterM</button>
                    </div>
                    <p style={{ fontSize: 11, color: '#9aa7bc', marginTop: 18 }}>Allegro file size may be unavailable until the backend provides it. Offer ID is inferred from the current filename when not supplied directly.</p>
                </aside>
            </div>}
        </div>
    );
}
