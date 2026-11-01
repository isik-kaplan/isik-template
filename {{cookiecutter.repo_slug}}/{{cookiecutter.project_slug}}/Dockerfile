FROM python:{{ cookiecutter.python_version }}-slim

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# pg_dump only reads forward, and Debian's client is older than the 18 the database runs: so the Postgres
# project's own repository, pinned to the server's major so a move to 19 is a build-time decision.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/pgdg.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/pgdg.gpg] https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo "$VERSION_CODENAME")-pgdg main" \
        > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update && apt-get install -y --no-install-recommends \
        gettext \
        libexpat1 \
        postgresql-client-18 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.8.17 /uv /usr/local/bin/uv

WORKDIR /{{ cookiecutter.project_slug }}

COPY . /{{ cookiecutter.project_slug }}/

# Outside the bind-mounted source tree, where a venv would need a volume Compose keeps stale.
ENV UV_PROJECT_ENVIRONMENT=/venv
RUN uv sync --frozen

ENV PATH="/venv/bin:$PATH"

# Unset, a build reads "dev". Keep the variable out of .env: env_file would shadow it with an empty value.
ARG BUILD=dev
ENV {{ cookiecutter.config_prefix }}__BUILD=$BUILD

EXPOSE 80

# Via `sh`: the dev bind mount overlays the host's copy, which may lack +x.
CMD ["sh", "/{{ cookiecutter.project_slug }}/entrypoint.sh"]
