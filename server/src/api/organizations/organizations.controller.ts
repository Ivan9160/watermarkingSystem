import {
  Body,
  Controller,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Request } from "express";
import { CreateOrganizationDto } from "./dto/create-organization.dto.js";
import { OrganizationsService } from "./organizations.service.js";
import { JwtGuard } from "../auth/jwt.guard.js";
import { Headers } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import { AllegroUser } from "../allegro-auth/allegro-user.decorator.ts";
import { AllegroAuthGuard } from "../auth/allegro-auth.guard.ts";


@Controller("organizations")
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
  ) {}

  @Post()
  @UseGuards(AllegroAuthGuard)
  create(
    @AllegroUser() user: { id: number },
    @Body() dto: CreateOrganizationDto,
  ) {
    return this.organizationsService.create(user.id, dto);
  }
}
