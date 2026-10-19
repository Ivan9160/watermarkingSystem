var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AllegroAuthService } from "../allegro-auth/allegro-auth.service.js";
let AllegroAuthGuard = class AllegroAuthGuard {
    allegro;
    cache = new Map();
    constructor(allegro) {
        this.allegro = allegro;
    }
    async canActivate(ctx) {
        const req = ctx.switchToHttp().getRequest();
        const token = req.headers.authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
        if (!token)
            throw new UnauthorizedException('Bearer token is required');
        const hit = this.cache.get(token);
        if (hit && hit.exp > Date.now()) {
            req.allegroUser = { id: hit.userId, token };
            return true;
        }
        let me;
        try {
            me = await this.allegro.getMe(token);
        }
        catch {
            throw new UnauthorizedException('Invalid Allegro token');
        }
        const userId = Number(me.id);
        this.cache.set(token, { userId, exp: Date.now() + 60_000 });
        req.allegroUser = { id: userId, token };
        return true;
    }
};
AllegroAuthGuard = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [AllegroAuthService])
], AllegroAuthGuard);
export { AllegroAuthGuard };
//# sourceMappingURL=allegro-auth.guard.js.map