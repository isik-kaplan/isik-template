# Build context is the workspace root, not apps/web: packages/* must be built first, and npm does
# not topologically order `--workspaces` runs.

FROM node:{{ cookiecutter.node_version }}-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/api/package.json packages/api/package.json
COPY packages/auth-api/package.json packages/auth-api/package.json
# package-lock.json is generated (and committed) at bake time, not baked into the template itself
# - its workspace entries reference this project's own package names (@<repo_slug>/api etc.),
# which differ for every other project generated from this template. See
# hooks/post_gen_project.py's generate_lock_files().
RUN npm ci

# Where the suites run, here and in CI, so neither depends on the node a laptop or runner happens to
# have. From `deps`, not `builder`: vitest transforms the sources itself and never reads `.next`. A
# leaf - `runner` copies from `builder` - so nothing here can reach the image that ships.
FROM deps AS tester
WORKDIR /repo
COPY . .
RUN npm run build:packages
# The workspaces `deps` installed: apps/mobile, when there is one, has a toolchain of its own.
CMD ["npm", "run", "test", "--workspace=web", \
     "--workspace=@{{ cookiecutter.repo_slug }}/api", "--workspace=@{{ cookiecutter.repo_slug }}/auth-api"]

FROM node:{{ cookiecutter.node_version }}-alpine AS builder
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
# The only value that has to exist at build time: next build inlines NEXT_PUBLIC_* into the client
# bundle, so no runtime env can switch the browser SDK on afterwards. Everything else the app reads
# is resolved per request instead. Empty is a safe no-op, so an unset arg just leaves it disabled.
ARG NEXT_PUBLIC_SENTRY_DSN=
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
RUN npm run build --workspace=@{{ cookiecutter.repo_slug }}/api --workspace=@{{ cookiecutter.repo_slug }}/auth-api
RUN npm run build --workspace=web

FROM node:{{ cookiecutter.node_version }}-alpine AS runner
WORKDIR /repo
ENV NODE_ENV=production
# 80, not Next's default 3000 - matches the backend's uwsgi listener, so a plain
# http://<subdomain>.<domain>/ request (no explicit port) reaches either container directly with
# no port-rewriting workaround needed anywhere internally.
ENV PORT=80
ENV HOSTNAME=0.0.0.0
COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public
EXPOSE 80
CMD ["node", "apps/web/server.js"]
