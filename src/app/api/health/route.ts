import { runtimeReadiness } from "@/lib/env/server";

export function GET() {
  const dependencies = runtimeReadiness();
  const ready = Object.values(dependencies).every(Boolean);

  return Response.json(
    {
      status: ready ? "ready" : "not_ready",
      dependencies,
    },
    { status: ready ? 200 : 503 },
  );
}
