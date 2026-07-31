FROM node:22-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /app

FROM base AS dependencies

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM base AS runtime

ENV NODE_ENV="production"
ENV PORT="8080"
ENV HOSTNAME="0.0.0.0"

COPY --from=build /app ./

EXPOSE 8080

CMD ["pnpm", "start"]
