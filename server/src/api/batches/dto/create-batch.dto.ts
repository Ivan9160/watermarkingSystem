import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import type { JsonValue } from '@prisma/orm-postgres/contract/types';

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
    description: 'HTTPS URLs of the product images. Provide between 1 and 20 images.',
    type: [String],
    minItems: 1,
    maxItems: 20,
    example: [
      'https://example.com/images/product-1.jpg',
      'https://example.com/images/product-2.jpg',
    ],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUrl(
    { protocols: ['https'], require_protocol: true },
    { each: true },
  )
  images!: string[];
}

export class CreateBatchDto {
  @ApiProperty({
    description:
      'Products included in the batch. Each product must contain an offer ID and between 1 and 20 HTTPS image URLs.',
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
  watermarkConfig?: { [key: string]: JsonValue };
}