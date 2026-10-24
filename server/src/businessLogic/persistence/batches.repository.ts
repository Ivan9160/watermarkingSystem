import { Injectable } from '@nestjs/common';

import { db } from '../../prisma/db.ts';
import { Temporal } from 'temporal-polyfill';

export type BatchStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

@Injectable()
export class BatchesRepository {
  findOrganizationByAllegroUserId(allegroUserId: number) {
    return db.orm.public.Organization.where({ allegroUserId }).first();
  }

  create(data: {
    organizationId: string;
    watermarkConfig: unknown;
    totalImages: number;
  }) {
    return db.orm.public.Batch.create({ ...data, status: 'QUEUED' } as any);
  }

  findById(id: string) {
    return db.orm.public.Batch.where({ id }).first();
  }

  async findOwned(allegroUserId: number, batchId: string) {
    const organization = await this.findOrganizationByAllegroUserId(allegroUserId);
    if (!organization) return null;

    return db.orm.public.Batch
      .where({ id: batchId, organizationId: organization.id })
      .first();
  }

  async markProcessing(id: string): Promise<void> {
    await db.orm.public.Batch
      .where({ id, status: 'QUEUED' })
      .update({ status: 'PROCESSING' });
  }

  async markFinished(id: string, status: Extract<BatchStatus, 'COMPLETED' | 'FAILED'>) {
    await db.orm.public.Batch
      .where({ id })
      .update({ status, completedAt: Temporal.Now.instant() });
  }

  async delete(id: string): Promise<void> {
    await db.orm.public.Batch.where({ id }).delete();
  }
}
