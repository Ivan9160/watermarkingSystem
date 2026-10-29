import { Module } from '@nestjs/common';
import { AllegroAuthModule } from '../allegro-auth/allegro-auth.module.ts';
import { ImageDownloaderService } from '../../businessLogic/ingestion/image-downloader.service.ts';
import { WatermarkPreviewController } from './watermark-preview.controller.ts';

@Module({
  imports: [AllegroAuthModule],
  controllers: [WatermarkPreviewController],
  providers: [ImageDownloaderService],
})
export class WatermarkPreviewModule {}
