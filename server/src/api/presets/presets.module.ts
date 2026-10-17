import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PresetsController } from './presets.controller.js';
import { PresetsService } from './presets.service.js';

@Module({
  imports: [AuthModule],
  controllers: [PresetsController],
  providers: [PresetsService],
  exports: [PresetsService],
})
export class PresetsModule {}
