#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/5724c69b3db9f143d24cbd45502e23d6ba77d239b12bb9182028cee13556f036/contract';
import endContract from '../../snapshots/5724c69b3db9f143d24cbd45502e23d6ba77d239b12bb9182028cee13556f036/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/a6df283cad14e8cf0215877ea0065c8e77be944469a3398191b0ad995008e518/contract';
import startContract from '../../snapshots/a6df283cad14e8cf0215877ea0065c8e77be944469a3398191b0ad995008e518/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
  sql,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropTable({ schema: 'public', table: 'Batch' }),
      this.dropTable({ schema: 'public', table: 'ImageJob' }),
      this.dropTable({ schema: 'public', table: 'Organization' }),
      this.createTable({
        schema: 'public',
        table: 'batches',
        columns: [
          col('completedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('organizationId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('QUEUED'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('watermarkConfig', 'json', { notNull: true, codecRef: { codecId: 'pg/json@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'batches_status_check_221b8aea',
            sql`"status" IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'image_jobs',
        columns: [
          col('batchId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('errorMessage', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('outputUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('processedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('sourceUrl', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('PENDING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'image_jobs_status_check_8276955c',
            sql`"status" IN ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'organizations',
        columns: [
          col('auth0Sub', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'organizations',
        constraint: 'organizations_auth0Sub_key',
        columns: ['auth0Sub'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'batches',
        index: 'batches_organizationId_idx_2e17ef41',
        columns: ['organizationId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'batches',
        index: 'batches_organizationId_status_idx_21af5e82',
        columns: ['organizationId', 'status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'image_jobs',
        index: 'image_jobs_batchId_idx_84d4b0b9',
        columns: ['batchId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'image_jobs',
        index: 'image_jobs_batchId_status_idx_a1ac997b',
        columns: ['batchId', 'status'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'batches',
        foreignKey: {
          name: 'batches_organizationId_fkey',
          columns: ['organizationId'],
          references: { schema: 'public', table: 'organizations', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'image_jobs',
        foreignKey: {
          name: 'image_jobs_batchId_fkey',
          columns: ['batchId'],
          references: { schema: 'public', table: 'batches', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
