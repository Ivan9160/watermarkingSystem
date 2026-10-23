#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/005f5b81f32dbf3126845868189d115e746af44d11e1d3b758dccecf7b45f0b4/contract';
import endContract from '../../snapshots/005f5b81f32dbf3126845868189d115e746af44d11e1d3b758dccecf7b45f0b4/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/c302d024c78e2e6fe5b4734002567d2660e4dcb096d9874afe0ef675e9dce3a1/contract';
import startContract from '../../snapshots/c302d024c78e2e6fe5b4734002567d2660e4dcb096d9874afe0ef675e9dce3a1/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'image_jobs',
        column: col('original_key', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'image_jobs',
        column: col('output_key', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumnWithTemporaryDefault({
        schema: 'public',
        table: 'batches',
        column: 'total_images',
        type: 'int4',
        temporaryDefault: sql`0`,
      }),
      this.addUnique({
        schema: 'public',
        table: 'image_jobs',
        constraint: 'image_jobs_original_key_key',
        columns: ['original_key'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'image_jobs',
        constraint: 'image_jobs_output_key_key',
        columns: ['output_key'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
