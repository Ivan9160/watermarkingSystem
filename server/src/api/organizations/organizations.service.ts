import { ConflictException, Injectable } from "@nestjs/common";
import { db } from "../../prisma/db.ts";
import * as dto from "./dto/create-organization.dto.ts";
import { randomBytes } from "node:crypto";

type OrganizationCreateInput = Parameters<
    typeof db.orm.public.Organization.create
>[0];

type InvisibleWatermarkId = NonNullable<
    OrganizationCreateInput["invisibleWatermarkId"]
>;

function generateInvisibleWatermarkId(): InvisibleWatermarkId {
    return randomBytes(5).toString("hex") as InvisibleWatermarkId;
}

@Injectable()
export class OrganizationsService {

  async create( allegroUserId: number, dto: dto.CreateOrganizationDto) {
    const existing = await db.orm.public.Organization
      .where({ allegroUserId: allegroUserId })
      .select("id")
      .first();

    if (existing) {
      throw new ConflictException(
        "Organization already exists for this user",
      );
    }

    const organization = await db.orm.public.Organization.create({
      allegroUserId: allegroUserId,
      name: dto.name.trim(),
      invisibleWatermarkId: generateInvisibleWatermarkId(),
    });

    return {
      id: organization.id,
      name: organization.name,
      createdAt: organization.createdAt,
      updatedAt: organization.updatedAt,
    };
  }

  async findByInvisibleWatermarkId(watermarkId: string) {
    if (!/^[0-9a-f]{10}$/i.test(watermarkId)) {
        return null;
    }

    const normalizedId =
        watermarkId.toLowerCase() as InvisibleWatermarkId;

    return db.orm.public.Organization
        .where({ invisibleWatermarkId: normalizedId })
        .select("id", "name", "allegroUserId")
        .first();
  }
}
