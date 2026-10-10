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

# uv.lock is generated (and committed) at bake time, not baked into the template itself - a lock
# file's root package entry is self-referential (name = "<project_slug>"), so one shipped in the
# template would mismatch every project generated under a different name. See
# hooks/post_gen_project.py's generate_lock_files().
# Outside the source tree, which docker-compose.yml bind-mounts over: a venv inside it would need a
# volume to survive the mount, and Compose re-attaches that volume's stale copy after every rebuild.
ENV UV_PROJECT_ENVIRONMENT=/venv
RUN uv sync --frozen

ENV PATH="/venv/bin:$PATH"

EXPOSE 80

# Invoked via `sh`, not relying on the executable bit: the bind mount in docker-compose.yml
# (source code mounted for live-reload in dev) overlays this with the host's copy of the file,
# whose permissions cookiecutter has no reason to have set +x on - a bare `./entrypoint.sh` CMD
# would then fail with "permission denied" on every fresh generation.
CMD ["sh", "/{{ cookiecutter.project_slug }}/entrypoint.sh"]
