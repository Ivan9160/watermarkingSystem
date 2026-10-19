var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { ConflictException, Injectable } from "@nestjs/common";
import { db } from "../../prisma/db.js";
let OrganizationsService = class OrganizationsService {
    async create(allegroUserId, dto) {
        const existing = await db.orm.public.Organization
            .where({ allegroUserId: allegroUserId })
            .select("id")
            .first();
        if (existing) {
            throw new ConflictException("Organization already exists for this user");
        }
        const organization = await db.orm.public.Organization.create({
            allegroUserId: allegroUserId,
            name: dto.name.trim(),
        });
        return {
            id: organization.id,
            name: organization.name,
            createdAt: organization.createdAt,
            updatedAt: organization.updatedAt,
        };
    }
};
OrganizationsService = __decorate([
    Injectable()
], OrganizationsService);
export { OrganizationsService };
//# sourceMappingURL=organizations.service.js.map