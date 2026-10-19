import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { PageHeading } from '../components/PageHeading';
import { useApp } from '../context/AppContext';

type Filter = 'all' | 'selected';

export function LibraryPage() {
    const { images, catalogLoading, catalogError, selectedIds, toggleImage, openEditor,
        setPage, selectAll, clearSelection, addLocalImages, removeLocalImage } = useApp();
    const fileInput = useRef<HTMLInputElement>(null);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<Filter>('all');
    const [sort, setSort] = useState<'asc' | 'desc'>('asc');
    const [importMessage, setImportMessage] = useState('');
    const [dragOver, setDragOver] = useState(false);

    function importFiles(files: File[]) {
        if (!files.length) return;
        const { imported, skipped } = addLocalImages(files);
        setImportMessage(`${imported} image${imported === 1 ? '' : 's'} added to this session${skipped ? ` · ${skipped} skipped (unsupported or >25 MB)` : ''}.`);
        setFilter('all');
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

    const visible = useMemo(() => images
        .filter(image => (image.filename + ' ' + (image.productName ?? '')).toLowerCase().includes(query.toLowerCase()))
        .filter(image => filter === 'all' || selectedIds.includes(image.id))
        .sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }) * (sort === 'asc' ? 1 : -1)),
    [images, query, filter, sort, selectedIds]);

    return <div className="page-shell" onDrop={handleDrop} onDragOver={event => { event.preventDefault(); setDragOver(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false); }}>
        <input ref={fileInput} type="file" hidden multiple accept="image/png,image/jpeg,image/webp" onChange={handleInput} aria-label="Choose product images" />
        <PageHeading title="Image Library" subtitle="Local photos and connected store images" actions={<>
            <button className="btn btn-secondary" onClick={() => fileInput.current?.click()}>＋ Upload images</button>
            <button className="btn btn-secondary" onClick={() => setPage('integrations')}>↗ Connect store</button>
            <button className="btn btn-primary" onClick={() => setPage('batch')}>Batch preview <span>→</span></button>
        </>} />
        <div className="library-toolbar">
            <div className="library-metrics"><span className="counter">{images.length} images</span><span className="counter counter-accent">{selectedIds.length} selected</span></div>
            <div className="library-controls">
                <div className="search-input"><span>⌕</span><input aria-label="Search images" placeholder="Search images..." value={query} onChange={event => setQuery(event.target.value)} /></div>
                <select aria-label="Filter images" value={filter} onChange={event => setFilter(event.target.value as Filter)}><option value="all">All images</option><option value="selected">Selected only</option></select>
                <select aria-label="Sort images" value={sort} onChange={event => setSort(event.target.value as 'asc' | 'desc')}><option value="asc">Name A–Z</option><option value="desc">Name Z–A</option></select>
            </div>
        </div>
        <div className="library-selection-row"><span>PNG, JPG, WebP · local files stay in this browser session</span><div><button className="subtle-link" onClick={selectAll}>Select all</button><span>·</span><button className="subtle-link" onClick={clearSelection}>Clear</button></div></div>
        {importMessage && <p className="upload-feedback" role="status">{importMessage}</p>}
        <div className={`library-grid scrollable-content${dragOver ? ' library-drag-active' : ''}`}>
            {catalogLoading && <div className="empty-library">Loading images from backend...</div>}
            {catalogError && <div className="empty-library" role="alert">Remote catalog unavailable: {catalogError}</div>}
            {visible.map(image => {
                const isSelected = selectedIds.includes(image.id);
                return <article key={image.id} className={`image-card ${isSelected ? 'selected' : ''}`}>
                    <button className="image-thumb" type="button" onClick={() => toggleImage(image.id)} aria-pressed={isSelected} aria-label={`${isSelected ? 'Deselect' : 'Select'} ${image.filename}`}>
                        <img src={image.src} alt={`Product ${image.filename}`} loading="lazy" />
                        <span className="selection-mark" aria-hidden="true">{isSelected ? '✓' : ''}</span>
                        <span className="source-mark">{image.source === 'local' ? 'Local' : image.source === 'allegro' ? 'Allegro' : 'Catalog'}</span>
                    </button>
                    <div className="image-footer"><span title={image.filename}>{image.filename}</span>
                        <div className="card-actions"><button type="button" onClick={() => openEditor(image.id)}>Edit →</button>
                        {image.source === 'local' && <button className="remove-local" title="Remove from this session" aria-label={`Remove ${image.filename}`} onClick={() => removeLocalImage(image.id)}>×</button>}</div>
                    </div>
                </article>;
            })}
            {!catalogLoading && visible.length === 0 && <div className="empty-library dropzone">
                <div className="drop-icon">▧</div>
                <strong>{images.length ? 'No matching images' : 'Your image library is empty'}</strong>
                <p>{images.length ? 'Try a different filter or search.' : 'Add product images from your computer or connect an Allegro seller account.'}</p>
                <div className="empty-actions"><button className="btn btn-primary" onClick={() => fileInput.current?.click()}>Choose images</button><button className="btn btn-secondary" onClick={() => setPage('integrations')}>Connect store →</button></div>
                <small>You can also drag photos here · Up to 25 MB per image</small>
            </div>}
        </div>
    </div>;
}
