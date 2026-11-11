#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/7ee56c174c68b3c7562f7ef79a2f7c12407afd04c1e54782d87e977a955cae3e/contract';
import endContract from '../../snapshots/7ee56c174c68b3c7562f7ef79a2f7c12407afd04c1e54782d87e977a955cae3e/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/c40887dab6004d51702f1d61a0f515733a13b559d92f61d89fb5571d93612b5d/contract';
import startContract from '../../snapshots/c40887dab6004d51702f1d61a0f515733a13b559d92f61d89fb5571d93612b5d/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'organizations',
        column: col('invisible_watermark_id', 'character varying(10)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 10 } },
        }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'organizations',
        constraint: 'organizations_invisible_watermark_id_key',
        columns: ['invisible_watermark_id'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
