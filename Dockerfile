# Evermind — production image.
#
# Three stages: install with bun (the toolchain the repo and CI use), build with
# bun, then run the compiled server on Node. The build emits `.next/standalone`,
# a self-contained Node program, so the final image needs neither bun nor the
# 500-odd MB of `node_modules` that produced it.
#
# The runner is Node rather than bun on purpose: Next's standalone `server.js`
# is written against Node's runtime, and nothing is being compiled by then, so
# there is nothing to gain from bun and a compatibility surface to lose. If you
# would rather keep one runtime, swap the base image for `oven/bun:1.4.0-alpine`
# and the command for `["bun", "server.js"]`.
#
# Both bases are Alpine so they share a libc: the native builds of SWC,
# lightningcss and Tailwind's oxide are musl ones, and mixing them with a glibc
# runner is how you get a binary that will not load.
#
# Build:
#   docker build \
#     --build-arg NEXT_PUBLIC_SUPABASE_URL=https://yourproject.supabase.co \
#     --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
#     -t evermind .
#
# Or let compose do it: `docker compose --env-file .env.local up --build`.

# --- install -----------------------------------------------------------------
# Its own stage so a source-only change does not reinstall anything: this layer
# is cached against package.json and the lockfile alone.
FROM oven/bun:1.4.0-alpine AS deps
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# --- build -------------------------------------------------------------------
FROM oven/bun:1.4.0-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# `NEXT_PUBLIC_*` values are substituted into the JavaScript during the build,
# not read from the environment when the server starts, so they have to be here.
# Whatever you pass ends up readable in the browser bundle — which is correct for
# these two and correct for nothing else. The service role key in particular must
# never be a build argument; it belongs to the runtime environment.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

# Fail here rather than ship an image that builds, starts, and then cannot reach
# Supabase — including a Content-Security-Policy with no Supabase origin in it,
# which fails as a blocked request in the browser console and nowhere else.
RUN test -n "$NEXT_PUBLIC_SUPABASE_URL" \
  || (echo "Missing build arg NEXT_PUBLIC_SUPABASE_URL" >&2; false)
RUN test -n "$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  || (echo "Missing build arg NEXT_PUBLIC_SUPABASE_ANON_KEY" >&2; false)

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Switches `next.config.mjs` to `output: "standalone"`. Off by default so the
# Vercel deployment keeps the build output it already has.
ENV BUILD_STANDALONE=1

RUN bun run build

# --- run ---------------------------------------------------------------------
FROM node:22-alpine AS run
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# Docker sets HOSTNAME to the container id, and the standalone server binds to
# whatever HOSTNAME says, so it has to be overridden to reach every interface.
ENV HOSTNAME=0.0.0.0

# `node` (uid 1000) ships with the image. Nothing here needs root.
USER node

# Standalone carries its own pruned node_modules and server.js, but neither the
# static assets nor `public/`, which are copied separately.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

EXPOSE 3000

# "/" redirects to /preview or /dashboard depending on the session; wget follows
# it, so a healthy container answers either way. Signed out is not unhealthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3000/ || exit 1

CMD ["node", "server.js"]
