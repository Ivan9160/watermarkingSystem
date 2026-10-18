import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { OrganizationsModule } from './api/organizations/organizations.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { MinioModule } from './minio/minio.module.ts';
import { BatchesModule } from './api/batches/batches.module.ts';

@Module({
  imports: [OrganizationsModule, PrismaModule, MinioModule, BatchesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}