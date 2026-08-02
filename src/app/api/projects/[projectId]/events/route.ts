import { currentSession } from "@/lib/auth/session";
import { toProjectStateDto } from "@/server/projects/dto";
import {
  getOwnedProject,
  getProjectState,
  ProjectAccessError,
} from "@/server/projects/service";
import { subscribeToProjectUpdates } from "@/server/projects/updates";

interface ProjectRouteContext {
  params: Promise<{ projectId: string }>;
}

const encoder = new TextEncoder();

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: ProjectRouteContext) {
  const session = await currentSession();
  if (!session) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const { projectId } = await context.params;
    await getOwnedProject(session.user.id, projectId);

    let closeStream = () => {};
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false;
        let pipeline = Promise.resolve();
        let unsubscribe = () => {};
        const heartbeat = setInterval(() => {
          if (!closed) controller.enqueue(encoder.encode(": keepalive\n\n"));
        }, 15_000);

        const close = () => {
          if (closed) return;
          closed = true;
          clearInterval(heartbeat);
          unsubscribe();
          try {
            controller.close();
          } catch {
            // The browser may already have closed the stream.
          }
        };
        closeStream = close;

        const sendState = async () => {
          if (closed) return;
          const state = await getProjectState(session.user.id, projectId);
          controller.enqueue(
            encoder.encode(
              `event: state\ndata: ${JSON.stringify(toProjectStateDto(state))}\n\n`,
            ),
          );
        };

        const queueState = () => {
          pipeline = pipeline.then(sendState).catch(() => close());
        };

        try {
          unsubscribe = await subscribeToProjectUpdates(projectId, queueState);
        } catch (error) {
          close();
          throw error;
        }

        request.signal.addEventListener("abort", close, {
          once: true,
        });
        controller.enqueue(encoder.encode("retry: 1000\n\n"));
        await sendState();
      },
      cancel() {
        closeStream();
      },
    });

    return new Response(stream, {
      headers: {
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "content-type": "text/event-stream; charset=utf-8",
        "x-accel-buffering": "no",
      },
    });
  } catch (error) {
    if (error instanceof ProjectAccessError) {
      return Response.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
    }
    console.error("Project event stream failed", error);
    return Response.json({ error: "PROJECT_EVENTS_FAILED" }, { status: 503 });
  }
}
