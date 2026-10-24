#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/005f5b81f32dbf3126845868189d115e746af44d11e1d3b758dccecf7b45f0b4/contract';
import startContract from '../../snapshots/005f5b81f32dbf3126845868189d115e746af44d11e1d3b758dccecf7b45f0b4/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/6fb44ed66ea04bd4ce0147677df96bc6d19da32ad6b1719f100b5c399cfc2a25/contract';
import endContract from '../../snapshots/6fb44ed66ea04bd4ce0147677df96bc6d19da32ad6b1719f100b5c399cfc2a25/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [this.dropNotNull({ schema: 'public', table: 'image_jobs', column: 'storage_key' })];
  }
}

MigrationCLI.run(import.meta.url, M);
