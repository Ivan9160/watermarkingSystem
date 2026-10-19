import {
  Body,
  Controller,
  Headers,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { JwtGuard } from '../auth/jwt.guard.ts';
import { BatchesService } from './batches.service.ts';
import { CreateBatchDto } from './dto/create-batch.dto.ts';

@Controller('batches')
export class BatchesController {
  constructor(
    private readonly batchesService: BatchesService,
  ) {}

  @Post()
  @UseGuards(JwtGuard)
  create(
    @Headers('authorization') authorization: string | undefined,
    @Headers('allegro-user-id') allegroUserId: string | undefined,
    @Body() dto: CreateBatchDto,
  ) {
    const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];

    if (!token) {
      throw new UnauthorizedException('Bearer token is required');
    }

    if (!allegroUserId) {
      throw new UnauthorizedException('Allegro user ID is required');
    }

    return this.batchesService.create(Number(allegroUserId), dto);
  }
}