import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { validateFile } from '../utils/verificationHelpers';

interface FileSlotProps {
    label: string;
    hint: string;
    file: File | null;
    disabled: boolean;
    onSelect: (file: File | null) => void;
    onError: (message: string) => void;
}

export function FileSlot({ label, hint, file, disabled, onSelect, onError }: FileSlotProps) {
    const input = useRef<HTMLInputElement>(null);
    const [previewUrl, setPreviewUrl] = useState('');

    useEffect(() => {
        if (!file) {
            setPreviewUrl('');
            return;
        }

        const url = URL.createObjectURL(file);
        setPreviewUrl(url);

        return () => URL.revokeObjectURL(url);
    }, [file]);

    function handleChange(event: ChangeEvent<HTMLInputElement>) {
        const picked = event.target.files?.[0] ?? null;
        event.target.value = '';

        if (!picked) return;

        const problem = validateFile(picked);

        if (problem) {
            onError(problem);
            return;
        }

        onError('');
        onSelect(picked);
    }

    return (
        <div className="form-field">
            <span>{label}</span>

            <div
                className="review-image-area"
                style={{ minHeight: 180, marginBottom: 8 }}
            >
                {previewUrl ? (
                    <img src={previewUrl} alt={label} />
                ) : (
                    <p>{hint}</p>
                )}
            </div>

            <input
                ref={input}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={handleChange}
            />

            <div className="page-actions">
                <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => input.current?.click()}
                    disabled={disabled}
                >
                    {file ? 'Replace image' : 'Upload image'}
                </button>

                {file && (
                    <button
                        className="subtle-link"
                        type="button"
                        onClick={() => onSelect(null)}
                        disabled={disabled}
                    >
                        Clear
                    </button>
                )}
            </div>

            {file && <span className="muted-label">{file.name}</span>}
        </div>
    );
}
