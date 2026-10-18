#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/16731d46859f3aa73d422cdf30aa4fd82d058871b1033154f3dd87dd8715f7e4/contract';
import endContract from '../../snapshots/16731d46859f3aa73d422cdf30aa4fd82d058871b1033154f3dd87dd8715f7e4/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/5724c69b3db9f143d24cbd45502e23d6ba77d239b12bb9182028cee13556f036/contract';
import startContract from '../../snapshots/5724c69b3db9f143d24cbd45502e23d6ba77d239b12bb9182028cee13556f036/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumnWithTemporaryDefault({
        schema: 'public',
        table: 'image_jobs',
        column: 'imageIndex',
        type: 'int4',
        temporaryDefault: sql`0`,
      }),
      this.addColumnWithTemporaryDefault({
        schema: 'public',
        table: 'image_jobs',
        column: 'productOfferId',
        type: 'text',
        temporaryDefault: sql`''`,
      }),
      this.addRequiredColumnToEmptyTable({
        schema: 'public',
        table: 'image_jobs',
        column: 'storageKey',
        type: 'text',
      }),
      this.addUnique({
        schema: 'public',
        table: 'image_jobs',
        constraint: 'image_jobs_storageKey_key',
        columns: ['storageKey'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
