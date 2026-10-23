import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ImageQueueService } from './image-queue.service.ts';
import { IMAGE_DOWNLOAD_QUEUE, IMAGE_PROCESS_QUEUE } from './queue.constants.ts';

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: { age: 24 * 60 * 60, count: 10_000 },
  removeOnFail: { age: 7 * 24 * 60 * 60, count: 10_000 },
};

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: process.env['REDIS_HOST'] ?? '127.0.0.1',
        port: Number(process.env['REDIS_PORT'] ?? 6379),
        password: process.env['REDIS_PASSWORD'],
      },
    }),
    BullModule.registerQueue(
      { name: IMAGE_DOWNLOAD_QUEUE, defaultJobOptions },
      { name: IMAGE_PROCESS_QUEUE, defaultJobOptions },
    ),
  ],
  providers: [ImageQueueService],
  exports: [BullModule, ImageQueueService],
})
export class QueuesModule {}
