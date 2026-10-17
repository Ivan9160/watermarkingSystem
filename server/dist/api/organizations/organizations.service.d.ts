export declare class OrganizationsService {
    create(auth0Sub: string, name: string): Promise<{
        id: string;
        name: string;
        createdAt: Temporal.Instant;
        updatedAt: Temporal.Instant;
    }>;
}
