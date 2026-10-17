import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePresetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsObject()
  config!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  logoAssetId?: string;
}
