import path from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { postgresJsUrl } from "@/server/db/url";

export async function migrateDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required to run migrations.");

  const client = postgres(postgresJsUrl(databaseUrl), { max: 1, prepare: false });

  try {
    await migrate(drizzle(client), {
      migrationsFolder: path.join(process.cwd(), "drizzle"),
      migrationsSchema: "public",
    });
  } finally {
    await client.end();
  }
}
