#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/6fb44ed66ea04bd4ce0147677df96bc6d19da32ad6b1719f100b5c399cfc2a25/contract';
import startContract from '../../snapshots/6fb44ed66ea04bd4ce0147677df96bc6d19da32ad6b1719f100b5c399cfc2a25/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/dbec89359d8a7141f39ea73f0506ba11e79012e042b2c182cbf90fb68d7dae14/contract';
import endContract from '../../snapshots/dbec89359d8a7141f39ea73f0506ba11e79012e042b2c182cbf90fb68d7dae14/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'image_jobs',
        column: col('watermark_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
