#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/c40887dab6004d51702f1d61a0f515733a13b559d92f61d89fb5571d93612b5d/contract';
import endContract from '../../snapshots/c40887dab6004d51702f1d61a0f515733a13b559d92f61d89fb5571d93612b5d/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/dbec89359d8a7141f39ea73f0506ba11e79012e042b2c182cbf90fb68d7dae14/contract';
import startContract from '../../snapshots/dbec89359d8a7141f39ea73f0506ba11e79012e042b2c182cbf90fb68d7dae14/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropConstraint({
        schema: 'public',
        table: 'image_jobs',
        constraint: 'image_jobs_original_key_key',
      }),
      this.addColumnWithTemporaryDefault({
        schema: 'public',
        table: 'image_jobs',
        column: 'offer_image_index',
        type: 'int4',
        temporaryDefault: sql`0`,
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
