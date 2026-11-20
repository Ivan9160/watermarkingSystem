import { useEffect, useRef, useState } from 'react';
import type { ProductImage } from '../types';

interface EditorImagePickerProps {
    images: ProductImage[];
    activeImage: ProductImage | null | undefined;
    processing: boolean;
    openEditor: (id: string) => void;
}

export function EditorImagePicker({ images, activeImage, processing, openEditor }: EditorImagePickerProps) {
    const [imageMenuOpen, setImageMenuOpen] = useState(false);
    const imageMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (
                imageMenuRef.current &&
                !imageMenuRef.current.contains(event.target as Node)
            ) {
                setImageMenuOpen(false);
            }
        }

        function handleEscape(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                setImageMenuOpen(false);
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, []);

    return (
        <div className="editor-image-picker" ref={imageMenuRef}>
            <span className="muted-label">Image</span>

            <div className={`editor-dropdown ${imageMenuOpen ? 'is-open' : ''}`}>
                <button
                    type="button"
                    className="editor-dropdown-trigger"
                    aria-label="Choose image to edit"
                    aria-expanded={imageMenuOpen}
                    aria-controls="editor-image-options"
                    disabled={processing || images.length === 0}
                    onClick={() => setImageMenuOpen(prev => !prev)}
                >
                    <span className="editor-dropdown-value">
                        {activeImage?.filename ?? 'Choose image'}
                    </span>

                    <svg
                        className="editor-dropdown-arrow"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        width="16"
                        height="16"
                        aria-hidden="true"
                    >
                        <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>

                {imageMenuOpen && (
                    <div
                        id="editor-image-options"
                        className="editor-dropdown-menu"
                    >
                        {images.map(image => (
                            <button
                                key={image.id}
                                type="button"
                                className={`editor-dropdown-option ${activeImage?.id === image.id ? 'is-selected' : ''
                                    }`}
                                title={image.filename}
                                onClick={() => {
                                    openEditor(image.id);
                                    setImageMenuOpen(false);
                                }}
                            >
                                <span className="editor-dropdown-filename">
                                    {image.filename}
                                </span>

                                {activeImage?.id === image.id && (
                                    <span className="editor-dropdown-check">✓</span>
                                )}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
