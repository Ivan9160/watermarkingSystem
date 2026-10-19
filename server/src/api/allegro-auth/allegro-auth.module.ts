import { Module } from '@nestjs/common';
import { AllegroAuthService } from './allegro-auth.service.ts';
import { AllegroAuthController } from './allegro-auth.controller.ts';
import { ConfigService } from '@nestjs/config';
import { AllegroAuthGuard } from './allegro-auth.guard.ts';

@Module({
  controllers: [AllegroAuthController],
  providers: [AllegroAuthService, ConfigService, AllegroAuthGuard],
  exports: [ AllegroAuthGuard],
})
export class AllegroAuthModule {}
