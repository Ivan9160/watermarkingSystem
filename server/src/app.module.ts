import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { OrganizationsModule } from './api/organizations/organizations.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { MinioModule } from './businessLogic/minio/minio.module.ts';
import { BatchesModule } from './api/batches/batches.module.ts';
import { AllegroAuthModule } from './api/allegro-auth/allegro-auth.module.ts';
import { BullModule } from '@nestjs/bullmq';
import { ResultsModule } from './api/results/results.module.ts';
import { WatermarkPreviewModule } from './api/watermark-preview/watermark-preview.module.ts';

@Module({
  imports: [WatermarkPreviewModule, OrganizationsModule, PrismaModule, MinioModule, BatchesModule, AllegroAuthModule, ResultsModule,
    BullModule.forRoot({
      connection: {
        host: process.env['REDIS_HOST'] ?? '127.0.0.1',
        port: Number(process.env['REDIS_PORT'] ?? 6379),
        password: process.env['REDIS_PASSWORD'] || undefined,
      },
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}