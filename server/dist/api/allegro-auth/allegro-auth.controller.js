var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Body, Controller, Get, Post, Query, Redirect, } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiOkResponse, ApiBadRequestResponse, ApiBody, } from '@nestjs/swagger';
import { AllegroAuthService } from "./allegro-auth.service.js";
let AllegroAuthController = class AllegroAuthController {
    auth;
    constructor(auth) {
        this.auth = auth;
    }
    login() {
        return {
            url: this.auth.buildAuthorizeUrl(),
        };
    }
    async callback(code, state) {
        const token = await this.auth.exchangeCode(code, state);
        const me = await this.auth.getMe(token.access_token);
        return {
            ...token,
            allegroUserId: me.id,
            login: me.login,
        };
    }
    refresh(refreshToken) {
        return this.auth.refresh(refreshToken);
    }
};
__decorate([
    Get('login'),
    Redirect(),
    ApiOperation({
        summary: 'Start Allegro OAuth authorization',
        description: 'Redirects the user to Allegro to authorize the application.',
    }),
    ApiResponse({
        status: 302,
        description: 'Redirects the browser to the Allegro authorization page.',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AllegroAuthController.prototype, "login", null);
__decorate([
    Get('callback'),
    ApiOperation({
        summary: 'Handle Allegro OAuth callback',
        description: 'Exchanges the authorization code for tokens and retrieves ' +
            'the authenticated Allegro account information.',
    }),
    ApiQuery({
        name: 'code',
        type: String,
        required: true,
        description: 'Temporary authorization code returned by Allegro.',
        example: 'authorization_code_example',
    }),
    ApiQuery({
        name: 'state',
        type: String,
        required: true,
        description: 'OAuth state value used to validate the callback.',
        example: 'a1b2c3d4e5f6',
    }),
    ApiOkResponse({
        description: 'Authorization succeeded. Returns token information and the Allegro account ID.',
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
    }),
    ApiBadRequestResponse({
        description: 'The authorization code or OAuth state is invalid.',
    }),
    __param(0, Query('code')),
    __param(1, Query('state')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AllegroAuthController.prototype, "callback", null);
__decorate([
    Post('refresh'),
    ApiOperation({
        summary: 'Refresh Allegro access token',
        description: 'Exchanges a refresh token for a new Allegro access token.',
    }),
    ApiBody({
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
    }),
    ApiOkResponse({
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
    }),
    ApiBadRequestResponse({
        description: 'The refresh token is invalid or expired.',
    }),
    __param(0, Body('refresh_token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AllegroAuthController.prototype, "refresh", null);
AllegroAuthController = __decorate([
    ApiTags('Allegro Authentication'),
    Controller('auth/allegro'),
    __metadata("design:paramtypes", [AllegroAuthService])
], AllegroAuthController);
export { AllegroAuthController };
//# sourceMappingURL=allegro-auth.controller.js.map