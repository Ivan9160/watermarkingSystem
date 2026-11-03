import {
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { AllegroAuthGuard } from '../allegro-auth/allegro-auth.guard.ts';
import { ResultsService } from './results.service.ts';

interface AllegroAuthenticatedRequest extends Request {
  allegroUser: { id: number; token: string };
}

@ApiTags('Results')
@Controller('batches')
@UseGuards(AllegroAuthGuard)
@ApiCookieAuth()
export class ResultsController {
  constructor(private readonly results: ResultsService) {}

  @Get(':id/results')
  @ApiOperation({ summary: 'Per-image results with short-lived download URLs' })
  @ApiOkResponse({ description: 'Batch results.' })
  @ApiNotFoundResponse({ description: 'Batch not found for this seller.' })
  @ApiUnauthorizedResponse({ description: 'Invalid session.' })
  get(@Req() req: AllegroAuthenticatedRequest, @Param('id') id: string) {
    return this.results.getResults(req.allegroUser.id, id);
  }

  @Post(':id/results/:imageId/apply')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Replace the original image on the Allegro offer with the processed one',
  })
  @ApiOkResponse({ description: 'Image replaced on the offer.' })
  @ApiNotFoundResponse({ description: 'Batch or image not found for this seller.' })
  @ApiConflictResponse({ description: 'Image is not processed or index is out of range.' })
  @ApiUnauthorizedResponse({ description: 'Invalid session.' })
  apply(
    @Req() req: AllegroAuthenticatedRequest,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
  ) {
    return this.results.applyToAllegro(
      req.allegroUser.id,
      id,
      imageId,
      req.allegroUser.token,
    );
  }

  @Post(':id/results/apply')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Apply all processed images from batch to Allegro offers',
  })
  @ApiOkResponse({
    description: 'Processed images applied to Allegro offers.',
  })
  @ApiNotFoundResponse({
    description: 'Batch not found for this seller.',
  })
  @ApiConflictResponse({
    description: 'Batch is still processing or has no processed images.',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid session.',
  })
  applyBatch(
    @Req() req: AllegroAuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.results.applyBatchToAllegro(
      req.allegroUser.id,
      id,
      req.allegroUser.token,
    );
  }
  
}