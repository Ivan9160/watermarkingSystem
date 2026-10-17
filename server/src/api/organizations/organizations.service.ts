import { ConflictException, Injectable } from "@nestjs/common";
import { db } from "../../prisma/db.ts";

@Injectable()
export class OrganizationsService {

  async create(auth0Sub: string, name: string) {
    const existing = await db.orm.public.Organization
      .where({ auth0Sub })
      .select("id")
      .first();

    if (existing) {
      throw new ConflictException(
        "Organization already exists for this user",
      );
    }

    const organization = await db.orm.public.Organization.create({
      auth0Sub,
      name: name.trim(),
    });

    return {
      id: organization.id,
      name: organization.name,
      createdAt: organization.createdAt,
      updatedAt: organization.updatedAt,
    };
  }
}
