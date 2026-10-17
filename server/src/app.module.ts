import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { OrganizationsModule } from './api/organizations/organizations.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [OrganizationsModule, PrismaModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}