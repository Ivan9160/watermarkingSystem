import { NestFactory } from '@nestjs/core';

import { WorkerModule } from './worker.module.ts';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks(); 
}

bootstrap();
