import { currentSession } from "@/lib/auth/session";
import {
  prepareProjectPreview,
  ProjectPreviewNotReadyError,
} from "@/server/projects/preview";
import { ProjectAccessError } from "@/server/projects/service";
import {
  isRewritablePreviewContent,
  projectPreviewProxyPath,
  rewritePreviewText,
} from "@/server/sandbox/preview-document";

interface PreviewProxyContext {
  params: Promise<{ projectId: string; path?: string[] }>;
}

async function proxyPreview(request: Request, context: PreviewProxyContext) {
  const session = await currentSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  try {
    const { projectId, path = [] } = await context.params;
    const previewUrl = await prepareProjectPreview(session.user.id, projectId);
    const target = new URL(
      path.map((segment) => encodeURIComponent(segment)).join("/"),
      previewUrl.endsWith("/") ? previewUrl : `${previewUrl}/`,
    );
    target.search = new URL(request.url).search;

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
    });
    for (const name of ["accept-ranges", "content-range"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }

    if (isRewritablePreviewContent(contentType)) {
      const content = rewritePreviewText(
        await upstream.text(),
        contentType,
        projectPreviewProxyPath(projectId),
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
