import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import type { JsonValue } from '@prisma/orm-postgres/contract/types';

export class OfferImageDto {
  @ApiProperty({
    description: 'HTTPS URL of the product image.',
    example: 'https://example.com/images/product-4.jpg',
  })
  @IsString()
  @IsNotEmpty()
  @IsUrl(
    { protocols: ['https'], require_protocol: true },
  )
  url!: string;

  @ApiProperty({
    description:
      'Zero-based index of the original image in the Allegro offer.',
    example: 3,
    minimum: 0,
    maximum: 19,
  })
  @IsInt()
  @Min(0)
  @Max(19)
  offerImageIndex!: number;
}

export class ProductImagesDto {
  @ApiProperty({
    description: 'Allegro offer ID associated with these images.',
    example: '123456789',
    maxLength: 128,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  offerId!: string;

  @ApiProperty({
    description:
      'Product images with their URLs and original indexes in the Allegro offer.',
    type: () => OfferImageDto,
    isArray: true,
    minItems: 1,
    maxItems: 20,
    example: [
      {
        url: 'https://example.com/images/product-4.jpg',
        offerImageIndex: 3,
      },
      {
        url: 'https://example.com/images/product-5.jpg',
        offerImageIndex: 4,
      },
      {
        url: 'https://example.com/images/product-6.jpg',
        offerImageIndex: 5,
      },
    ],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => OfferImageDto)
  images!: OfferImageDto[];
}

export class CreateBatchDto {
  @ApiProperty({
    description:
      'Products included in the batch. Each product must contain an offer ID and between 1 and 20 images.',
    type: () => ProductImagesDto,
    isArray: true,
    minItems: 1,
    maxItems: 20,
    example: [
      {
        offerId: '123456789',
        images: [
          {
            url: 'https://example.com/images/product-4.jpg',
            offerImageIndex: 3,
          },
          {
            url: 'https://example.com/images/product-5.jpg',
            offerImageIndex: 4,
          },
        ],
      },
      {
        offerId: '987654321',
        images: [
          {
            url: 'https://example.com/images/product-3.jpg',
            offerImageIndex: 2,
          },
        ],
      },
    ],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ProductImagesDto)
  products!: ProductImagesDto[];

  @ApiPropertyOptional({
    description:
      'Optional JSON configuration for the watermark. The supported properties depend on the watermark processing implementation.',
    type: 'object',
    additionalProperties: true,
    example: {
      text: 'My Shop',
      opacity: 0.5,
    },
  })
  @IsOptional()
  @IsObject()
  watermarkConfig?: {
    [key: string]: JsonValue;
  };
}