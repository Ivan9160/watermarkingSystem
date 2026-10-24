import { Module } from '@nestjs/common';

import { MinioModule } from '../../businessLogic/minio/minio.module.ts';
import { PersistenceModule } from '../../businessLogic/persistence/persistence.module.ts';
import { ResultsController } from './results.controller.ts';
import { ResultsService } from './results.service.ts';
import { AllegroAuthModule } from '../allegro-auth/allegro-auth.module.ts';
import { AllegroAuthGuard } from '../allegro-auth/allegro-auth.guard.ts';

@Module({
  imports: [PersistenceModule, MinioModule, AllegroAuthModule],
  controllers: [ResultsController],
  providers: [ResultsService, AllegroAuthGuard],
})
export class ResultsModule {}
