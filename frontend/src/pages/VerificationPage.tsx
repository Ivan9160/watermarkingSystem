import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { PageHeading } from '../components/PageHeading';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import type {
    FootprintCheckResult,
    FootprintMasterSource,
    ProductImage,
    WatermarkVerificationResponse,
} from '../types';

type Mode = 'standard' | 'overlay';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const POLL_MS = 1500;
const MAX_POLL_ATTEMPTS = 400;

const MASTER_SOURCE_LABEL: Record<FootprintMasterSource, string> = {
    uploaded: 'Uploaded by you',
    stored: 'Stored result of our batch',
    generated: 'Generated from the original',
};

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

function validateFile(file: File): string | null {
    if (!ALLOWED_TYPES.has(file.type)) return 'Choose a JPG, PNG or WebP image.';
    if (file.size === 0) return 'The selected file is empty.';
    if (file.size > MAX_FILE_BYTES) return 'The image exceeds the 10 MB limit.';
    return null;
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getErrorMessage(cause: unknown, fallback: string): string {
    return cause instanceof Error ? cause.message : fallback;
}

const STATUS_COPY: Record<
    Exclude<WatermarkVerificationResponse['status'], 'verified'>,
    { title: string; description: string; label: string }
> = {
    unknown_organization: {
        title: 'Unknown organization',
        description: 'The watermark signature is valid, but its organization is not registered in WatermarkOS.',
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

interface FileSlotProps {
    label: string;
    hint: string;
    file: File | null;
    disabled: boolean;
    onSelect: (file: File | null) => void;
    onError: (message: string) => void;
}

function FileSlot({ label, hint, file, disabled, onSelect, onError }: FileSlotProps) {
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

export function VerificationPage() {
    const { images, catalogLoading, catalogError, setPage } = useApp();
    const fileInput = useRef<HTMLInputElement>(null);
    const mounted = useRef(true);

    const [mode, setMode] = useState<Mode>('standard');

    const [selectedImageId, setSelectedImageId] = useState('');
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [filePreviewUrl, setFilePreviewUrl] = useState('');
    const [result, setResult] = useState<WatermarkVerificationResponse | null>(null);
    const [error, setError] = useState('');
    const [verifying, setVerifying] = useState(false);

    const [originalFile, setOriginalFile] = useState<File | null>(null);
    const [suspectFile, setSuspectFile] = useState<File | null>(null);
    const [masterFile, setMasterFile] = useState<File | null>(null);
    const [autoMaster, setAutoMaster] = useState(true);
    const [overlayResult, setOverlayResult] = useState<FootprintCheckResult | null>(null);
    const [overlayError, setOverlayError] = useState('');
    const [overlayStatus, setOverlayStatus] = useState('');
    const [overlayRunning, setOverlayRunning] = useState(false);

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
        mounted.current = true;

        return () => {
            mounted.current = false;
        };
    }, []);

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

        const problem = validateFile(file);

        if (problem) {
            setError(problem);
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
            setError(getErrorMessage(cause, 'Could not verify this image.'));
        } finally {
            setVerifying(false);
        }
    }

    function resetOverlayOutput() {
        setOverlayResult(null);
        setOverlayError('');
        setOverlayStatus('');
    }

    function selectOriginal(file: File | null) {
        setOriginalFile(file);
        resetOverlayOutput();
    }

    function selectSuspect(file: File | null) {
        setSuspectFile(file);
        resetOverlayOutput();
    }

    function selectMaster(file: File | null) {
        setMasterFile(file);
        resetOverlayOutput();
    }

    function toggleAutoMaster(value: boolean) {
        setAutoMaster(value);

        if (value) setMasterFile(null);

        resetOverlayOutput();
    }

    async function runOverlayCheck() {
        if (!originalFile || !suspectFile) return;

        if (!autoMaster && !masterFile) {
            setOverlayError('Upload the image with our watermark or enable automatic generation.');
            return;
        }

        setOverlayRunning(true);
        resetOverlayOutput();

        try {
            const form = new FormData();

            form.append('original', originalFile);
            form.append('suspect', suspectFile);

            if (!autoMaster && masterFile) {
                form.append('master', masterFile);
            }

            const created = await api.startFootprintCheck(form);

            for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
                await delay(POLL_MS);

                if (!mounted.current) return;

                const job = await api.getFootprintJob(created.jobId);

                if (!mounted.current) return;

                setOverlayStatus(job.status);

                if (job.status === 'FAILED') {
                    throw new Error(job.error ?? 'The overlay check failed.');
                }

                if (job.status === 'COMPLETED') {
                    if (!job.result) {
                        throw new Error('The check finished without a result.');
                    }

                    setOverlayResult(job.result);
                    return;
                }
            }

            throw new Error('The overlay check timed out. Try again later.');
        } catch (cause) {
            if (mounted.current) {
                setOverlayError(getErrorMessage(cause, 'Could not run the overlay check.'));
            }
        } finally {
            if (mounted.current) {
                setOverlayRunning(false);
            }
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

    const canRunOverlay = Boolean(
        originalFile &&
        suspectFile &&
        (autoMaster || masterFile) &&
        !overlayRunning,
    );

    return (
        <div className="page-shell verification-page">
            <PageHeading
                title="Watermark Verification"
                subtitle={
                    mode === 'standard'
                        ? 'Detect an invisible PixelSeal watermark and identify its organization'
                        : 'Check whether our watermark survives under another watermark'
                }
                actions={<span className="page-pill page-pill-muted">PixelSeal</span>}
            />

            <div className="page-actions" style={{ marginBottom: 16 }}>
                <button
                    type="button"
                    className={mode === 'standard' ? 'btn btn-primary' : 'btn btn-secondary'}
                    onClick={() => setMode('standard')}
                    disabled={verifying || overlayRunning}
                >
                    Standard verification
                </button>

                <button
                    type="button"
                    className={mode === 'overlay' ? 'btn btn-primary' : 'btn btn-secondary'}
                    onClick={() => setMode('overlay')}
                    disabled={verifying || overlayRunning}
                >
                    Overlay check
                </button>
            </div>

            {mode === 'standard' && (
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

                        <div className={`review-image-area${verifying ? ' wm-scanning' : ''}`}>
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
                        <p>PixelSeal checks the invisible watermark signature. WatermarkOS then looks up the organization associated with the decoded ID.</p>

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
            )}

            {mode === 'overlay' && (
                <div className={`analysis-layout${overlayRunning ? ' wm-overlay-scanning' : ''}`}>
                        <section className="panel image-review-panel">
                            <div className="panel-heading">
                                <h2>Images for overlay check</h2>
                            <span className="muted-label">
                                {autoMaster ? '2 images' : '3 images'}
                            </span>
                        </div>

                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: autoMaster
                                    ? 'repeat(2, minmax(0, 1fr))'
                                    : 'repeat(3, minmax(0, 1fr))',
                                gap: 16,
                                padding: 16,
                            }}
                        >
                            <FileSlot
                                label="Original image"
                                hint="The picture before our watermark was added."
                                file={originalFile}
                                disabled={overlayRunning}
                                onSelect={selectOriginal}
                                onError={setOverlayError}
                            />

                            {!autoMaster && (
                                <FileSlot
                                    label="Image with our watermark"
                                    hint="The exact file we published."
                                    file={masterFile}
                                    disabled={overlayRunning}
                                    onSelect={selectMaster}
                                    onError={setOverlayError}
                                />
                            )}

                            <FileSlot
                                label="Suspect image"
                                hint="The image where another watermark may have been added on top."
                                file={suspectFile}
                                disabled={overlayRunning}
                                onSelect={selectSuspect}
                                onError={setOverlayError}
                            />
                        </div>

                        <div className="panel-footer">
                            <span>Uploaded files are used for this check only and are not saved to the library</span>
                            <button className="subtle-link" type="button" onClick={() => setPage('library')}>
                                Open Image Library →
                            </button>
                        </div>
                    </section>

                    <section className="panel analysis-controls verification-controls">
                        <div className="panel-heading">
                            <h2>Overlay detection</h2>
                            <span className="muted-label">PIXELSEAL</span>
                        </div>
                        <div className="analysis-illustration"><span>◎</span></div>
                        <h3>Is our watermark still inside?</h3>
                        <p>
                            The suspect image is compared with the original. PixelSeal then measures how much of our
                            watermark difference remains, relative to what other random messages would show.
                        </p>

                        <label
                            style={{
                                display: 'flex',
                                gap: 8,
                                alignItems: 'center',
                                margin: '12px 0',
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={autoMaster}
                                onChange={event => toggleAutoMaster(event.target.checked)}
                                disabled={overlayRunning}
                            />
                            <span>Generate the image with our watermark automatically</span>
                        </label>

                        <button
                            className="btn btn-primary full-width"
                            type="button"
                            onClick={() => void runOverlayCheck()}
                            disabled={!canRunOverlay}
                        >
                            {overlayRunning
                                ? `Checking${overlayStatus ? ` · ${overlayStatus}` : '...'}`
                                : 'Run overlay check →'}
                        </button>

                        {overlayError && (
                            <div className="verification-error" role="alert">
                                {overlayError}
                            </div>
                        )}

                        {overlayResult && (
                            <div
                                className={`verification-result verification-result--${
                                    overlayResult.present ? 'own' : 'not_detected'
                                }`}
                                role="status"
                                aria-live="polite"
                            >
                                <div className="verification-result-heading">
                                    <strong>
                                        {overlayResult.present
                                            ? 'Our watermark is still present'
                                            : 'Our watermark was not shown'}
                                    </strong>
                                    <span>
                                        {overlayResult.present ? 'PRESENT' : 'NOT SHOWN'}
                                    </span>
                                </div>

                                {overlayResult.warning && (
                                    <p>{overlayResult.warning}</p>
                                )}

                                <div className="verification-detail">
                                    <span>Retention (a)</span>
                                    <strong>{overlayResult.retention.toFixed(3)}</strong>
                                </div>

                                <div className="verification-detail">
                                    <span>z-score</span>
                                    <strong>{overlayResult.z.toFixed(2)}</strong>
                                </div>

                                <div className="verification-detail">
                                    <span>Threshold</span>
                                    <strong>{overlayResult.threshold.toFixed(1)}</strong>
                                </div>

                                <div className="verification-detail">
                                    <span>Null messages</span>
                                    <strong>{overlayResult.nulls}</strong>
                                </div>

                                <div className="verification-detail">
                                    <span>Suspect alignment</span>
                                    <strong>
                                        {overlayResult.aligned
                                            ? 'Aligned to the original first'
                                            : 'Same size as the original'}
                                    </strong>
                                </div>

                                <div className="verification-detail">
                                    <span>Our watermarked image</span>
                                    <strong>{MASTER_SOURCE_LABEL[overlayResult.masterSource]}</strong>
                                </div>
                            </div>
                        )}

                        <div className="info-note">
                            Supported formats: JPG, PNG and WebP. Maximum file size: 10 MB per image. The original must be
                            the exact file that was watermarked. The threshold is not universal and should be calibrated
                            on control images.
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
}