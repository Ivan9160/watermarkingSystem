import * as dto from "./dto/create-organization.dto.ts";
export declare class OrganizationsService {
    create(allegroUserId: number, dto: dto.CreateOrganizationDto): Promise<{
        id: string;
        name: string;
        createdAt: Temporal.Instant;
        updatedAt: Temporal.Instant;
    }>;
}
