import { Module } from '@nestjs/common';

import { MinioModule } from '../../businessLogic/minio/minio.module.ts';
import { PersistenceModule } from '../../businessLogic/persistence/persistence.module.ts';
import { ResultsController } from './results.controller.ts';
import { ResultsService } from './results.service.ts';

@Module({
  imports: [PersistenceModule, MinioModule],
  controllers: [ResultsController],
  providers: [ResultsService],
})
export class ResultsModule {}
