var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module } from '@nestjs/common';
import { AllegroAuthService } from "./allegro-auth.service.js";
import { AllegroAuthController } from "./allegro-auth.controller.js";
import { ConfigService } from '@nestjs/config';
import { AllegroAuthGuard } from "./allegro-auth.guard.js";
let AllegroAuthModule = class AllegroAuthModule {
};
AllegroAuthModule = __decorate([
    Module({
        controllers: [AllegroAuthController],
        providers: [AllegroAuthService, ConfigService, AllegroAuthGuard],
        exports: [AllegroAuthGuard],
    })
], AllegroAuthModule);
export { AllegroAuthModule };
//# sourceMappingURL=allegro-auth.module.js.map