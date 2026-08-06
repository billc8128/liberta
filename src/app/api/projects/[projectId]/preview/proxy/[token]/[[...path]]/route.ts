import { authEnv } from "@/lib/env/server";
import { verifyPreviewAccess } from "@/server/projects/preview-access";
import {
  prepareProjectPreview,
  ProjectPreviewNotReadyError,
} from "@/server/projects/preview";
import { ProjectAccessError } from "@/server/projects/service";
import {
  isRewritablePreviewContent,
  previewUpstreamUrl,
  projectPreviewProxyPath,
  rewritePreviewText,
} from "@/server/sandbox/preview-document";

interface PreviewProxyContext {
  params: Promise<{ projectId: string; token: string; path?: string[] }>;
}

async function proxyPreview(request: Request, context: PreviewProxyContext) {
  try {
    const { projectId, token, path = [] } = await context.params;
    const access = verifyPreviewAccess(
      token,
      projectId,
      authEnv().BETTER_AUTH_SECRET,
    );
    if (!access) return new Response("Preview link expired", { status: 401 });

    const previewUrl = await prepareProjectPreview(access.userId, projectId);
    const target = previewUpstreamUrl(
      previewUrl,
      path,
      new URL(request.url).search,
    );

    const headers = new Headers({
      "X-Daytona-Skip-Preview-Warning": "true",
    });
    for (const name of ["accept", "accept-language", "content-type", "range"]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }

    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      cache: "no-store",
    });
    const contentType = upstream.headers.get("content-type") ?? "";
    const responseHeaders = new Headers({
      "Content-Type": contentType || "application/octet-stream",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Range",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
      "Cross-Origin-Resource-Policy": "cross-origin",
    });
    for (const name of ["accept-ranges", "content-range"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }

    if (isRewritablePreviewContent(contentType)) {
      const content = rewritePreviewText(
        await upstream.text(),
        contentType,
        projectPreviewProxyPath(projectId, token),
      );
      return new Response(request.method === "HEAD" ? null : content, {
        status: upstream.status,
        headers: responseHeaders,
      });
    }

    return new Response(request.method === "HEAD" ? null : upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    if (error instanceof ProjectAccessError) {
      return new Response("Project not found", { status: 404 });
    }
    if (error instanceof ProjectPreviewNotReadyError) {
      return new Response("Preview not ready", { status: 409 });
    }
    console.error("Preview proxy failed", error);
    return new Response("Preview unavailable", { status: 503 });
  }
}

export {
  proxyPreview as DELETE,
  proxyPreview as GET,
  proxyPreview as HEAD,
  proxyPreview as OPTIONS,
  proxyPreview as PATCH,
  proxyPreview as POST,
  proxyPreview as PUT,
};
