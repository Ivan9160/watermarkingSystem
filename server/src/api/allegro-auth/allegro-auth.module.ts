import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AllegroAuthService } from './allegro-auth.service.ts';
import { AllegroAuthController } from './allegro-auth.controller.ts';
import { AllegroAuthGuard } from './allegro-auth.guard.ts';
import { AllegroSessionService } from './session/allegro-session.service.ts';
import { AllegroSessionGuard } from './session/allegro-session.guard.ts';


@Module({
  controllers: [AllegroAuthController],
  providers: [
    AllegroAuthService,
    ConfigService,
    AllegroAuthGuard,
    AllegroSessionGuard,
    AllegroSessionService,
  ],
  exports: [AllegroAuthGuard, AllegroSessionGuard, AllegroAuthService, AllegroSessionService],
})
export class AllegroAuthModule {}
