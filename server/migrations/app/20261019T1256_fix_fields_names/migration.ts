#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/408368445b9c7f522f531be844b9016be20817698fc8850cf0e6d7edbdbf77e2/contract';
import startContract from '../../snapshots/408368445b9c7f522f531be844b9016be20817698fc8850cf0e6d7edbdbf77e2/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/c302d024c78e2e6fe5b4734002567d2660e4dcb096d9874afe0ef675e9dce3a1/contract';
import endContract from '../../snapshots/c302d024c78e2e6fe5b4734002567d2660e4dcb096d9874afe0ef675e9dce3a1/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropColumn({ schema: 'public', table: 'batches', column: 'completedAt' }),
      this.dropColumn({ schema: 'public', table: 'batches', column: 'createdAt' }),
      this.dropColumn({ schema: 'public', table: 'batches', column: 'watermarkConfig' }),
      this.dropConstraint({
        schema: 'public',
        table: 'batches',
        constraint: 'batches_organizationId_fkey',
        kind: 'foreignKey',
      }),
      this.dropIndex({
        schema: 'public',
        table: 'batches',
        index: 'batches_organizationId_idx_2e17ef41',
      }),
      this.dropIndex({
        schema: 'public',
        table: 'batches',
        index: 'batches_organizationId_status_idx_21af5e82',
      }),
      this.dropColumn({ schema: 'public', table: 'batches', column: 'organizationId' }),
      this.dropColumn({ schema: 'public', table: 'image_jobs', column: 'createdAt' }),
      this.dropColumn({ schema: 'public', table: 'image_jobs', column: 'errorMessage' }),
      this.dropColumn({ schema: 'public', table: 'image_jobs', column: 'imageIndex' }),
      this.dropColumn({ schema: 'public', table: 'image_jobs', column: 'outputUrl' }),
      this.dropColumn({ schema: 'public', table: 'image_jobs', column: 'processedAt' }),
      this.dropColumn({ schema: 'public', table: 'image_jobs', column: 'productOfferId' }),
      this.dropColumn({ schema: 'public', table: 'image_jobs', column: 'sourceUrl' }),
      this.dropConstraint({
        schema: 'public',
        table: 'image_jobs',
        constraint: 'image_jobs_batchId_fkey',
        kind: 'foreignKey',
      }),
      this.dropIndex({
        schema: 'public',
        table: 'image_jobs',
        index: 'image_jobs_batchId_idx_84d4b0b9',
      }),
      this.dropIndex({
        schema: 'public',
        table: 'image_jobs',
        index: 'image_jobs_batchId_status_idx_a1ac997b',
      }),
      this.dropColumn({ schema: 'public', table: 'image_jobs', column: 'batchId' }),
      this.dropConstraint({
        schema: 'public',
        table: 'image_jobs',
        constraint: 'image_jobs_storageKey_key',
      }),
      this.dropColumn({ schema: 'public', table: 'image_jobs', column: 'storageKey' }),
      this.dropColumn({ schema: 'public', table: 'organizations', column: 'createdAt' }),
      this.dropColumn({ schema: 'public', table: 'organizations', column: 'updatedAt' }),
      this.dropConstraint({
        schema: 'public',
        table: 'organizations',
        constraint: 'organizations_allegroUserId_key',
      }),
      this.dropColumn({ schema: 'public', table: 'organizations', column: 'allegroUserId' }),
      this.addColumn({
        schema: 'public',
        table: 'batches',
        column: col('completed_at', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-temporal@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'batches',
        column: col('created_at', 'timestamptz', {
          notNull: true,
          default: fn(sql`now()`),
          codecRef: { codecId: 'pg/timestamptz-temporal@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'image_jobs',
        column: col('created_at', 'timestamptz', {
          notNull: true,
          default: fn(sql`now()`),
          codecRef: { codecId: 'pg/timestamptz-temporal@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'image_jobs',
        column: col('error_message', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'image_jobs',
        column: col('output_url', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'image_jobs',
        column: col('processed_at', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-temporal@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'organizations',
        column: col('created_at', 'timestamptz', {
          notNull: true,
          default: fn(sql`now()`),
          codecRef: { codecId: 'pg/timestamptz-temporal@1' },
        }),
      }),
      this.addRequiredColumnToEmptyTable({
        schema: 'public',
        table: 'batches',
        column: 'organization_id',
        type: 'text',
      }),
      this.addColumnWithTemporaryDefault({
        schema: 'public',
        table: 'batches',
        column: 'updated_at',
        type: 'timestamptz',
        temporaryDefault: sql`'epoch'`,
      }),
      this.addColumnWithTemporaryDefault({
        schema: 'public',
        table: 'batches',
        column: 'watermark_config',
        type: 'json',
        temporaryDefault: sql`'{}'::json`,
      }),
      this.addRequiredColumnToEmptyTable({
        schema: 'public',
        table: 'image_jobs',
        column: 'batch_id',
        type: 'text',
      }),
      this.addColumnWithTemporaryDefault({
        schema: 'public',
        table: 'image_jobs',
        column: 'image_index',
        type: 'int4',
        temporaryDefault: sql`0`,
      }),
      this.addColumnWithTemporaryDefault({
        schema: 'public',
        table: 'image_jobs',
        column: 'product_offer_id',
        type: 'text',
        temporaryDefault: sql`''`,
      }),
      this.addColumnWithTemporaryDefault({
        schema: 'public',
        table: 'image_jobs',
        column: 'source_url',
        type: 'text',
        temporaryDefault: sql`''`,
      }),
      this.addRequiredColumnToEmptyTable({
        schema: 'public',
        table: 'image_jobs',
        column: 'storage_key',
        type: 'text',
      }),
      this.addRequiredColumnToEmptyTable({
        schema: 'public',
        table: 'organizations',
        column: 'allegro_user_id',
        type: 'int4',
      }),
      this.addColumnWithTemporaryDefault({
        schema: 'public',
        table: 'organizations',
        column: 'updated_at',
        type: 'timestamptz',
        temporaryDefault: sql`'epoch'`,
      }),
      this.addUnique({
        schema: 'public',
        table: 'image_jobs',
        constraint: 'image_jobs_storage_key_key',
        columns: ['storage_key'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'organizations',
        constraint: 'organizations_allegro_user_id_key',
        columns: ['allegro_user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'batches',
        index: 'batches_organization_id_idx_1a5cd3f5',
        columns: ['organization_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'batches',
        index: 'batches_organization_id_status_idx_5a4ed970',
        columns: ['organization_id', 'status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'image_jobs',
        index: 'image_jobs_batch_id_idx_49ba28fa',
        columns: ['batch_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'image_jobs',
        index: 'image_jobs_batch_id_status_idx_66fc6971',
        columns: ['batch_id', 'status'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'batches',
        foreignKey: {
          name: 'batches_organization_id_fkey',
          columns: ['organization_id'],
          references: { schema: 'public', table: 'organizations', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'image_jobs',
        foreignKey: {
          name: 'image_jobs_batch_id_fkey',
          columns: ['batch_id'],
          references: { schema: 'public', table: 'batches', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
