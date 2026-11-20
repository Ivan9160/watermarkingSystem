import type {
    FootprintMasterSource, ProductImage, WatermarkVerificationResponse,
} from '../types';

export type Mode = 'standard' | 'overlay';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const POLL_MS = 1500;
export const MAX_POLL_ATTEMPTS = 400;

export const MASTER_SOURCE_LABEL: Record<FootprintMasterSource, string> = {
    uploaded: 'Uploaded by you',
    stored: 'Stored result of our batch',
    generated: 'Generated from the original',
};

export function getLibraryVerificationId(image: ProductImage): string | null {
    if (image.id.startsWith('allegro-') || image.id.startsWith('local-server-')) {
        return image.id;
    }

    if (image.source === 'local' && image.sourceRef) {
        const match = /^waterm-local:([a-f0-9]{32}\.(?:jpg|png|webp))$/i.exec(image.sourceRef);
        if (match?.[1]) return `local-server-${match[1]}`;
    }

    return null;
}

export function validateFile(file: File): string | null {
    if (!ALLOWED_TYPES.has(file.type)) return 'Choose a JPG, PNG or WebP image.';
    if (file.size === 0) return 'The selected file is empty.';
    if (file.size > MAX_FILE_BYTES) return 'The image exceeds the 10 MB limit.';
    return null;
}

export function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function getErrorMessage(cause: unknown, fallback: string): string {
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

export function getVerificationCopy(result: WatermarkVerificationResponse) {
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
