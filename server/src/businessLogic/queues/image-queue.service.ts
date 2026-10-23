import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import {
  IMAGE_DOWNLOAD_QUEUE,
  IMAGE_PROCESS_QUEUE,
  type ImageTaskPayload,
} from './queue.constants.ts';

@Injectable()
export class ImageQueueService {
  constructor(
    @InjectQueue(IMAGE_DOWNLOAD_QUEUE)
    private readonly downloadQueue: Queue<ImageTaskPayload>,
    @InjectQueue(IMAGE_PROCESS_QUEUE)
    private readonly processQueue: Queue<ImageTaskPayload>,
  ) {}

  async enqueueDownloads(imageJobIds: string[]): Promise<void> {
    await this.downloadQueue.addBulk(
      imageJobIds.map((imageJobId) => ({
        name: 'download',
        data: { imageJobId },
        opts: { jobId: `download-${imageJobId}` },
      })),
    );
  }

  async enqueueProcess(imageJobId: string): Promise<void> {
    await this.processQueue.add(
      'process',
      { imageJobId },
      { jobId: `process-${imageJobId}` }, 
    );
  }
}
