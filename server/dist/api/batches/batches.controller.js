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
import { Body, Controller, Post, UseGuards, Req, } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiBody, ApiCreatedResponse, ApiBadRequestResponse, ApiUnauthorizedResponse, } from '@nestjs/swagger';
import { BatchesService } from "./batches.service.js";
import { CreateBatchDto } from "./dto/create-batch.dto.js";
import { AllegroAuthGuard } from "../auth/allegro-auth.guard.js";
let BatchesController = class BatchesController {
    batchesService;
    constructor(batchesService) {
        this.batchesService = batchesService;
    }
    create(req, dto) {
        return this.batchesService.create(req.allegroUser.id, dto);
    }
};
__decorate([
    Post(),
    UseGuards(AllegroAuthGuard),
    ApiBearerAuth('allegroAccessToken'),
    ApiOperation({
        summary: 'Create a batch',
        description: 'Creates a new batch for the authenticated Allegro seller. ' +
            'The seller ID is extracted from the Allegro access token.',
    }),
    ApiBody({
        type: CreateBatchDto,
        description: 'Batch creation data.',
    }),
    ApiCreatedResponse({
        description: 'The batch was created successfully.',
    }),
    ApiBadRequestResponse({
        description: 'The request body is invalid.',
    }),
    ApiUnauthorizedResponse({
        description: 'The Allegro access token is missing or invalid.',
    }),
    __param(0, Req()),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, CreateBatchDto]),
    __metadata("design:returntype", void 0)
], BatchesController.prototype, "create", null);
BatchesController = __decorate([
    ApiTags('Batches'),
    Controller('batches'),
    __metadata("design:paramtypes", [BatchesService])
], BatchesController);
export { BatchesController };
//# sourceMappingURL=batches.controller.js.map