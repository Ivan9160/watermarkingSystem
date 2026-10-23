import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
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
  allegroUser: { id: number };
}

@ApiTags('Results')
@Controller('batches')
@UseGuards(AllegroAuthGuard)
@ApiBearerAuth('allegroAccessToken')
export class ResultsController {
  constructor(private readonly results: ResultsService) {}

  @Get(':id/results')
  @ApiOperation({ summary: 'Per-image results with short-lived download URLs' })
  @ApiOkResponse({ description: 'Batch results.' })
  @ApiNotFoundResponse({ description: 'Batch not found for this seller.' })
  @ApiUnauthorizedResponse({ description: 'Invalid Allegro access token.' })
  get(@Req() req: AllegroAuthenticatedRequest, @Param('id') id: string) {
    return this.results.getResults(req.allegroUser.id, id);
  }
}
