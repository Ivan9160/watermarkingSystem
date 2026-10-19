var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
let AllegroAuthService = class AllegroAuthService {
    config;
    states = new Set();
    constructor(config) {
        this.config = config;
    }
    buildAuthorizeUrl() {
        const state = randomBytes(16).toString('hex');
        this.states.add(state);
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: this.config.getOrThrow('ALLEGRO_CLIENT_ID'),
            redirect_uri: this.config.getOrThrow('ALLEGRO_REDIRECT_URI'),
            scope: this.config.getOrThrow('ALLEGRO_SCOPE'),
            state,
        });
        return `${this.config.getOrThrow('ALLEGRO_AUTH_URL')}?${params}`;
    }
    async exchangeCode(code, state) {
        if (!this.states.delete(state)) {
            throw new BadRequestException('Invalid state');
        }
        return this.requestToken({
            grant_type: 'authorization_code',
            code,
            redirect_uri: this.config.getOrThrow('ALLEGRO_REDIRECT_URI'),
        });
    }
    refresh(refreshToken) {
        return this.requestToken({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            redirect_uri: this.config.getOrThrow('ALLEGRO_REDIRECT_URI'),
        });
    }
    async getMe(accessToken) {
        const res = await fetch(`${this.config.getOrThrow('ALLEGRO_API_URL')}/me`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/vnd.allegro.public.v1+json',
            },
        });
        if (!res.ok)
            throw new BadRequestException(await res.text());
        return res.json();
    }
    async requestToken(body) {
        const basic = Buffer.from(`${this.config.getOrThrow('ALLEGRO_CLIENT_ID')}:${this.config.getOrThrow('ALLEGRO_CLIENT_SECRET')}`).toString('base64');
        const res = await fetch(this.config.getOrThrow('ALLEGRO_TOKEN_URL'), {
            method: 'POST',
            headers: {
                Authorization: `Basic ${basic}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams(body),
        });
        if (!res.ok)
            throw new BadRequestException(await res.text());
        return res.json();
    }
};
AllegroAuthService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [ConfigService])
], AllegroAuthService);
export { AllegroAuthService };
//# sourceMappingURL=allegro-auth.service.js.map