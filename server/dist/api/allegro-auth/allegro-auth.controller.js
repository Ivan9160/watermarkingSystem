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
import { Body, Controller, Get, Post, Query, Redirect } from '@nestjs/common';
import { AllegroAuthService } from "./allegro-auth.service.js";
let AllegroAuthController = class AllegroAuthController {
    auth;
    constructor(auth) {
        this.auth = auth;
    }
    login() {
        return { url: this.auth.buildAuthorizeUrl() };
    }
    async callback(code, state) {
        const token = await this.auth.exchangeCode(code, state);
        const me = await this.auth.getMe(token.access_token);
        return { ...token, allegroUserId: me.id, login: me.login };
    }
    refresh(refreshToken) {
        return this.auth.refresh(refreshToken);
    }
};
__decorate([
    Get('login'),
    Redirect(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AllegroAuthController.prototype, "login", null);
__decorate([
    Get('callback'),
    __param(0, Query('code')),
    __param(1, Query('state')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AllegroAuthController.prototype, "callback", null);
__decorate([
    Post('refresh'),
    __param(0, Body('refresh_token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AllegroAuthController.prototype, "refresh", null);
AllegroAuthController = __decorate([
    Controller('auth/allegro'),
    __metadata("design:paramtypes", [AllegroAuthService])
], AllegroAuthController);
export { AllegroAuthController };
//# sourceMappingURL=allegro-auth.controller.js.map