import { createHmac, timingSafeEqual } from "node:crypto";

const PREVIEW_ACCESS_TTL_MS = 60 * 60 * 1_000;

interface PreviewAccessPayload {
  projectId: string;
  userId: string;
  expiresAt: number;
}

export function createPreviewAccess(
  projectId: string,
  userId: string,
  secret: string,
  now = Date.now(),
) {
  const payload = Buffer.from(
    JSON.stringify({
      projectId,
      userId,
      expiresAt: now + PREVIEW_ACCESS_TTL_MS,
    } satisfies PreviewAccessPayload),
  ).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyPreviewAccess(
  token: string,
  projectId: string,
  secret: string,
  now = Date.now(),
) {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return;

  const expected = Buffer.from(sign(payload, secret));
  const received = Buffer.from(signature);
  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  ) {
    return;
  }

  try {
    const access = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as PreviewAccessPayload;
    if (access.projectId !== projectId || access.expiresAt <= now) return;
    return access;
  } catch {
    return;
  }
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
