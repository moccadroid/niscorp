# Lyceum, as it is deployed: one container for the app, one for Postgres
# (docker-compose.yml). The build context is the REPO ROOT — lyceum builds on
# the workspace packages — so run it through compose, or:
#   docker build -f apps/lab/lyceum/Dockerfile .
# The context filter is Dockerfile.dockerignore, beside this file.
FROM node:22-slim

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo

# Dependencies first, so a source edit does not reinstall them.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
# The root `prepare` script; with no git in the image it skips.
COPY scripts/install-hooks.mts ./scripts/
COPY packages ./packages
COPY apps/lab/lyceum ./apps/lab/lyceum
RUN pnpm install --frozen-lockfile --filter "lyceum..."

# The workspace packages lyceum imports ship as built dist/, then the terminal.
RUN pnpm --filter "lyceum^..." run build && pnpm --filter lyceum run build

WORKDIR /repo/apps/lab/lyceum
ENV NODE_ENV=production
ENV PORT=8796
# Only the web port: a host that routes by EXPOSE (Railway) must not pick the
# SSH door's. docker-compose publishes 2222 itself.
EXPOSE 8796
CMD ["pnpm", "serve"]
