FROM python:{{ cookiecutter.python_version }}-slim

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        gettext \
        libexpat1 \
        postgresql-client \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.8.17 /uv /usr/local/bin/uv

WORKDIR /{{ cookiecutter.project_slug }}

COPY . /{{ cookiecutter.project_slug }}/

# Not --frozen and no uv.lock is committed: a lock file's root package entry is self-referential
# (name = "<project_slug>"), so one baked into the template would mismatch every project generated
# with a different name and --frozen would reject it. Each generated project resolves its own lock
# on first build instead - commit the resulting uv.lock once it exists, then switch this to
# --frozen if reproducible builds matter more than staying template-agnostic.
RUN uv sync

ENV PATH="/{{ cookiecutter.project_slug }}/.venv/bin:$PATH"

EXPOSE 80

# Invoked via `sh`, not relying on the executable bit: the bind mount in docker-compose.yml
# (source code mounted for live-reload in dev) overlays this with the host's copy of the file,
# whose permissions cookiecutter has no reason to have set +x on - a bare `./entrypoint.sh` CMD
# would then fail with "permission denied" on every fresh generation.
CMD ["sh", "/{{ cookiecutter.project_slug }}/entrypoint.sh"]
