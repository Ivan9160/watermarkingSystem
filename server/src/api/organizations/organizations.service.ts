import { ConflictException, Injectable } from "@nestjs/common";
import { db } from "../../prisma/db.ts";
import * as dto from "./dto/create-organization.dto.ts";

@Injectable()
export class OrganizationsService {

  async create( dto: dto.CreateOrganizationDto) {
    const existing = await db.orm.public.Organization
      .where({ allegroUserId: dto.allegroUserId })
      .select("id")
      .first();

    if (existing) {
      throw new ConflictException(
        "Organization already exists for this user",
      );
    }

    const organization = await db.orm.public.Organization.create({
      allegroUserId: dto.allegroUserId,
      name: dto.name.trim(),
    });

    return {
      id: organization.id,
      name: organization.name,
      createdAt: organization.createdAt,
      updatedAt: organization.updatedAt,
    };
  }
}
