import { PartialType } from '@nestjs/mapped-types';
import { CreateAllegroAuthDto } from './create-allegro-auth.dto.ts';

export class UpdateAllegroAuthDto extends PartialType(CreateAllegroAuthDto) {}
