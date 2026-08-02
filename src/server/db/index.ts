import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { databaseEnv } from "@/lib/env/server";
import * as schema from "@/server/db/schema";
import { postgresJsUrl } from "@/server/db/url";

let client: ReturnType<typeof postgres> | undefined;

export function databaseClient() {
  if (!client) {
    client = postgres(postgresJsUrl(databaseEnv().DATABASE_URL), {
      max: 10,
      prepare: false,
    });
  }

  return client;
}

export function database() {
  return drizzle(databaseClient(), { schema });
}
