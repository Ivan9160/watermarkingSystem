import { BatchesService } from './batches.service.ts';
import { CreateBatchDto } from './dto/create-batch.dto.ts';
export declare class BatchesController {
    private readonly batchesService;
    constructor(batchesService: BatchesService);
    create(authorization: string | undefined, dto: CreateBatchDto): Promise<{
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
}
