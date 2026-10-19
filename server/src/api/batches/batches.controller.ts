import {
  Body,
  Controller,
  Post,
  UseGuards,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiBody,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { BatchesService } from './batches.service.ts';
import { CreateBatchDto } from './dto/create-batch.dto.ts';
import { AllegroAuthGuard } from '../auth/allegro-auth.guard.ts';

interface AllegroAuthenticatedRequest extends Request {
  allegroUser: {
    id: number;
  };
}

@ApiTags('Batches')
@Controller('batches')
export class BatchesController {
  constructor(
    private readonly batchesService: BatchesService,
  ) {}

  @Post()
  @UseGuards(AllegroAuthGuard)
  @ApiBearerAuth('allegroAccessToken')
  @ApiOperation({
    summary: 'Create a batch',
    description:
      'Creates a new batch for the authenticated Allegro seller. ' +
      'The seller ID is extracted from the Allegro access token.',
  })
  @ApiBody({
    type: CreateBatchDto,
    description: 'Batch creation data.',
  })
  @ApiCreatedResponse({
    description: 'The batch was created successfully.',
  })
  @ApiBadRequestResponse({
    description: 'The request body is invalid.',
  })
  @ApiUnauthorizedResponse({
    description: 'The Allegro access token is missing or invalid.',
  })
  create(
    @Req() req: AllegroAuthenticatedRequest,
    @Body() dto: CreateBatchDto,
  ) {
    return this.batchesService.create(
      req.allegroUser.id,
      dto,
    );
  }
}