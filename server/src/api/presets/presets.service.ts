import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../server-sample/src/prisma/prisma.service.js';
import { CreatePresetDto } from './dto/create-preset.dto.js';
import { UpdatePresetDto } from './dto/update-preset.dto.js';

@Injectable()
export class PresetsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, dto: CreatePresetDto) {
    await this.validateLogo(organizationId, dto.logoAssetId);
    return this.prisma.preset.create({
      data: {
        organizationId,
        name: dto.name,
        description: dto.description,
        config: dto.config as Prisma.InputJsonValue,
        logoAssetId: dto.logoAssetId,
        status: 'ACTIVE',
      },
    });
  }

  findAll(organizationId: string) {
    return this.prisma.preset.findMany({
      where: { organizationId, status: { not: 'ARCHIVED' } },
      include: {
        logoAsset: { select: { id: true, mimeType: true, uploadedAt: true, createdAt: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const preset = await this.prisma.preset.findFirst({
      where: { id, organizationId },
      include: {
        logoAsset: { select: { id: true, mimeType: true, uploadedAt: true, createdAt: true } },
      },
    });
    if (!preset) throw new NotFoundException('Preset not found');
    return preset;
  }

  async update(organizationId: string, id: string, dto: UpdatePresetDto) {
    await this.findOne(organizationId, id);
    if (dto.logoAssetId !== undefined) {
      await this.validateLogo(organizationId, dto.logoAssetId);
    }

    const data: Prisma.PresetUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.config !== undefined) data.config = dto.config as Prisma.InputJsonValue;
    if (dto.logoAssetId !== undefined) {
      data.logoAsset = dto.logoAssetId
        ? { connect: { id: dto.logoAssetId } }
        : { disconnect: true };
    }

    return this.prisma.preset.update({ where: { id }, data });
  }

  async archive(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    return this.prisma.preset.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });
  }

  private async validateLogo(organizationId: string, logoAssetId?: string) {
    if (!logoAssetId) return;
    const asset = await this.prisma.watermarkAsset.findFirst({
      where: { id: logoAssetId, organizationId, uploadedAt: { not: null } },
    });
    if (!asset) {
      throw new ForbiddenException('Logo asset does not exist, is not uploaded, or belongs to another organization');
    }
  }
}
