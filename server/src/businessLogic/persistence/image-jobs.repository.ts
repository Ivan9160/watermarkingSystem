import { Injectable } from '@nestjs/common';

import { db } from '../../prisma/db.ts';
import { Temporal } from 'temporal-polyfill';

export type ImageJobStatus = 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED';


export interface NewImageJob {
  productOfferId: string;
  imageIndex: number;
  sourceUrl: string;
}

@Injectable()
export class ImageJobsRepository {
  async   createMany(batchId: string, items: NewImageJob[]) {
    const created = [];
    for (const item of items) {
      created.push(
        await db.orm.public.ImageJob.create({
          batchId,
          ...item,
          status: 'PENDING',
        } as any),
      );
    }
    return created;
  }

  findById(id: string) {
    return db.orm.public.ImageJob.where({ id }).first();
  }

  listByBatch(batchId: string) {
    return db.orm.public.ImageJob.where({ batchId }).all();
  }

  async markProcessing(id: string): Promise<void> {
    await db.orm.public.ImageJob.where({ id }).update({ status: 'PROCESSING' });
  }

  async saveOriginalKey(id: string, originalKey: string): Promise<void> {
    await db.orm.public.ImageJob.where({ id }).update({ originalKey });
  }

  async markSucceeded(id: string, outputKey: string): Promise<void> {
    await db.orm.public.ImageJob.where({ id }).update({
      status: 'SUCCEEDED',
      outputKey,
      errorMessage: null,
      processedAt: Temporal.Now.instant().toString(),
    });
  }

  async markFailed(id: string, errorMessage: string): Promise<void> {
    await db.orm.public.ImageJob.where({ id }).update({
      status: 'FAILED',
      errorMessage: errorMessage.slice(0, 1000),
      processedAt: Temporal.Now.instant().toString(),
    });
  }
}
