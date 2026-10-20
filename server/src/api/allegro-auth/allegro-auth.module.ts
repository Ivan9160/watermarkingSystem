import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AllegroAuthService } from './allegro-auth.service.ts';
import { AllegroAuthController } from './allegro-auth.controller.ts';
import { AllegroAuthGuard } from './allegro-auth.guard.ts';
import { AllegroSessionService } from './allegro-session.service.ts';

@Module({
  controllers: [AllegroAuthController],
  providers: [
    AllegroAuthService,
    ConfigService,
    AllegroAuthGuard,
    AllegroSessionService,
  ],
  exports: [AllegroAuthGuard],
})
export class AllegroAuthModule {}
