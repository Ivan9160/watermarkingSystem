import {
  Body,
  Controller,
  Post,
  UseGuards,
  Req,
} from '@nestjs/common';

import { BatchesService } from './batches.service.ts';
import { CreateBatchDto } from './dto/create-batch.dto.ts';
import { AllegroAuthGuard } from '../auth/allegro-auth.guard.ts';

interface AllegroAuthenticatedRequest extends Request {
  allegroUser: {
    id: number;
  };
}

@Controller('batches')
export class BatchesController {
  constructor(
    private readonly batchesService: BatchesService,
  ) {}

  @Post()
  @UseGuards(AllegroAuthGuard)
  create(@Req() req: AllegroAuthenticatedRequest, @Body() dto: CreateBatchDto) {
    return this.batchesService.create(req.allegroUser.id, dto);
  }
}