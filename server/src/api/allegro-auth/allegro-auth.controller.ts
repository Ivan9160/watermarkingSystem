import { Body, Controller, Get, Post, Query, Redirect } from '@nestjs/common';
import { AllegroAuthService } from './allegro-auth.service.ts';

@Controller('auth/allegro')
export class AllegroAuthController {
  constructor(private readonly auth: AllegroAuthService) {}

  @Get('login')
  @Redirect()
  login() {
    return { url: this.auth.buildAuthorizeUrl() };
  }

  @Get('callback')
  async callback(@Query('code') code: string, @Query('state') state: string) {
    const token = await this.auth.exchangeCode(code, state);
    const me = await this.auth.getMe(token.access_token);
    return { ...token, allegroUserId: me.id, login: me.login };
  }

  @Post('refresh')
  refresh(@Body('refresh_token') refreshToken: string) {
    return this.auth.refresh(refreshToken);
  }
}