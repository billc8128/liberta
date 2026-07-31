import path from "node:path";

import { readMigrationFiles } from "drizzle-orm/migrator";
import postgres from "postgres";

import { postgresJsUrl } from "@/server/db/url";

export async function migrateDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required to run migrations.");

  const client = postgres(postgresJsUrl(databaseUrl), { max: 1, prepare: false });

  try {
    const migrations = readMigrationFiles({
      migrationsFolder: path.join(process.cwd(), "drizzle"),
    });

    await client`
      CREATE TABLE IF NOT EXISTS public.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash TEXT NOT NULL,
        created_at BIGINT
      )
    `;

    const [lastMigration] = await client`
      SELECT created_at
      FROM public.__drizzle_migrations
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const lastCreatedAt = Number(lastMigration?.created_at ?? 0);

    for (const migration of migrations) {
      if (migration.folderMillis <= lastCreatedAt) continue;

      await client.begin(async (transaction) => {
        for (const statement of migration.sql) {
          await transaction.unsafe(statement);
        }

        await transaction`
          INSERT INTO public.__drizzle_migrations (hash, created_at)
          VALUES (${migration.hash}, ${migration.folderMillis})
        `;
      });
    }
  } finally {
    await client.end();
  }
}
