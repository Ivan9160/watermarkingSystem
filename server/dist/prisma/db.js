import "dotenv/config";
import "temporal-polyfill/full/global";
import postgres from "@prisma/orm-postgres/runtime";
import contractJson from "./contract.json" with { type: "json" };
if (!process.env["DATABASE_URL"]) {
    throw new Error("DATABASE_URL is not set. Add it to the server .env file.");
}
export const db = postgres({
    contractJson,
    url: process.env["DATABASE_URL"],
});
//# sourceMappingURL=db.js.map