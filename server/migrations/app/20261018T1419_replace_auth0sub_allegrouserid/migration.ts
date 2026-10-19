#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/16731d46859f3aa73d422cdf30aa4fd82d058871b1033154f3dd87dd8715f7e4/contract';
import startContract from '../../snapshots/16731d46859f3aa73d422cdf30aa4fd82d058871b1033154f3dd87dd8715f7e4/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/408368445b9c7f522f531be844b9016be20817698fc8850cf0e6d7edbdbf77e2/contract';
import endContract from '../../snapshots/408368445b9c7f522f531be844b9016be20817698fc8850cf0e6d7edbdbf77e2/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropConstraint({
        schema: 'public',
        table: 'organizations',
        constraint: 'organizations_auth0Sub_key',
      }),
      this.dropColumn({ schema: 'public', table: 'organizations', column: 'auth0Sub' }),
      this.addRequiredColumnToEmptyTable({
        schema: 'public',
        table: 'organizations',
        column: 'allegroUserId',
        type: 'int4',
      }),
      this.addUnique({
        schema: 'public',
        table: 'organizations',
        constraint: 'organizations_allegroUserId_key',
        columns: ['allegroUserId'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
