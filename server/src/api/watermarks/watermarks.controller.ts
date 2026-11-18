import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
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

import {
  WatermarkVerificationService,
  type FootprintJobView,
  type FootprintUpload,
} from './watermark-verification.service.ts';
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

interface FootprintFiles {
  original?: FootprintUpload[];
  suspect?: FootprintUpload[];
  master?: FootprintUpload[];
}

interface FootprintBody {
  nulls?: string;
  threshold?: string;
}

function parseNulls(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 2 || parsed > 30) {
    throw new BadRequestException(
      'nulls must be an integer between 2 and 30.',
    );
  }

  return parsed;
}

function parseThreshold(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100) {
    throw new BadRequestException(
      'threshold must be a number between 0 and 100.',
    );
  }

  return parsed;
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

  @Post('footprint/check')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'original', maxCount: 1 },
        { name: 'suspect', maxCount: 1 },
        { name: 'master', maxCount: 1 },
      ],
      {
        storage: memoryStorage(),
        limits: {
          files: 3,
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
      },
    ),
  )
  @ApiOperation({
    summary: 'Start an overlay check for our invisible watermark',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['original', 'suspect'],
      properties: {
        original: { type: 'string', format: 'binary' },
        suspect: { type: 'string', format: 'binary' },
        master: { type: 'string', format: 'binary' },
        nulls: { type: 'integer', minimum: 2, maximum: 30 },
        threshold: { type: 'number' },
      },
    },
  })
  @ApiOkResponse({ description: 'The overlay check job was created.' })
  @ApiBadRequestResponse({
    description: 'Missing image or unsupported image format.',
  })
  @ApiUnauthorizedResponse({
    description: 'Allegro session is missing or invalid.',
  })
  async startFootprintCheck(
    @Req() request: AuthenticatedRequest,
    @UploadedFiles() files: FootprintFiles | undefined,
    @Body() body: FootprintBody | undefined,
  ): Promise<{ jobId: string }> {
    return this.verification.startFootprintCheck({
      allegroUserId: request.allegroUser.id,
      original: files?.original?.[0],
      suspect: files?.suspect?.[0],
      master: files?.master?.[0],
      nulls: parseNulls(body?.nulls),
      threshold: parseThreshold(body?.threshold),
    });
  }

  @Get('footprint/check/:jobId')
  @ApiOperation({ summary: 'Get the status and result of an overlay check' })
  @ApiOkResponse({ description: 'The overlay check job.' })
  @ApiUnauthorizedResponse({
    description: 'Allegro session is missing or invalid.',
  })
  getFootprintJob(
    @Req() request: AuthenticatedRequest,
    @Param('jobId') jobId: string,
  ): FootprintJobView {
    if (typeof jobId !== 'string' || jobId.length === 0 || jobId.length > 100) {
      throw new BadRequestException('Invalid job ID.');
    }

    return this.verification.getFootprintJob(jobId, request.allegroUser.id);
  }
}