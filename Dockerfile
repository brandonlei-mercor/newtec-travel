# The site ships as an image rather than through a host's own Node buildpack:
# package.json pins pnpm 10.33.0 and .nvmrc pins Node 22.22.3, and a platform
# that supplies a different pnpm fails the install on the lockfile version. This
# way the build that runs in production is the build that runs here.

FROM node:22.22.3-bookworm-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable pnpm
WORKDIR /app

FROM base AS build
# Dependencies resolve from the manifest alone, so editing a component does not
# invalidate the install layer.
COPY package.json pnpm-lock.yaml ./
# Development dependencies stay in the image on purpose: tsx runs the worker and
# the migration script in production, and both are devDependencies.
RUN pnpm install --frozen-lockfile
COPY . .
# Prerendering evaluates src/shared/env.ts, which refuses to load without a
# Duffel token because the site has no fallback pricing. The placeholder below
# gets the build past that assertion; it is not a credential, and it is scoped to
# this one command rather than set as ENV so it stays out of the image metadata.
# The real token arrives from the environment at runtime. APP_ENV keeps its
# "local" default here, so no production check runs against a build-time value.
RUN DUFFEL_ACCESS_TOKEN=placeholder-not-a-credential pnpm build

FROM base AS runtime
ENV NODE_ENV=production
# Next binds 127.0.0.1 by default, which a container platform's health check
# cannot reach.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=build --chown=node:node /app /app
# Nothing here needs root, and the runtime writes only to .next/cache.
USER node
EXPOSE 3000
CMD ["pnpm", "start"]
