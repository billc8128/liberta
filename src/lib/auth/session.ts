import "server-only";

import { headers } from "next/headers";

import { auth } from "@/lib/auth/server";

export async function currentSession() {
  return auth().api.getSession({ headers: await headers() });
}
