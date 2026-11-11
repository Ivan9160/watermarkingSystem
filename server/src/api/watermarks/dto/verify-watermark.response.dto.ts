
import {
    ApiProperty,
    ApiPropertyOptional,
} from '@nestjs/swagger';

export type WatermarkVerificationStatus =
    | 'verified'
    | 'unknown_organization'
    | 'invalid_signature'
    | 'not_detected';

export type WatermarkOwnership = 'own' | 'other' | null;

export class VerifiedOrganizationDto {
    @ApiProperty({
        example: 'My Allegro Shop',
    })
    name!: string;
}

export class DetectedWatermarkDto {
    @ApiProperty({
        example: 'a83f12c09b',
        description: 'Decoded 40-bit organization watermark ID.',
    })
    id!: string;

    @ApiProperty({
        nullable: true,
        example: 1,
        description: 'HMAC bit distance returned by PixelSeal.',
    })
    tagDistance!: number | null;
}

export class VerifiedImageMetadataDto {
    @ApiProperty({ example: 1920 })
    width!: number;

    @ApiProperty({ example: 1080 })
    height!: number;
}

export class VerifyWatermarkResponseDto {
    @ApiProperty({
        enum: [
            'verified',
            'unknown_organization',
            'invalid_signature',
            'not_detected',
        ],
        example: 'verified',
    })
    status!: WatermarkVerificationStatus;

    @ApiProperty({ example: true })
    found!: boolean;

    @ApiProperty({
        type: VerifiedOrganizationDto,
        nullable: true,
    })
    organization!: VerifiedOrganizationDto | null;

    @ApiProperty({
        enum: ['own', 'other'],
        nullable: true,
        example: 'own',
        description: 'Whether the watermark belongs to the current organization.',
    })
    ownership!: WatermarkOwnership;

    @ApiPropertyOptional({
        type: DetectedWatermarkDto,
        nullable: true,
        description: 'Returned only when the watermark belongs to the current organization.',
    })
    watermark?: DetectedWatermarkDto | null;

    @ApiProperty({ type: VerifiedImageMetadataDto })
    image!: VerifiedImageMetadataDto;

    @ApiPropertyOptional({
        example: '3b30d4b0-fd4c-4fba-93ae-b8fcbd2a4d53',
        description: 'PixelSeal verification job ID. Returned only to the owning organization.',
    })
    verificationId?: string;
}
