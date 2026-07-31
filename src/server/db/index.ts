import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { databaseEnv } from "@/lib/env/server";
import * as schema from "@/server/db/schema";

let client: ReturnType<typeof postgres> | undefined;

export function database() {
  if (!client) {
    client = postgres(databaseEnv().DATABASE_URL, {
      max: 10,
      prepare: false,
    });
  }

  return drizzle(client, { schema });
}
