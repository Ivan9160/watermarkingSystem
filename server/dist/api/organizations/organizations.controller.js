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
import { Body, Controller, Post, UseGuards, } from "@nestjs/common";
import { CreateOrganizationDto } from "./dto/create-organization.dto.js";
import { OrganizationsService } from "./organizations.service.js";
import { JwtGuard } from "../auth/jwt.guard.js";
import { Headers } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
let OrganizationsController = class OrganizationsController {
    organizationsService;
    constructor(organizationsService) {
        this.organizationsService = organizationsService;
    }
    create(authorization, dto) {
        const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
        if (!token) {
            throw new UnauthorizedException("Bearer token is required");
        }
        return this.organizationsService.create(token, dto.name);
    }
};
__decorate([
    Post(),
    UseGuards(JwtGuard),
    __param(0, Headers('authorization')),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, CreateOrganizationDto]),
    __metadata("design:returntype", void 0)
], OrganizationsController.prototype, "create", null);
OrganizationsController = __decorate([
    Controller("organizations"),
    __metadata("design:paramtypes", [OrganizationsService])
], OrganizationsController);
export { OrganizationsController };
//# sourceMappingURL=organizations.controller.js.map