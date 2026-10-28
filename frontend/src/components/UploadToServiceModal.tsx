import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../services/api';
import type { Page } from '../types';

// Registry for future publishing destinations. Add new providers here when
// their authenticated backend publish flows have been implemented.
type UploadProvider = {
    id: string;
    title: string;
    description: string;
    requiresAllegroConnection: boolean;
    enabled: boolean;
};

const UPLOAD_PROVIDERS: readonly UploadProvider[] = [
    {
        id: 'allegro',
        title: 'Allegro',
        description: 'Publish watermarked images back to your Allegro offers.',
        requiresAllegroConnection: true,
        enabled: false, // No publish endpoint exists yet. Never alter real offers here.
    },
];

interface Props {
    batchId: string;
    imageCount: number;
    onClose: () => void;
    onNavigate: (page: Page) => void;
}

export function UploadToServiceModal({ batchId, imageCount, onClose, onNavigate }: Props) {
    const [selected, setSelected] = useState<string>('allegro');
    const [connection, setConnection] = useState<'checking' | 'connected' | 'disconnected' | 'unavailable'>('checking');
    const closeRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        closeRef.current?.focus();
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    useEffect(() => {
        let alive = true;
        void api.getAllegroStatus()
            .then(result => { if (alive) setConnection(result.connected ? 'connected' : 'disconnected'); })
            .catch(() => { if (alive) setConnection('unavailable'); });
        return () => { alive = false; };
    }, []);

    const selectedProvider = UPLOAD_PROVIDERS.find(provider => provider.id === selected);

    return createPortal(
        <div className="upload-dialog-backdrop" onMouseDown={event => {
            if (event.target === event.currentTarget) onClose();
        }}>
            <section className="upload-dialog" role="dialog" aria-modal="true" aria-labelledby="upload-dialog-title"
                aria-describedby="upload-dialog-description">
                <div className="upload-dialog-head">
                    <div>
                        <h2 id="upload-dialog-title">Upload to service</h2>
                        <p id="upload-dialog-description">Choose a destination for your processed images.</p>
                    </div>
                    <button type="button" ref={closeRef} className="upload-dialog-close" aria-label="Close upload window"
                        onClick={onClose}>×</button>
                </div>
                <div className="upload-dialog-body">
                    <div className="upload-dialog-summary">
                        <strong>{imageCount} processed {imageCount === 1 ? 'image' : 'images'}</strong>
                        <span>Batch {batchId.slice(0, 10)}…</span>
                    </div>
                    <div className="upload-provider-list" role="radiogroup" aria-label="Destination service">
                        {UPLOAD_PROVIDERS.map(provider => (
                            <button type="button" key={provider.id} role="radio"
                                aria-checked={selected === provider.id}
                                className={`upload-provider-option${selected === provider.id ? ' is-selected' : ''}`}
                                onClick={() => setSelected(provider.id)}>
                                <span className="upload-provider-logo" aria-hidden="true">A</span>
                                <span className="upload-provider-info">
                                    <strong>{provider.title}</strong>
                                    <span>{provider.description}</span>
                                    {provider.requiresAllegroConnection && <em className={`upload-provider-state is-${connection}`}>
                                        {connection === 'checking' ? 'Checking connection…'
                                            : connection === 'connected' ? 'Account connected'
                                            : connection === 'disconnected' ? 'Account not connected'
                                            : 'Connection status unavailable'}
                                    </em>}
                                </span>
                                <span className="upload-provider-radio" aria-hidden="true" />
                            </button>
                        ))}
                    </div>
                    <div className="upload-dialog-notice">
                        <strong>Publishing is not implemented yet.</strong>
                        <p>The images are ready in RustFS. Uploading them to Allegro will require a separate backend endpoint that updates offer images through the Allegro API. No offers will be changed now.</p>
                    </div>
                </div>
                <div className="upload-dialog-footer">
                    <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                    {connection !== 'connected' && <button type="button" className="btn btn-secondary"
                        onClick={() => { onClose(); onNavigate('integrations'); }}>Allegro connection</button>}
                    <button type="button" className="btn btn-primary" disabled={!selectedProvider?.enabled}>
                        Upload to {selectedProvider?.title ?? 'service'} · Coming soon
                    </button>
                </div>
            </section>
        </div>,
        document.body,
    );
}
