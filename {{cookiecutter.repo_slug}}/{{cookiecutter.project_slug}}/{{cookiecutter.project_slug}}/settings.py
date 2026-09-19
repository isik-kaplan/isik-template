import os
from pathlib import Path

import sentry_sdk

from .config import CONFIG as config  # Django thinks CONFIG is a setting if it is all caps  # NOQA


BASE_DIR = Path(__file__).resolve().parent.parent

DEBUG = config.DEBUG
SECRET_KEY = config.SECRET_KEY

# "localhost" only covers the container-internal Docker healthcheck (curl http://localhost/health/)
# - every real request arrives with one of the subdomains below, forwarded unmodified by nginx.
ALLOWED_HOSTS = [
    config.DOMAIN,
    f"api.{config.DOMAIN}",
    f"admin.{config.DOMAIN}",
    f"auth.{config.DOMAIN}",
    "localhost",
]

# Resolved here, at cookiecutter-render time, not at Django runtime - the answer is fixed for the
# life of this generated project, so branching on it at runtime would just be dead code the test
# suite could never cover the other side of. "all" is expanded by introspecting allauth's own
# providers package (more accurate than a hardcoded list here staying in sync by hand - it can
# never drift from whatever allauth version ends up installed) rather than by pre_gen_project.py,
# which validates the answer but can't feed a computed value back into what Jinja renders.
{%- if cookiecutter.social_login_providers.strip() == "all" %}
import pkgutil

import allauth.socialaccount.providers as _providers_pkg


SOCIAL_LOGIN_PROVIDER_IDS = sorted(
    name
    for _, name, ispkg in pkgutil.iter_modules(_providers_pkg.__path__)
    if ispkg and name not in {"base", "oauth", "oauth2"}
)
{%- elif cookiecutter.social_login_providers.strip() %}
SOCIAL_LOGIN_PROVIDER_IDS = [
{%- for provider in cookiecutter.social_login_providers.split(',') %}
    "{{ provider.strip() }}",
{%- endfor %}
]
{%- else %}
SOCIAL_LOGIN_PROVIDER_IDS = []
{%- endif %}

INSTALLED_APPS = [
    "django_hosts",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.postgres",
    "django.contrib.admin",
    "django.contrib.sites",
    "whitenoise.runserver_nostatic",
    "corsheaders",
    "pgtrigger",
    "pghistory",
    "isik.django.apps.common",
    "django_object_actions",
    "dalf",
    "django_filters",
    "rest_framework",
    "drf_spectacular",
    "allauth",
    "allauth.account",
    "allauth.socialaccount",
    *[f"allauth.socialaccount.providers.{provider_id}" for provider_id in SOCIAL_LOGIN_PROVIDER_IDS],
    "allauth.usersessions",
    "allauth.headless",
    "django_celery_beat",
    "django_celery_results",
    "apps.core.apps.CoreConfig",
    "apps.users.apps.UsersConfig",
    "apps.admin.apps.AdminConfig",
]

MIDDLEWARE = [
    # First, unconditionally - the container-internal Docker healthcheck sends Host: localhost,
    # which matches no django-hosts pattern, so this must short-circuit before HostsRequestMiddleware
    # ever gets a chance to reject it.
    "apps.common.middleware.health_check.HealthCheckMiddleware",
    "django_hosts.middleware.HostsRequestMiddleware",
    # As high as possible - the frontend calls api./auth. from client-side JS running on the bare
    # domain, a different origin, so this has to run before anything else might already have
    # produced a response (CommonMiddleware in particular) for the CORS headers to be attached.
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "allauth.account.middleware.AccountMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    # Last, mirroring HostsRequestMiddleware - django-hosts' own required pairing.
    "django_hosts.middleware.HostsResponseMiddleware",
]

# django-hosts dispatches by Host header via ROOT_HOSTCONF/host_patterns (see hosts.py) - this is
# only the fallback used where no per-request host resolution applies (shell, management commands).
ROOT_URLCONF = "{{ cookiecutter.project_slug }}.urls.api"
ROOT_HOSTCONF = "{{ cookiecutter.project_slug }}.hosts"
DEFAULT_HOST = "api"
PARENT_HOST = config.DOMAIN

SITE_ID = 1

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
            # allauth's account/email/** templates use the i18n blocktranslate tag without loading
            # the i18n tag library themselves.
            "builtins": ["django.templatetags.i18n"],
        },
    },
]

WSGI_APPLICATION = "{{ cookiecutter.project_slug }}.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": config.DB.NAME,
        "USER": config.DB.USER,
        "PASSWORD": config.DB.PASSWORD,
        "HOST": config.DB.HOST,
        "PORT": config.DB.PORT,
    }
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 8}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

AUTH_USER_MODEL = "users.User"

AUTHENTICATION_BACKENDS = [
    "isik.django.apps.common.backends.UsernameOREmailModelBackend",
    "allauth.account.auth_backends.AuthenticationBackend",
]

# allauth - headless API only, no server-rendered account pages.
ACCOUNT_LOGIN_METHODS = {"username", "email"}
ACCOUNT_SIGNUP_FIELDS = ["email*", "username*", "password1*"]
ACCOUNT_ADAPTER = "apps.users.adapters.AccountAdapter"
SOCIALACCOUNT_ADAPTER = "apps.users.adapters.SocialAccountAdapter"
# allauth's default (True) skips the signup form for a first social signup with a unique email,
# committing a username taken verbatim from the provider. False routes every social signup through
# the pending-signup flow, so the suggested username is always confirmable first.
SOCIALACCOUNT_AUTO_SIGNUP = False
ACCOUNT_EMAIL_VERIFICATION = "mandatory"
ACCOUNT_EMAIL_NOTIFICATIONS = True
# Literal False, not an empty dict - allauth builds its defaults and then .update()s this over
# them, so {} would disable nothing at all. Only False short-circuits the whole thing.
if not config.ACCOUNTS.RATE_LIMITS_ENABLED:  # pragma: no cover - only false in the e2e environment
    ACCOUNT_RATE_LIMITS = False

# Costs a write per authenticated request and needs UserSessionsMiddleware. Off means last_seen_at
# never moves; listing and revoking work regardless.
USERSESSIONS_TRACK_ACTIVITY = False

HEADLESS_ONLY = True
HEADLESS_SERVE_SPECIFICATION = True

FRONTEND_SCHEME = "http" if DEBUG else "https"
FRONTEND_ORIGIN = f"{FRONTEND_SCHEME}://{config.DOMAIN}"
# Absolute, not relative: the frontend lives on the bare domain, a different origin than these
# headless endpoints (auth.<domain>) - a bare-path fallback here would resolve against auth.<domain>
# instead of where the frontend actually serves these pages. Built via string concatenation, not an
# f-string, so the literal "{key}" placeholder allauth substitutes later survives untouched.
HEADLESS_FRONTEND_URLS = {
    "account_signup": FRONTEND_ORIGIN + "/auth/signup",
    "account_reset_password": FRONTEND_ORIGIN + "/auth/forgot-password",
    "account_reset_password_from_key": FRONTEND_ORIGIN + "/auth/password-reset/{key}",
    "account_confirm_email": FRONTEND_ORIGIN + "/auth/verify-email/{key}",
    "socialaccount_login_error": FRONTEND_ORIGIN + "/auth/provider-error",
}


{% set client_id_line = '        "client_id": os.environ.get(f"' ~ cookiecutter.config_prefix ~ '__OAUTH__{provider_id.upper()}__CLIENT_ID", ""),' -%}
{% set secret_line = '        "secret": os.environ.get(f"' ~ cookiecutter.config_prefix ~ '__OAUTH__{provider_id.upper()}__CLIENT_SECRET", ""),' -%}
# config_prefix's length (derived from the project name) changes where ruff format's line-splitting
# kicks in, so these two lines and the ones further down pick their own layout at generation time
# instead of hardcoding one that only some project names would pass `ruff format --check` with.
def _social_app_config(provider_id: str) -> dict:
    config = {
{%- if client_id_line|length <= 120 %}
{{ client_id_line }}
{%- else %}
        "client_id": os.environ.get(
            f"{{ cookiecutter.config_prefix }}__OAUTH__{provider_id.upper()}__CLIENT_ID", ""
        ),
{%- endif %}
{%- if secret_line|length <= 120 %}
{{ secret_line }}
{%- else %}
        "secret": os.environ.get(
            f"{{ cookiecutter.config_prefix }}__OAUTH__{provider_id.upper()}__CLIENT_SECRET", ""
        ),
{%- endif %}
        "key": "",
    }
    if provider_id == "openid_connect":
        # openid_connect supports multiple distinct issuers side by side under one provider
        # class - provider_id names *this* one and has to be a real, distinct value (not just
        # "openid_connect" again - that's the provider *class*, not an instance), since the
        # redirect/callback URLs are built from it: /v0/provider-callback/oidc/<provider_id>/
        # login/callback/ ("oidc/" from allauth's own OPENID_CONNECT_URL_PREFIX default). This
        # has to match whatever redirect_uri is registered on the IdP's side exactly. server_url
        # is the one thing every other provider gets for free from allauth's own provider
        # directory (a fixed, known IdP) but this provider has to be told explicitly.
{%- set provider_id_line = '        config["provider_id"] = os.environ.get("' ~ cookiecutter.config_prefix ~ '__OAUTH__OPENID_CONNECT__PROVIDER_ID", "openid_connect")' %}
{%- set server_url_line = '        config["settings"] = {"server_url": os.environ.get("' ~ cookiecutter.config_prefix ~ '__OAUTH__OPENID_CONNECT__SERVER_URL", "")}' %}
{%- if provider_id_line|length <= 120 %}
{{ provider_id_line }}
{%- else %}
        config["provider_id"] = os.environ.get(
            "{{ cookiecutter.config_prefix }}__OAUTH__OPENID_CONNECT__PROVIDER_ID", "openid_connect"
        )
{%- endif %}
        config["name"] = "OpenID Connect"
{%- if server_url_line|length <= 120 %}
{{ server_url_line }}
{%- else %}
        config["settings"] = {
            "server_url": os.environ.get("{{ cookiecutter.config_prefix }}__OAUTH__OPENID_CONNECT__SERVER_URL", "")
        }
{%- endif %}
    return config


# Settings-based, not DB-backed: each provider's client_id/secret come straight from its own env
# var pair rather than an allauth SocialApp row, so there's nothing to configure through the admin
# and nothing to seed in e2e - see OAUTH__<PROVIDER>__* in .env.example.
SOCIALACCOUNT_PROVIDERS = {
    provider_id: {"APPS": [_social_app_config(provider_id)]} for provider_id in SOCIAL_LOGIN_PROVIDER_IDS
}

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
# Compression only, not *Manifest*StaticFilesStorage: the manifest variant hashes every static
# filename and requires collectstatic to have already run before a single static-file template tag
# can resolve, including the Django admin's own templates - which breaks any test that renders an
# admin page without a collectstatic step first. This still gets whitenoise's gzip/brotli
# compression, just not content-hashed cache-busting.
STORAGES = {
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedStaticFilesStorage",
    },
}

X_FRAME_OPTIONS = "SAMEORIGIN"

# nginx terminates every client connection and always sets this header, whether it speaks plain
# HTTP or sits behind a TLS-terminating load balancer.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
# Shared across api./admin./auth.<domain> so one session/CSRF cookie pair covers all three -
# without this, each subdomain would need its own login.
SESSION_COOKIE_DOMAIN = f".{config.DOMAIN}"
CSRF_COOKIE_DOMAIN = f".{config.DOMAIN}"
CSRF_TRUSTED_ORIGINS = [
    f"{FRONTEND_SCHEME}://{config.DOMAIN}",
    f"{FRONTEND_SCHEME}://api.{config.DOMAIN}",
    f"{FRONTEND_SCHEME}://admin.{config.DOMAIN}",
    f"{FRONTEND_SCHEME}://auth.{config.DOMAIN}",
]
# The bare domain is where the frontend's own pages are served from, but its client-side JS calls
# api./auth.<domain> directly (see apps/web/src/lib/authOrigin.ts) - a different origin from the
# browser's point of view even though it's the same site for cookie purposes above. Without this,
# the browser blocks those fetches before a response is ever read, regardless of what the response
# actually contains.
CORS_ALLOWED_ORIGINS = [FRONTEND_ORIGIN]
CORS_ALLOW_CREDENTIALS = True

REST_FRAMEWORK = {
    "PAGE_SIZE": 100,
    "DEFAULT_PAGINATION_CLASS": "isik.django.drf.pagination.PageNumberPagination",
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_PERMISSION_CLASSES": [
        "isik.django.drf.permissions.ReadOnly",
    ],
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
        # Not a second, separate auth mechanism - the token *is* the session key
        # (allauth.headless.tokens.strategies.sessions.SessionTokenStrategy, the default
        # HEADLESS_TOKEN_STRATEGY), looked up in the same django_session table a cookie-based
        # request hits. This is what lets a non-browser client (mobile app, CLI) authenticate with
        # the X-Session-Token it got back from a headless login, without a second auth system to
        # maintain.
        "allauth.headless.contrib.rest_framework.authentication.XSessionTokenAuthentication",
    ],
    "DEFAULT_RENDERER_CLASSES": ("rest_framework.renderers.JSONRenderer",),
}

SPECTACULAR_SETTINGS = {
    "TITLE": "{{ cookiecutter.project_name }} API",
    "DESCRIPTION": "{{ cookiecutter.description }}",
    "VERSION": "0.1.0",
    "COMPONENT_SPLIT_REQUEST": True,
}

# RabbitMQ's default guest/guest user only accepts loopback connections, which worker/scheduler
# aren't - real credentials are required even locally.
CELERY_BROKER_URL = f"amqp://{config.BROKER.USER}:{config.BROKER.PASSWORD}@{config.BROKER.HOST}:{config.BROKER.PORT}//"
CELERY_RESULT_BACKEND = "django-db"

# Console under DEBUG - real SMTP creds aren't set up for local dev. EMAIL__BACKEND overrides this
# independently of DEBUG - e2e needs smtp (routed to mailpit) while keeping DEBUG=true, since
# DEBUG=false would also flip SESSION_COOKIE_SECURE/CSRF_COOKIE_SECURE on, and this stack has no
# TLS termination to make that work.
EMAIL_BACKEND = {
    "console": "django.core.mail.backends.console.EmailBackend",
    "smtp": "django.core.mail.backends.smtp.EmailBackend",
}.get(
    config.EMAIL.BACKEND,
    "django.core.mail.backends.console.EmailBackend" if DEBUG else "django.core.mail.backends.smtp.EmailBackend",
)
EMAIL_HOST = config.EMAIL.SMTP.HOST
EMAIL_PORT = config.EMAIL.SMTP.PORT
EMAIL_HOST_USER = config.EMAIL.SMTP.USER
EMAIL_HOST_PASSWORD = config.EMAIL.SMTP.PASSWORD
EMAIL_USE_TLS = config.EMAIL.SMTP.USE_TLS
DEFAULT_FROM_EMAIL = config.EMAIL.DEFAULT_FROM

if config.SENTRY.DSN:  # pragma: no cover - exercised only when SENTRY__DSN is actually configured
    sentry_sdk.init(
        dsn=config.SENTRY.DSN,
        traces_sample_rate=float(config.SENTRY.TRACES_SAMPLE_RATE),
        debug=DEBUG,
    )
