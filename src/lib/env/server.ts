import "server-only";

import { z } from "zod";

const databaseSchema = z.object({
  DATABASE_URL: z.string().url(),
});

const authSchema = databaseSchema.extend({
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
});

const queueSchema = z.object({
  REDIS_URL: z.string().url(),
  REDIS_KEY_PREFIX: z.string().min(1),
});

const daytonaSchema = z.object({
  DAYTONA_API_KEY: z.string().min(1),
  DAYTONA_API_URL: z.string().url().optional(),
  DAYTONA_TARGET: z.string().min(1).optional(),
});

const arkSchema = z.object({
  ARK_API_KEY: z.string().min(1),
  ARK_BASE_URL: z
    .string()
    .url()
    .default("https://ark.cn-beijing.volces.com/api/plan/v3"),
  ARK_MODEL_ID: z.string().min(1).default("kimi-k3-260701"),
});

export function databaseEnv() {
  return databaseSchema.parse(process.env);
}

export function daytonaEnv() {
  return daytonaSchema.parse(process.env);
}

export function authEnv() {
  return authSchema.parse(process.env);
}

export function queueEnv() {
  return queueSchema.parse(process.env);
}

export function arkEnv() {
  return arkSchema.parse(process.env);
}

export function runtimeReadiness() {
  return {
    database: databaseSchema.safeParse(process.env).success,
    auth: authSchema.safeParse(process.env).success,
    queue: queueSchema.safeParse(process.env).success,
    sandbox: daytonaSchema.safeParse(process.env).success,
    model: arkSchema.safeParse(process.env).success,
  };
}
