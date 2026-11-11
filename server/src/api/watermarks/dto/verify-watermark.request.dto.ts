import {
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyWatermarkRequestDto {
  @ApiProperty({
    description:
      'Image ID returned by the WaterM Image Library. The ID is resolved against the authenticated seller session or their private RustFS uploads.',
    example: 'allegro-123456789-987654321-0',
    maxLength: 200,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  imageId!: string;
}
