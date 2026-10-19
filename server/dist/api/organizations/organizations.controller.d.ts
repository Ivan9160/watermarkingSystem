import { CreateOrganizationDto } from "./dto/create-organization.dto.js";
import { OrganizationsService } from "./organizations.service.js";
export declare class OrganizationsController {
    private readonly organizationsService;
    constructor(organizationsService: OrganizationsService);
    create(user: {
        id: number;
    }, dto: CreateOrganizationDto): Promise<{
        id: string;
        name: string;
        createdAt: Temporal.Instant;
        updatedAt: Temporal.Instant;
    }>;
}
