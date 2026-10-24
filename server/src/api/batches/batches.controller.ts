import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiBody,
  ApiAcceptedResponse,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';

import { CreateBatchDto } from './dto/create-batch.dto.ts';
import { AllegroAuthGuard } from '../allegro-auth/allegro-auth.guard.ts';
import { BatchesService } from './batches.service.ts';
import { AllegroSessionGuard } from '../allegro-auth/session/allegro-session.guard.ts';

interface AllegroAuthenticatedRequest extends Request {
  allegroUser: {
    id: number;
  };
}

@ApiTags('Batches')
@Controller('batches')
@UseGuards(AllegroAuthGuard)
@ApiBearerAuth('allegroAccessToken')
@ApiUnauthorizedResponse({ description: 'The Allegro access token is missing or invalid.' })
export class BatchesController {
  constructor(private readonly batchesService: BatchesService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Create an asynchronous batch' })
  @ApiBody({ type: CreateBatchDto })
  @ApiAcceptedResponse({ description: 'The batch was accepted for processing.' })
  @ApiBadRequestResponse({ description: 'The request body is invalid.' })
  create(@Req() req: AllegroAuthenticatedRequest, @Body() dto: CreateBatchDto) {
    return this.batchesService.create(req.allegroUser.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get batch status and progress counters' })
  @ApiOkResponse({ description: 'Batch status.' })
  @ApiNotFoundResponse({ description: 'Batch not found for this seller.' })
  getStatus(@Req() req: AllegroAuthenticatedRequest, @Param('id') id: string) {
    return this.batchesService.getStatus(req.allegroUser.id, id);
  }
}