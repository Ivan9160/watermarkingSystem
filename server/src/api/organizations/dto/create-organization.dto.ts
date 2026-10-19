import { IsInt, IsNotEmpty, IsString, MaxLength } from "class-validator";

export class CreateOrganizationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsInt()
  @IsNotEmpty()
  allegroUserId!: number;
}
