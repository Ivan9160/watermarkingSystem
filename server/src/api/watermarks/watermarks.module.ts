import { Module } from '@nestjs/common';

import { AllegroAuthModule } from '../allegro-auth/allegro-auth.module.ts';
import { OrganizationsModule } from '../organizations/organizations.module.ts';

import { MinioModule } from '../../businessLogic/minio/minio.module.ts';
import { ImageDownloaderService } from '../../businessLogic/ingestion/image-downloader.service.ts';
import { PixelSealEngineService } from '../../businessLogic/processing/pixelseal-engine.service.ts';

import { WatermarksController } from './watermarks.controller.ts';
import { WatermarkVerificationService } from './watermark-verification.service.ts';

@Module({
  imports: [
    AllegroAuthModule,
    OrganizationsModule,
    MinioModule,
  ],
  controllers: [WatermarksController],
  providers: [
    WatermarkVerificationService,
    PixelSealEngineService,
    ImageDownloaderService,
  ],
})
export class WatermarksModule {}
