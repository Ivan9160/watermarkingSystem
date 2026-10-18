import { MinioStorageService } from '../../minio/minio-storage.service.ts';
import { CreateBatchDto } from './dto/create-batch.dto.ts';
export declare class BatchesService {
    private readonly minio;
    constructor(minio: MinioStorageService);
    create(token: string, dto: CreateBatchDto): Promise<{
        id: string;
        status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
        totalProducts: number;
        totalImages: number;
        products: {
            offerId: string;
            images: {
                id: string;
                index: number;
                url: string;
            }[];
        }[];
    }>;
    private downloadImage;
}
