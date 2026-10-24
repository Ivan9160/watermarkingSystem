import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Redirect,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiBody,
} from '@nestjs/swagger';
import { AllegroAuthService } from './allegro-auth.service.ts';
import {
  AllegroSessionService,
  SESSION_MAX_AGE_MS,
} from './session/allegro-session.service.ts';

import {
  OAUTH_STATE_COOKIE,
  OAUTH_COOKIE_PATH,
  SECURE_COOKIE,
  SESSION_COOKIE,
} from './session/auth.constants.ts';
import { getCookie } from './session/cookie.util.ts';

@ApiTags('Allegro Authentication')
@Controller('auth/allegro')
export class AllegroAuthController {
  constructor(
    private readonly auth: AllegroAuthService,
    private readonly sessions: AllegroSessionService,
  ) {}

  @Get('login')
  @Redirect()
  @ApiOperation({ summary: 'Start Allegro OAuth authorization' })
  @ApiResponse({ status: 302, description: 'Redirects to Allegro' })
  login(@Res({ passthrough: true }) response: Response) {
    const authorizeUrl = new URL(this.auth.buildAuthorizeUrl());
    authorizeUrl.searchParams.set('prompt', 'confirm');
    const url = authorizeUrl.toString();
    const state = authorizeUrl.searchParams.get('state');
    if (!state) throw new UnauthorizedException('Missing OAuth state');

    response.cookie(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: SECURE_COOKIE,
      path: OAUTH_COOKIE_PATH,
      maxAge: 10 * 60 * 1000,
    });

    return { url };
  }

  @Get('callback')
  @ApiOperation({ summary: 'Handle Allegro OAuth callback and return to WaterM' })
  @ApiQuery({ name: 'code', required: true })
  @ApiQuery({ name: 'state', required: true })
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const expected = getCookie(request, OAUTH_STATE_COOKIE);
    response.clearCookie(OAUTH_STATE_COOKIE, { path: OAUTH_COOKIE_PATH });

    const a = Buffer.from(expected ?? '', 'utf8');
    const b = Buffer.from(state ?? '', 'utf8');

    if (!expected || !state || a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid OAuth state cookie');
    }

    const tokens = await this.auth.exchangeCode(code, state);
    const user = await this.auth.getMe(tokens.access_token);
    const sessionId = this.sessions.createSession(tokens, user);

    response.cookie(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: SECURE_COOKIE,
      path: '/api',
      maxAge: SESSION_MAX_AGE_MS,
    });

    return response.redirect(`${process.env['FRONTEND_URL'] ?? 'http://localhost:5173'}/?allegro=connected`,);
  }

  @Get('status')
  @ApiOperation({ summary: 'Read Allegro connection status for current browser' })
  getStatus(@Req() request: Request) {
    return this.sessions.getStatus(getCookie(request, SESSION_COOKIE));
  }

  @Post('import')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Start importing all Allegro offer images' })
  @ApiResponse({
    status: 202,
    description: 'Import started or already running; returns the current progress.',
  })
  startImport(@Req() request: Request) {
    return this.sessions.startImport(getCookie(request, SESSION_COOKIE));
  }

  @Get('import/progress')
  @ApiOperation({ summary: 'Get current Allegro import progress' })
  @ApiOkResponse({ description: 'Current stage and real import counters.' })
  getImportProgress(@Req() request: Request) {
    return this.sessions.getImportProgress(getCookie(request, SESSION_COOKIE));
  }

  @Get('images')
  @ApiOperation({ summary: 'Get all offer gallery images from all seller offers' })
  getImages(@Req() request: Request) {
    return this.sessions.getImages(getCookie(request, SESSION_COOKIE));
  }

  @Post('logout')
  @ApiOperation({ summary: 'Disconnect the current browser from Allegro' })
  logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    this.sessions.disconnect(getCookie(request, SESSION_COOKIE));
    response.clearCookie(SESSION_COOKIE, { path: '/api' });
    response.clearCookie(OAUTH_STATE_COOKIE, { path: OAUTH_COOKIE_PATH });
    return { connected: false };
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh Allegro access token manually' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['refresh_token'],
      properties: { refresh_token: { type: 'string' } },
    },
  })
  @ApiOkResponse({ description: 'New access token returned' })
  @ApiBadRequestResponse({ description: 'Invalid refresh token' })
  refresh(@Body('refresh_token') refreshToken: string) {
    return this.auth.refresh(refreshToken);
  }
}
