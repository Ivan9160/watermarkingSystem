import { Module } from "@nestjs/common";
import { OrganizationsController } from "./organizations.controller.js";
import { OrganizationsService } from "./organizations.service.js";
import { AllegroAuthModule } from "../allegro-auth/allegro-auth.module.ts";
import { AllegroAuthService } from "../allegro-auth/allegro-auth.service.ts";
import { AllegroAuthGuard } from "../allegro-auth/allegro-auth.guard.ts";
import { ConfigService } from "@nestjs/config";

@Module({
  imports: [AllegroAuthModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, AllegroAuthService, AllegroAuthGuard, ConfigService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
