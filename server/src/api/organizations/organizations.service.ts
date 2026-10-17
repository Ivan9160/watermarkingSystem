import { ConflictException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(auth0Sub: string, name: string) {
    const existing = await this.prisma.orm.public.Organization
      .where({ auth0Sub })
      .select("id")
      .first();

    if (existing) {
      throw new ConflictException(
        "Organization already exists for this user",
      );
    }

    const organization = await this.prisma.orm.public.Organization.create({
      auth0Sub,
      name: name.trim(),
    });

    // Keep Auth0's subject internal; return only public organization fields.
    return {
      id: organization.id,
      name: organization.name,
      createdAt: organization.createdAt,
      updatedAt: organization.updatedAt,
    };
  }
}
