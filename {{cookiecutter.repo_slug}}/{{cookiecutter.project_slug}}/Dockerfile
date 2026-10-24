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

# Outside the bind-mounted source tree, where a venv would need a volume Compose keeps stale.
ENV UV_PROJECT_ENVIRONMENT=/venv
RUN uv sync --frozen

ENV PATH="/venv/bin:$PATH"

EXPOSE 80

# Via `sh`: the dev bind mount overlays the host's copy, which may lack +x.
CMD ["sh", "/{{ cookiecutter.project_slug }}/entrypoint.sh"]
