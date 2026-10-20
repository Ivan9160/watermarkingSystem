import { IsInt, IsNotEmpty, IsString, MaxLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CreateOrganizationDto {
  @ApiProperty({
    description: 'Display name of the organization.',
    example: 'My Allegro Shop',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;
}
