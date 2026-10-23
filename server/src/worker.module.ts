import { Module } from '@nestjs/common';

import { IngestionModule } from './businessLogic/ingestion/ingestion.module.ts';
import { ProcessingModule } from './businessLogic/processing/processing.module.ts';

@Module({ imports: [IngestionModule, ProcessingModule] })
export class WorkerModule {}
