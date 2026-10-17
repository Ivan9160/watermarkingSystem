import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { CreatePresetDto } from './dto/create-preset.dto.js';
import { UpdatePresetDto } from './dto/update-preset.dto.js';
import { PresetsService } from './presets.service.js';

@Controller('presets')
@UseGuards(ApiKeyGuard)
export class PresetsController {
  constructor(private readonly presets: PresetsService) {}

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreatePresetDto) {
    return this.presets.create(request.organizationId, dto);
  }

  @Get()
  findAll(@Req() request: AuthenticatedRequest) {
    return this.presets.findAll(request.organizationId);
  }

  @Get(':id')
  findOne(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.presets.findOne(request.organizationId, id);
  }

  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdatePresetDto,
  ) {
    return this.presets.update(request.organizationId, id, dto);
  }

  @Delete(':id')
  archive(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.presets.archive(request.organizationId, id);
  }
}
