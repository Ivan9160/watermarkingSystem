import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Redirect,
  BadRequestException,
} from '@nestjs/common';

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

@ApiTags('Allegro Authentication')
@Controller('auth/allegro')
export class AllegroAuthController {
  constructor(
    private readonly auth: AllegroAuthService,
  ) {}

  @Get('login')
  @Redirect()
  @ApiOperation({
    summary: 'Start Allegro OAuth authorization',
    description:
      'Redirects the user to Allegro to authorize the application.',
  })
  @ApiResponse({
    status: 302,
    description: 'Redirects the browser to the Allegro authorization page.',
  })
  login() {
    return {
      url: this.auth.buildAuthorizeUrl(),
    };
  }

  @Get('callback')
  @ApiOperation({
    summary: 'Handle Allegro OAuth callback',
    description:
      'Exchanges the authorization code for tokens and retrieves ' +
      'the authenticated Allegro account information.',
  })
  @ApiQuery({
    name: 'code',
    type: String,
    required: true,
    description: 'Temporary authorization code returned by Allegro.',
    example: 'authorization_code_example',
  })
  @ApiQuery({
    name: 'state',
    type: String,
    required: true,
    description: 'OAuth state value used to validate the callback.',
    example: 'a1b2c3d4e5f6',
  })
  @ApiOkResponse({
    description:
      'Authorization succeeded. Returns token information and the Allegro account ID.',
    schema: {
      type: 'object',
      properties: {
        access_token: {
          type: 'string',
          description: 'Allegro access token.',
        },
        refresh_token: {
          type: 'string',
          description: 'Token used to obtain a new access token.',
        },
        token_type: {
          type: 'string',
          example: 'bearer',
        },
        expires_in: {
          type: 'number',
          description: 'Access token lifetime in seconds.',
          example: 43199,
        },
        allegroUserId: {
          oneOf: [
            { type: 'string' },
            { type: 'number' },
          ],
          description: 'ID of the authenticated Allegro account.',
          example: '111604947',
        },
        login: {
          type: 'string',
          description: 'Allegro account login.',
          example: 'my_shop',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'The authorization code or OAuth state is invalid.',
  })
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    const token = await this.auth.exchangeCode(code, state);
    const me = await this.auth.getMe(token.access_token);

    return {
      ...token,
      allegroUserId: me.id,
      login: me.login,
    };
  }

  @Post('refresh')
  @ApiOperation({
    summary: 'Refresh Allegro access token',
    description:
      'Exchanges a refresh token for a new Allegro access token.',
  })
  @ApiBody({
    description: 'Refresh token obtained during OAuth authorization.',
    schema: {
      type: 'object',
      required: ['refresh_token'],
      properties: {
        refresh_token: {
          type: 'string',
          description: 'The current Allegro refresh token.',
          example: 'refresh_token_example',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'The token was refreshed successfully.',
    schema: {
      type: 'object',
      properties: {
        access_token: {
          type: 'string',
          description: 'New Allegro access token.',
        },
        refresh_token: {
          type: 'string',
          description: 'New refresh token, if returned by Allegro.',
        },
        token_type: {
          type: 'string',
          example: 'bearer',
        },
        expires_in: {
          type: 'number',
          description: 'Access token lifetime in seconds.',
          example: 43199,
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'The refresh token is invalid or expired.',
  })
  refresh(
    @Body('refresh_token') refreshToken: string,
  ) {
    return this.auth.refresh(refreshToken);
  }
}