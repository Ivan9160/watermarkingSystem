import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request } from 'express';

import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { AllegroAuthGuard } from '../allegro-auth/allegro-auth.guard.ts';
import { SESSION_COOKIE } from '../allegro-auth/session/auth.constants.ts';
import { getCookie } from '../allegro-auth/session/cookie.util.ts';

import { WatermarkVerificationService } from './watermark-verification.service.ts';
import { VerifyWatermarkRequestDto } from './dto/verify-watermark.request.dto.ts';
import { VerifyWatermarkResponseDto } from './dto/verify-watermark.response.dto.ts';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

interface AuthenticatedRequest extends Request {
  allegroUser: {
    id: number;
    token: string;
  };
}

interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

@Controller('watermarks')
@UseGuards(AllegroAuthGuard)
@ApiTags('Watermarks')
@ApiCookieAuth()
export class WatermarksController {
  constructor(
    private readonly verification: WatermarkVerificationService,
  ) {}

  @Post('verify/upload')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: {
        files: 1,
        fileSize: MAX_IMAGE_BYTES,
      },
      fileFilter: (_request, file, callback) => {
        if (!ALLOWED_MIME_TYPES.has(file.mimetype.toLowerCase())) {
          callback(
            new BadRequestException(
              'Only JPG, PNG and WebP images are supported.',
            ),
            false,
          );
          return;
        }

        callback(null, true);
      },
    }),
  )
  @ApiOperation({
    summary: 'Verify an uploaded image for an invisible PixelSeal watermark',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['image'],
      properties: {
        image: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiOkResponse({
    type: VerifyWatermarkResponseDto,
    description: 'The image verification result.',
  })
  @ApiBadRequestResponse({
    description: 'Missing image or unsupported image format.',
  })
  @ApiUnauthorizedResponse({
    description: 'Allegro session is missing or invalid.',
  })
  async verifyUpload(
    @Req() request: AuthenticatedRequest,
    @UploadedFile() file: UploadedImage | undefined,
  ): Promise<VerifyWatermarkResponseDto> {
    if (!file || !file.buffer || file.size === 0) {
      throw new BadRequestException('Image file is required.');
    }

    return this.verification.verifyUploadedImage({
      buffer: file.buffer,
      mimetype: file.mimetype,
      allegroUserId: request.allegroUser.id
    });
  }

  @Post('verify/library')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify an image selected from the WaterM Image Library',
    description:
      'Accepts the library image ID. Local uploads are resolved from the authenticated seller private storage; Allegro images are resolved from the authenticated Allegro library session.',
  })
  @ApiBody({ type: VerifyWatermarkRequestDto })
  @ApiOkResponse({
    type: VerifyWatermarkResponseDto,
    description: 'The image verification result.',
  })
  @ApiBadRequestResponse({
    description: 'Invalid image ID.',
  })
  @ApiUnauthorizedResponse({
    description: 'Allegro session is missing or invalid.',
  })
  async verifyLibraryImage(
    @Req() request: AuthenticatedRequest,
    @Body() body: VerifyWatermarkRequestDto,
  ): Promise<VerifyWatermarkResponseDto> {
    const imageId = body?.imageId;

    if (
      typeof imageId !== 'string' ||
      imageId.trim().length === 0 ||
      imageId.length > 200
    ) {
      throw new BadRequestException(
        'imageId must be a non-empty string of at most 200 characters.',
      );
    }

    const sessionId = getCookie(
      request,
      SESSION_COOKIE,
    );

    if (!sessionId) {
      throw new BadRequestException(
        'Allegro session cookie is missing.',
      );
    }

    return this.verification.verifyLibraryImage({
      imageId,
      allegroUserId: request.allegroUser.id,
      allegroSessionId: sessionId,
    });
  }
}
