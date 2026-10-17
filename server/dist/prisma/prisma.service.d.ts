import { OnApplicationShutdown } from "@nestjs/common";
export declare class PrismaService implements OnApplicationShutdown {
    onApplicationShutdown(): Promise<void>;
}
