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
| Job transport | Postgres `agent_runs` | Durable run scheduling and web/worker separation |
| Deployment | AnyHost | One application runtime supervising separate web and worker processes |
| Live updates | Server-Sent Events + Postgres LISTEN/NOTIFY | One-way project state stream with browser reconnection |

## Runtime model

HTTP handlers authenticate the user and persist the requested change as a queued `agent_run`. A separate worker claims queued rows and performs the Pi/Daytona work. Long-running coding sessions stay outside the request lifecycle.

Each project has one durable Pi JSONL session stored in Postgres. The worker restores it for the next turn and atomically commits the updated Pi session, final assistant message, run status, and project status. A failed or interrupted turn therefore never advances the durable conversation.

The browser opens one authenticated SSE connection for project state. Web and worker processes publish lightweight project ids with Postgres `NOTIFY`; each web process owns one `LISTEN` connection and fans updates out to its connected browsers. The initial SSE event always contains the current database state, so native EventSource reconnection is sufficient and the UI does not poll.

For the first deployable vertical slice, `pnpm start` applies committed Drizzle migrations and then runs a small process supervisor that starts both `next start` and the worker inside one AnyHost application runtime. The process boundary is explicit, so the worker can move to its own AnyHost service later without changing the domain model.

## Background-run lifecycle

The next runtime increment keeps the same single Pi coding agent and adds run control at the worker boundary:

- Claim: a worker atomically changes a queued run to running and records `lease_owner`, `lease_expires_at`, `heartbeat_at`, and `attempt`.
- Heartbeat: while Pi or Daytona is active, the worker extends a short lease. A process crash naturally lets the lease expire.
- Recovery: a reaper returns an expired running row to queued when its attempt budget remains. Because the Pi session advances only in the final completion transaction, the same prompt can safely restart from the previous completed turn. The incomplete assistant message and attempt events are replaced for the retry.
- Sandbox recovery: Daytona files survive worker failure, so a retry inspects and continues from the actual workspace rather than assuming rollback. Tool calls are at-least-once; the agent must verify current files before repeating a command.
- Cancellation: a cancel endpoint records `cancel_requested_at`. One `AbortSignal` flows through Pi and the Daytona tool bridge; the owning worker stops the active command, marks the run cancelled, and leaves the last completed Pi session untouched.
- Exception takeover: an expected provider or sandbox failure is recorded on the current attempt and retried through the same queue/lease path. Exhausted attempts become failed and remain visible to the user with a retry action.
- Shutdown: SIGTERM stops new claims, requests cancellation of the active operation, and releases or lets its lease expire. Another worker resumes it without a separate coordinator.

This uses database state as the authority. SSE only reports that state; disconnecting a browser never cancels or owns the background task.

## Security boundary

- Ark credentials remain in the Project L server/worker and are never copied into a project sandbox.
- Daytona sandboxes are private. The browser receives only an expiring signed preview URL.
- Project creation and every project API require an authenticated Better Auth session; ownership is checked before state or preview URLs are returned.
- Every sandbox is labelled with its Project L project id and is addressed by its stored Daytona id, never by a user-provided id.
- Pi receives a fixed virtual project root. Its file tools reject paths outside that root before calling Daytona.
- Tool output and lifecycle changes are persisted as agent run events; secrets and raw environment values are not.
- Provider keys stay in the worker environment and are never stored in run rows or copied to the sandbox.

## Adapter contracts

The product domain does not import vendor clients directly. `SandboxRuntime` owns environment lifecycle and remote I/O. `AgentRuntime` owns a single streamed coding turn. This keeps Daytona, Pi, and the model provider replaceable without changing route handlers or UI state.
