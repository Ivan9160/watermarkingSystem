var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module } from '@nestjs/common';
import { BatchesController } from "./batches.controller.js";
import { BatchesService } from "./batches.service.js";
import { MinioModule } from "../../minio/minio.module.js";
import { PrismaModule } from "../../prisma/prisma.module.js";
import { JwtGuard } from "../auth/jwt.guard.js";
import { MinioStorageService } from "../../minio/minio-storage.service.js";
let BatchesModule = class BatchesModule {
};
BatchesModule = __decorate([
    Module({
        imports: [MinioModule, PrismaModule],
        controllers: [BatchesController],
        providers: [BatchesService, JwtGuard, MinioStorageService],
    })
], BatchesModule);
export { BatchesModule };
//# sourceMappingURL=batches.module.js.map