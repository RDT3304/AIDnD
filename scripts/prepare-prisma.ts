import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: resolve(process.cwd(), ".env"), override: false });

const allowedProviders = new Set(["sqlite", "postgresql"]);

const desiredProvider = (process.env.DATABASE_PROVIDER ?? "sqlite").toLowerCase();
if (!allowedProviders.has(desiredProvider)) {
  throw new Error(
    `Unsupported DATABASE_PROVIDER="${process.env.DATABASE_PROVIDER}". Allowed: sqlite, postgresql.`
  );
}

const schemaPath = resolve(process.cwd(), "prisma", "schema.prisma");
const rawSchema = readFileSync(schemaPath, "utf8");
const schema = rawSchema.replace(/^\uFEFF/, "");

const providerPattern = /provider\s*=\s*"(sqlite|postgresql)"/;
if (!providerPattern.test(schema)) {
  throw new Error("Could not find datasource provider declaration in prisma/schema.prisma");
}

const nextSchema = schema.replace(providerPattern, `provider = "${desiredProvider}"`);

if (nextSchema !== rawSchema) {
  writeFileSync(schemaPath, nextSchema, { encoding: "utf8" });
}