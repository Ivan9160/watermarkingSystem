import type { JsonValue } from '@prisma/orm-postgres/contract/types';
export declare class ProductImagesDto {
    offerId: string;
    images: string[];
}
export declare class CreateBatchDto {
    products: ProductImagesDto[];
    watermarkConfig?: {
        [key: string]: JsonValue;
    };
}
