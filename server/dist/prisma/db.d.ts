import "dotenv/config";
import "temporal-polyfill/full/global";
import type { Contract } from "./contract.d.js";
export declare const db: import("@prisma/orm-postgres/runtime").PostgresClient<Contract>;
