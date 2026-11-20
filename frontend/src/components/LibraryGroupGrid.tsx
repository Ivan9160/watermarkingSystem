import type { ProductImage } from '../types';
import { LibraryGroupCheckbox } from './LibraryGroupCheckbox';
import {
    COLLAPSED_THUMBS,
    sourceLabel,
    type Dimensions,
    type ImageGroup,
    type LibraryViewMode,
} from '../utils/libraryHelpers';

interface LibraryGroupGridProps {
    groups: ImageGroup[];
    selectedSet: Set<string>;
    viewMode: LibraryViewMode;
    collapsedGroups: Set<string>;
    dimensions: Record<string, Dimensions>;
    toggleGroupSelection: (group: ImageGroup) => void;
    toggleGroupCollapsed: (key: string) => void;
    watermarkGroup: (group: ImageGroup) => void;
    deleteGroup: (group: ImageGroup) => Promise<void>;
    toggleImage: (id: string) => void;
    rememberDimensions: (id: string, width: number, height: number) => void;
    setDetailId: (id: string) => void;
    openEditor: (id: string) => void;
    deleteImage: (image: ProductImage) => Promise<void>;
}

export function LibraryGroupGrid({
    groups, selectedSet, viewMode, collapsedGroups, dimensions,
    toggleGroupSelection, toggleGroupCollapsed, watermarkGroup, deleteGroup,
    toggleImage, rememberDimensions, setDetailId, openEditor, deleteImage,
}: LibraryGroupGridProps) {
    return (
        <>
            {groups.map(group => {
                const selectedCount = group.images.filter(
                    image => selectedSet.has(image.id)
                ).length;
                const allSelected = selectedCount === group.images.length;
                const isCollapsed = viewMode === 'products' && collapsedGroups.has(group.key);
                const classes = [
                    'library-product-group',
                    viewMode === 'photos' ? 'library-product-group--flat' : 'library-product-group--products',
                    isCollapsed ? 'library-product-group--collapsed' : '',
                    selectedCount > 0 ? 'library-product-group--active' : '',
                ].filter(Boolean).join(' ');
                return (
                    <section key={group.key} className={classes}>
                        {viewMode === 'products' && <header className="library-product-group__header">
                            <div className="library-product-group__controls">
                                <LibraryGroupCheckbox
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
                                    title="Remove this product's photos from WatermarkOS only"
                                    onClick={() => deleteGroup(group)}>
                                    Delete group
                                </button>
                            </div>
                        </header>}
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
                                                        title="Remove from WatermarkOS only"
                                                        aria-label={`Delete ${image.filename} from WatermarkOS`}
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
        </>
    );
}
