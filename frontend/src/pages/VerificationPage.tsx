import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { PageHeading } from '../components/PageHeading';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import type { ProductImage, WatermarkVerificationResponse } from '../types';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function getLibraryVerificationId(image: ProductImage): string | null {
    if (image.id.startsWith('allegro-') || image.id.startsWith('local-server-')) {
        return image.id;
    }

    if (image.source === 'local' && image.sourceRef) {
        const match = /^waterm-local:([a-f0-9]{32}\.(?:jpg|png|webp))$/i.exec(image.sourceRef);
        if (match?.[1]) return `local-server-${match[1]}`;
    }

    return null;
}

const STATUS_COPY: Record<
    Exclude<WatermarkVerificationResponse['status'], 'verified'>,
    { title: string; description: string; label: string }
> = {
    unknown_organization: {
        title: 'Unknown organization',
        description: 'The watermark signature is valid, but its organization is not registered in WaterM.',
        label: 'UNKNOWN ORGANIZATION',
    },

    invalid_signature: {
        title: 'Invalid watermark signature',
        description: 'Watermark data was detected, but its HMAC signature did not pass verification.',
        label: 'INVALID SIGNATURE',
    },

    not_detected: {
        title: 'No watermark detected',
        description: 'No valid invisible watermark was detected in this image.',
        label: 'NOT DETECTED',
    },
};

function getVerificationCopy(result: WatermarkVerificationResponse) {
    if (result.status !== 'verified') {
        return STATUS_COPY[result.status];
    }

    if (result.ownership === 'own') {
        return {
            title: 'Your watermark verified',
            description: 'This image contains an authentic invisible watermark belonging to your organization.',
            label: 'YOUR ORGANIZATION',
        };
    }

    if (result.ownership === 'other') {
        return {
            title: 'Another organization detected',
            description: 'This image contains an authentic invisible watermark belonging to another organization.',
            label: 'OTHER ORGANIZATION',
        };
    }

    return {
        title: 'Watermark verified',
        description: 'The watermark is authentic, but its ownership could not be determined.',
        label: 'OWNERSHIP UNKNOWN',
    };
}

export function VerificationPage() {
    const { images, catalogLoading, catalogError, setPage } = useApp();
    const fileInput = useRef<HTMLInputElement>(null);
    const [selectedImageId, setSelectedImageId] = useState('');
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [filePreviewUrl, setFilePreviewUrl] = useState('');
    const [result, setResult] = useState<WatermarkVerificationResponse | null>(null);
    const [error, setError] = useState('');
    const [verifying, setVerifying] = useState(false);

    const libraryImages = images
    .filter(image => getLibraryVerificationId(image) !== null)
    .sort((a, b) =>
        a.filename.localeCompare(
            b.filename,
            undefined,
            {
                numeric: true,
                sensitivity: 'base',
            },
        ),
    );
    const selectedImage = libraryImages.find(image => image.id === selectedImageId);

    useEffect(() => {
        if (uploadedFile) return;

        if (selectedImageId && libraryImages.some(
            image => image.id === selectedImageId
        )) {
            return;
        }

        setSelectedImageId(libraryImages[0]?.id ?? '');
    }, [libraryImages, selectedImageId, uploadedFile]);

    useEffect(() => {
        if (!uploadedFile) {
            setFilePreviewUrl('');
            return;
        }

        const url = URL.createObjectURL(uploadedFile);
        setFilePreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [uploadedFile]);

    function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0] ?? null;
        event.target.value = '';
        setResult(null);
        setError('');

        if (!file) return;
        setUploadedFile(null);
        if (!ALLOWED_TYPES.has(file.type)) {
            setError('Choose a JPG, PNG or WebP image.');
            return;
        }
        if (file.size === 0) {
            setError('The selected file is empty.');
            return;
        }
        if (file.size > MAX_FILE_BYTES) {
            setError('The image exceeds the 10 MB limit.');
            return;
        }

        setUploadedFile(file);
        setSelectedImageId('');
    }

    function chooseLibraryImage(imageId: string) {
        setSelectedImageId(imageId);
        setUploadedFile(null);
        setResult(null);
        setError('');
    }

    async function verify() {
        setVerifying(true);
        setError('');
        setResult(null);

        try {
            const response = uploadedFile
                ? await api.verifyWatermarkUpload(uploadedFile)
                : selectedImage
                    ? await api.verifyWatermarkLibraryImage(getLibraryVerificationId(selectedImage)!)
                    : null;

            if (!response) {
                setError('Choose an image from the library or upload a file first.');
                return;
            }

            setResult(response);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not verify this image.');
        } finally {
            setVerifying(false);
        }
    }

    const previewSrc = uploadedFile ? filePreviewUrl : selectedImage?.src;
    const previewName = uploadedFile?.name ?? selectedImage?.filename;
    const canVerify = Boolean(uploadedFile || selectedImage) && !verifying;
    const verificationCopy = result
        ? getVerificationCopy(result)
        : null;

    const isOwnWatermark =
        result?.status === 'verified' &&
        result.ownership === 'own';

    return (
        <div className="page-shell verification-page">
            <PageHeading
                title="Watermark Verification"
                subtitle="Detect an invisible PixelSeal watermark and identify its organization"
                actions={<span className="page-pill page-pill-muted">PixelSeal</span>}
            />

            <div className="analysis-layout">
                <section className="panel image-review-panel">
                    <div className="panel-heading">
                        <h2>Image for verification</h2>
                        <span className="muted-label">{previewName ?? 'No image selected'}</span>
                    </div>

                    <div className="verification-source-controls">
                        <label className="form-field">
                            <span>Choose from Image Library</span>
                            <select
                                value={uploadedFile ? '' : selectedImageId}
                                onChange={event => chooseLibraryImage(event.target.value)}
                                disabled={catalogLoading || libraryImages.length === 0 || verifying}
                            >
                                <option value="">Select an image...</option>
                                {libraryImages.map(image => (
                                    <option key={image.id} value={image.id}>
                                        {image.filename} · {image.source === 'allegro' ? 'Allegro' : image.source === 'local' ? 'Local' : 'Catalog'}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <span className="verification-or">or</span>
                        <input
                            ref={fileInput}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            hidden
                            onChange={handleFileChange}
                        />
                        <button
                            className="btn btn-secondary"
                            type="button"
                            onClick={() => fileInput.current?.click()}
                            disabled={verifying}
                        >
                            Upload image from computer
                        </button>
                        {uploadedFile && (
                            <button
                                className="subtle-link"
                                type="button"
                                onClick={() => setUploadedFile(null)}
                                disabled={verifying}
                            >
                                Clear uploaded file
                            </button>
                        )}
                        {catalogError && <span className="verification-source-error">Library: {catalogError}</span>}
                        {catalogLoading && <span className="muted-label">Loading library...</span>}
                        {!catalogLoading && libraryImages.length === 0 && (
                            <span className="muted-label">No verifiable images in the library. Upload an image or connect Allegro.</span>
                        )}
                    </div>

                    <div className="review-image-area">
                        {previewSrc ? (
                            <img src={previewSrc} alt={previewName ? `Verify ${previewName}` : 'Image for verification'} />
                        ) : (
                            <p>Choose an image from the library or upload one from your computer.</p>
                        )}
                    </div>
                    <div className="panel-footer">
                        <span>{uploadedFile ? 'Uploaded file · not saved to the library' : selectedImage ? `Library image · ${selectedImage.source ?? 'catalog'}` : 'No image selected'}</span>
                        <button className="subtle-link" type="button" onClick={() => setPage('library')}>
                            Open Image Library →
                        </button>
                    </div>
                </section>

                <section className="panel analysis-controls verification-controls">
                    <div className="panel-heading">
                        <h2>Detection</h2>
                        <span className="muted-label">PIXELSEAL</span>
                    </div>
                    <div className="analysis-illustration"><span>◎</span></div>
                    <h3>Verify ownership</h3>
                    <p>PixelSeal checks the invisible watermark signature. WaterM then looks up the organization associated with the decoded ID.</p>

                    <button
                        className="btn btn-primary full-width"
                        type="button"
                        onClick={() => void verify()}
                        disabled={!canVerify}
                    >
                        {verifying ? 'Verifying image...' : 'Verify image →'}
                    </button>

                    {error && <div className="verification-error" role="alert">{error}</div>}

                    
                    {result && verificationCopy && (
                        <div
                            className={`verification-result verification-result--${
                                result.status === 'verified'
                                    ? result.ownership ?? 'verified'
                                    : result.status
                            }`}
                            role="status"
                            aria-live="polite"
                        >
                            <div className="verification-result-heading">
                                <strong>{verificationCopy.title}</strong>
                                <span>{verificationCopy.label}</span>
                            </div>

                            <p>{verificationCopy.description}</p>

                            {result.organization && (
                                <div className="verification-detail">
                                    <span>
                                        {result.ownership === 'own'
                                            ? 'Your organization'
                                            : 'Watermark owner'}
                                    </span>
                                    <strong>{result.organization.name}</strong>
                                </div>
                            )}

                            <div className="verification-detail">
                                <span>Image dimensions</span>
                                <strong>
                                    {result.image.width} × {result.image.height} px
                                </strong>
                            </div>

                            {isOwnWatermark && (
                                <div className="verification-technical-details">
                                    <h4>Technical details</h4>

                                    <div className="verification-detail">
                                        <span>Algorithm</span>
                                        <strong>Meta PixelSeal</strong>
                                    </div>

                                    {result.watermark && (
                                        <>
                                            <div className="verification-detail">
                                                <span>Invisible watermark ID</span>
                                                <code>{result.watermark.id}</code>
                                            </div>

                                            <div className="verification-detail">
                                                <span>HMAC bit distance</span>
                                                <strong>
                                                    {result.watermark.tagDistance ?? 'Not available'}
                                                </strong>
                                            </div>
                                        </>
                                    )}

                                    {result.verificationId && (
                                        <div className="verification-detail">
                                            <span>Verification ID</span>
                                            <code>{result.verificationId}</code>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}


                    <div className="info-note">
                        Supported formats: JPG, PNG and WebP. Maximum file size: 10 MB. Verification does not modify the source image.
                    </div>
                </section>
            </div>
        </div>
    );
}
