import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Request } from "express";
import { CreateOrganizationDto } from "./dto/create-organization.dto.js";
import { OrganizationsService } from "./organizations.service.js";
import { JwtGuard } from "../auth/jwt.guard.js";
import { Headers } from "@nestjs/common";

type AuthenticatedRequest = Request & {
  user: {
    sub: string;
  };
};

@Controller("organizations")
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
  ) {}

  @Post()
  @UseGuards(JwtGuard)
  create(
    @Headers('authorization') authorization: string ,
    @Body() dto: CreateOrganizationDto,
  ) {
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) {
      throw new Error("Bearer token is required");
    }
    return this.organizationsService.create(token, dto.name);
  }
}
