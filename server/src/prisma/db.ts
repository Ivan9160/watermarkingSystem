
import "dotenv/config";
import "temporal-polyfill/full/global";
import postgres from "@prisma/orm-postgres/runtime";
import { contractFromJson } from "@prisma/orm-postgres/static";
import type { Contract } from "./contract.d.js";
import contractJson from "./contract.json" with { type: "json" };

if (!process.env["DATABASE_URL"]) {
    throw new Error("DATABASE_URL is not set. Add it to the server .env file.");
}

const contract = contractFromJson<Contract>(contractJson);

export const db = postgres<Contract>({
    contract,
    url: process.env["DATABASE_URL"],
});
