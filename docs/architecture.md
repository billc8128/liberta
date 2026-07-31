# Project L architecture

Status: accepted for the first production vertical slice.

## Product boundary

Project L turns a conversation into a running website. Each project owns one isolated coding environment. The interface has two durable surfaces only: the conversation and the real site preview.

The first complete path is:

1. Create a project from a user prompt.
2. Provision a private Daytona sandbox.
3. Run a Pi SDK session in the Project L worker.
4. Delegate Pi file and command tools to that Daytona sandbox.
5. Start the generated site's development server in a persistent sandbox session.
6. Embed a short-lived signed Daytona preview URL in the right-hand canvas.

There is no generated example site, fake activity feed, or synthetic agent response before the user starts a run.

## Chosen components

| Concern | Choice | Boundary |
| --- | --- | --- |
| Web application | Next.js, React, TypeScript | UI, route handlers, server rendering |
| Authentication | Better Auth | Email/password sessions and ownership boundary |
| Agent runtime | Pi SDK | Conversation loop, model calls, coding tools, session state |
| Model | Volcengine Ark Agent Plan | OpenAI-compatible API through a Pi provider registration |
| Sandbox | Daytona | Isolated filesystem, command execution, persistent dev server, signed preview |
| Product database | AnyHost Postgres | Projects, messages, agent runs, durable events |
| Job transport | BullMQ on AnyHost Redis | Durable run scheduling, retries, and web/worker separation |
| Deployment | AnyHost | One application runtime supervising separate web and worker processes |

## Runtime model

HTTP handlers authenticate the user, persist the requested change, and enqueue only an `agentRunId`. A separate BullMQ worker loads authoritative project state from Postgres and performs the Pi/Daytona work. This makes retries idempotent and keeps long-running coding sessions outside the request lifecycle.

For the first deployable vertical slice, `pnpm start` applies committed Drizzle migrations and then runs a small process supervisor that starts both `next start` and the worker inside one AnyHost application runtime. The process boundary is already explicit, so the worker can move to its own AnyHost service later without changing the queue or domain model.

## Security boundary

- Ark credentials remain in the Project L server/worker and are never copied into a project sandbox.
- Daytona sandboxes are private. The browser receives only an expiring signed preview URL.
- Project creation and every project API require an authenticated Better Auth session; ownership is checked before state or preview URLs are returned.
- Every sandbox is labelled with its Project L project id and is addressed by its stored Daytona id, never by a user-provided id.
- Pi receives a fixed virtual project root. Its file tools reject paths outside that root before calling Daytona.
- Tool output and lifecycle changes are persisted as agent run events; secrets and raw environment values are not.
- Queue payloads contain only the run id. Provider keys stay in the worker environment and are never placed in Redis or copied to the sandbox.

## Adapter contracts

The product domain does not import vendor clients directly. `SandboxRuntime` owns environment lifecycle and remote I/O. `AgentRuntime` owns a single streamed coding turn. This keeps Daytona, Pi, and the model provider replaceable without changing route handlers or UI state.
