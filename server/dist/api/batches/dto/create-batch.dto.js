var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsNotEmpty, IsObject, IsOptional, IsString, IsUrl, MaxLength, ValidateNested, } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, } from '@nestjs/swagger';
export class ProductImagesDto {
    offerId;
    images;
}
__decorate([
    ApiProperty({
        description: 'Allegro offer ID associated with these images.',
        example: '123456789',
        maxLength: 128,
    }),
    IsString(),
    IsNotEmpty(),
    MaxLength(128),
    __metadata("design:type", String)
], ProductImagesDto.prototype, "offerId", void 0);
__decorate([
    ApiProperty({
        description: 'HTTPS URLs of the product images. Provide between 1 and 20 images.',
        type: [String],
        minItems: 1,
        maxItems: 20,
        example: [
            'https://example.com/images/product-1.jpg',
            'https://example.com/images/product-2.jpg',
        ],
    }),
    IsArray(),
    ArrayMinSize(1),
    ArrayMaxSize(20),
    IsUrl({ protocols: ['https'], require_protocol: true }, { each: true }),
    __metadata("design:type", Array)
], ProductImagesDto.prototype, "images", void 0);
export class CreateBatchDto {
    products;
    watermarkConfig;
}
__decorate([
    ApiProperty({
        description: 'Products included in the batch. Each product must contain an offer ID and between 1 and 20 HTTPS image URLs.',
        type: () => ProductImagesDto,
        isArray: true,
        minItems: 1,
        maxItems: 20,
        example: [
            {
                offerId: '123456789',
                images: [
                    'https://example.com/images/product-1.jpg',
                    'https://example.com/images/product-2.jpg',
                ],
            },
            {
                offerId: '987654321',
                images: [
                    'https://example.com/images/product-3.jpg',
                ],
            },
        ],
    }),
    IsArray(),
    ArrayMinSize(1),
    ArrayMaxSize(20),
    ValidateNested({ each: true }),
    Type(() => ProductImagesDto),
    __metadata("design:type", Array)
], CreateBatchDto.prototype, "products", void 0);
__decorate([
    ApiPropertyOptional({
        description: 'Optional JSON configuration for the watermark. The supported properties depend on the watermark processing implementation.',
        type: 'object',
        additionalProperties: true,
        example: {
            text: 'My Shop',
            opacity: 0.5,
        },
    }),
    IsOptional(),
    IsObject(),
    __metadata("design:type", Object)
], CreateBatchDto.prototype, "watermarkConfig", void 0);
//# sourceMappingURL=create-batch.dto.js.map