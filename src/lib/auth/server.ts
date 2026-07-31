import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth/minimal";

import { authEnv } from "@/lib/env/server";
import { database } from "@/server/db";
import * as schema from "@/server/db/schema";

function createAuth() {
  const env = authEnv();
  return betterAuth({
    appName: "Project L",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(database(), {
      provider: "pg",
      schema,
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
    },
  });
}

type AuthInstance = ReturnType<typeof createAuth>;
let instance: AuthInstance | undefined;

export function auth(): AuthInstance {
  instance ??= createAuth();
  return instance;
}
