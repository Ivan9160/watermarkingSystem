import { OnModuleInit } from '@nestjs/common';
export declare class MinioStorageService implements OnModuleInit {
    private readonly client;
    private readonly bucket;
    private readonly urlExpirySeconds;
    constructor();
    onModuleInit(): Promise<void>;
    upload(objectKey: string, buffer: Buffer, contentType: string): Promise<void>;
    getDownloadUrl(objectKey: string): Promise<string>;
    remove(objectKey: string): Promise<void>;
}
