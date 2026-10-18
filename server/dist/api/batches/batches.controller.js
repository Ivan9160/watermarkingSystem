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
import { Body, Controller, Headers, Post, UnauthorizedException, UseGuards, } from '@nestjs/common';
import { JwtGuard } from "../auth/jwt.guard.js";
import { BatchesService } from "./batches.service.js";
import { CreateBatchDto } from "./dto/create-batch.dto.js";
let BatchesController = class BatchesController {
    batchesService;
    constructor(batchesService) {
        this.batchesService = batchesService;
    }
    create(authorization, dto) {
        const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
        if (!token) {
            throw new UnauthorizedException('Bearer token is required');
        }
        return this.batchesService.create(token, dto);
    }
};
__decorate([
    Post(),
    UseGuards(JwtGuard),
    __param(0, Headers('authorization')),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, CreateBatchDto]),
    __metadata("design:returntype", void 0)
], BatchesController.prototype, "create", null);
BatchesController = __decorate([
    Controller('batches'),
    __metadata("design:paramtypes", [BatchesService])
], BatchesController);
export { BatchesController };
//# sourceMappingURL=batches.controller.js.map