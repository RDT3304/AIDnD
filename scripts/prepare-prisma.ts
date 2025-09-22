import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: resolve(process.cwd(), ".env"), override: false });

const schemaPath = resolve(process.cwd(), "prisma", "schema.prisma");
const rawSchema = readFileSync(schemaPath, "utf8");
const schema = rawSchema.replace(/^\uFEFF/, "");

const providerPattern = /datasource\s+db\s+{[^}]*provider\s*=\s*"(sqlite|postgresql)"[^}]*}/m;
const match = schema.match(providerPattern);
if (!match) {
  throw new Error("Could not find datasource provider declaration in prisma/schema.prisma");
}

let desiredProvider = (process.env.DATABASE_PROVIDER ?? "").toLowerCase();
if (desiredProvider !== "sqlite" && desiredProvider !== "postgresql") {
  const url = (process.env.DATABASE_URL ?? "").toLowerCase();
  if (url.startsWith("file:")) {
    desiredProvider = "sqlite";
  } else if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    desiredProvider = "postgresql";
  } else {
    desiredProvider = "postgresql";
  }
}

const nextSchema = schema.replace(/provider\s*=\s*"(sqlite|postgresql)"/, `provider = "${desiredProvider}"`);

if (nextSchema !== rawSchema) {
  writeFileSync(schemaPath, nextSchema, { encoding: "utf8" });
}
