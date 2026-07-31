# Project L

Project L is an agent-first site maker. A project combines a restrained conversation interface, one Pi coding agent, one isolated Daytona environment, and a real browser preview.

## Stack

- Next.js 16, React 19, TypeScript
- Better Auth with email and password for the MVP
- Pi SDK with Volcengine Ark Agent Plan
- Daytona private sandboxes
- Drizzle ORM with AnyHost Postgres
- BullMQ with AnyHost Redis
- AnyHost application hosting for the web process and agent worker

See [docs/architecture.md](./docs/architecture.md) for boundaries and security decisions.

## Local development

Requirements: Node.js 22.19 or newer and pnpm 10.

1. Copy `.env.example` to `.env.local` and provide the database, Redis, auth, Daytona, and Ark credentials.
2. Generate and apply the database migration.
3. Start the web application and worker in separate terminals.

```bash
pnpm db:generate
pnpm db:migrate
pnpm dev
pnpm worker:dev
```

In production, `pnpm start` supervises the Next.js server and BullMQ worker in one AnyHost application runtime. They remain separate processes so agent work never runs inside an HTTP request.

The home screen deliberately disables project creation while any required runtime credential is missing. It never substitutes a mock project or preview.

## Quality gates

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```
