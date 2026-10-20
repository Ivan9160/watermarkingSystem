import {
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';

import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiBody,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CreateOrganizationDto } from './dto/create-organization.dto.js';
import { OrganizationsService } from './organizations.service.js';
import { AllegroUser } from '../allegro-auth/allegro-user.decorator.ts';
import { AllegroAuthGuard } from '../auth/allegro-auth.guard.ts';

@ApiTags('Organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
  ) {}

  @Post()
  @UseGuards(AllegroAuthGuard)
  @ApiBearerAuth('allegroAccessToken')
  @ApiOperation({
    summary: 'Create an organization',
    description:
      'Creates an organization associated with the authenticated Allegro seller. ' +
      'The Allegro seller ID is extracted from the access token and must not be ' +
      'provided in the request body.',
  })
  @ApiBody({
    type: CreateOrganizationDto,
    description: 'Organization creation data.',
  })
  @ApiCreatedResponse({
    description: 'The organization was created successfully.',
  })
  @ApiBadRequestResponse({
    description: 'The request body is invalid.',
  })
  @ApiUnauthorizedResponse({
    description: 'The Allegro access token is missing or invalid.',
  })
  create(
    @AllegroUser() user: { id: number },
    @Body() dto: CreateOrganizationDto,
  ) {
    return this.organizationsService.create(user.id, dto);
  }
}