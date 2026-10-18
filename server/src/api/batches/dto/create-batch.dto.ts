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
import type { JsonValue } from '@prisma/orm-postgres/contract/types';

export class ProductImagesDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  offerId!: string;

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
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ProductImagesDto)
  products!: ProductImagesDto[];

  @IsOptional()
  @IsObject()
  watermarkConfig?: { [key: string]: JsonValue };
}