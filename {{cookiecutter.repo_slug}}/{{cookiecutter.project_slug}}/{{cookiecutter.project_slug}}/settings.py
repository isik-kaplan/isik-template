import os
import sys
from pathlib import Path

import sentry_sdk
from django.conf.locale import LANG_INFO

from apps.common.logging.scrub import scrub_event

from . import __version__
from .config import CONFIG as config  # Django thinks CONFIG is a setting if it is all caps  # NOQA


BASE_DIR = Path(__file__).resolve().parent.parent

DEBUG = config.DEBUG
SECRET_KEY = config.SECRET_KEY
# Its own key rather than SECRET_KEY, so rotating the signing key does not cost every stored secret.
# Unset, an EncryptedField refuses to store one - see apps/common/fields/encrypted.py.
CREDENTIAL_KEY = config.CREDENTIAL_KEY

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
    "isik.django.apps.idempotency.by_reference",
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
    "allauth.mfa",
    "allauth.headless",
    "django_celery_beat",
    "django_celery_results",
    "apps.common.apps.CommonConfig",
    "apps.idempotency.apps.IdempotencyConfig",
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
    # After AuthenticationMiddleware, whose request.user it reads - the signed-in user's saved
    # language wins over the browser's, so this can't just be Django's own LocaleMiddleware.
    "apps.common.middleware.language.UserLanguageMiddleware",
    # After AuthenticationMiddleware/AccountMiddleware, whose request.user it reads - opens the
    # pghistory context every tracked write in this request stamps its actor from, and what a
    # Celery task dispatched from here reads via open_history_context() to carry that actor along.
    "apps.common.middleware.history_context.HistoryContextMiddleware",
    # Below the context it annotates its line with, so the actor is already on it.
    "apps.common.middleware.request_log.RequestLogMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    # Last, mirroring HostsRequestMiddleware - django-hosts' own required pairing.
    "django_hosts.middleware.HostsResponseMiddleware",
]

LOGGING = {
    "version": 1,
    # Nothing is silenced by existing: a library that took a logger before this ran still reaches
    # the handler below, which is the whole reason for naming the noisy ones explicitly.
    "disable_existing_loggers": False,
    "formatters": {
        "console": {"()": "apps.common.logging.formatters.ConsoleFormatter"},
        "json": {"()": "apps.common.logging.formatters.JSONFormatter"},
    },
    "handlers": {
        # stdout, because a container's log is its stdout - a file here would be a file nobody reads
        # and a volume somebody has to remember.
        "stdout": {"class": "logging.StreamHandler", "stream": sys.stdout, "formatter": config.LOGGING.FORMAT},
    },
    "root": {"handlers": ["stdout"], "level": "WARNING"},
    "loggers": {
        # Ours, at INFO: an event was declared because somebody wanted it written down.
        "{{ cookiecutter.project_slug }}": {"level": "INFO"},
        # Its own handler and no propagation, which is the whole of "cannot be turned down": an
        # audit record does not pass through the logger above and is not quietened by lowering it.
        "{{ cookiecutter.project_slug }}.audit": {"level": "INFO", "handlers": ["stdout"], "propagate": False},
        # A refused Host or a suspicious operation is a real signal, and nothing else reports it.
        "django.security": {"level": "INFO"},
        # The request line carries the same failure with the actor on it. Left at ERROR rather than
        # off, so a 500 raised outside that middleware still lands.
        "django.request": {"level": "ERROR"},
        # Every query, at DEBUG. Turning this up in production is a self-inflicted outage.
        "django.db.backends": {"level": "WARNING"},
        "celery": {"level": "WARNING"},
    },
}

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
        # A view that dies partway leaves nothing behind, and idempotency claims need a transaction to
        # commit inside. Opt a view out with apps.common.transactions.not_atomic(reason); anything that
        # cannot roll back (mail, task dispatch) waits for transaction.on_commit instead.
        "ATOMIC_REQUESTS": True,
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

# allauth's backend, subclassed so it answers to the login policy (apps/users/login_policy.py). It
# signs in by username or email per ACCOUNT_LOGIN_METHODS, the admin's form included. Spelled by
# defining module, not the package re-export: allauth records a social login under that path, and a
# session whose path is not listed here is anonymous from its next request.
AUTHENTICATION_BACKENDS = [
    "apps.users.backends.authentication.AuthenticationBackend",
]

# allauth - headless API only, no server-rendered account pages.
ACCOUNT_LOGIN_METHODS = {"username", "email"}
ACCOUNT_SIGNUP_FIELDS = ["email*", "username*", "password1*"]
ACCOUNT_ADAPTER = "apps.users.adapters.account.AccountAdapter"
SOCIALACCOUNT_ADAPTER = "apps.users.adapters.social_account.SocialAccountAdapter"
# allauth's default (True) skips the signup form for a first social signup with a unique email,
# committing a username taken verbatim from the provider. False routes every social signup through
# the pending-signup flow, so the suggested username is always confirmable first.
SOCIALACCOUNT_AUTO_SIGNUP = False
ACCOUNT_EMAIL_VERIFICATION = "mandatory"
ACCOUNT_EMAIL_NOTIFICATIONS = True
# Literal False, not an empty dict - allauth builds its defaults and then .update()s this over
# them, so {} would disable nothing at all. Only False short-circuits the whole thing.
if not config.ACCOUNTS.RATE_LIMITS_ENABLED:  # see pyproject.toml's coverage exclude_lines for why
    ACCOUNT_RATE_LIMITS = False

# Without it allauth keys every rate limit on REMOTE_ADDR, which behind nginx is nginx itself - one
# bucket for every visitor. Counted from the right, so a client-prepended X-Forwarded-For is skipped.
ALLAUTH_TRUSTED_PROXY_COUNT = config.TRUSTED_PROXY_COUNT

# Costs a write per authenticated request and needs UserSessionsMiddleware. Off means last_seen_at
# never moves; listing and revoking work regardless.
USERSESSIONS_TRACK_ACTIVITY = False

# Opt-in per user: nobody is made to enroll, but anyone who has a factor is challenged for it.
MFA_SUPPORTED_TYPES = ["totp", "recovery_codes", "webauthn"]
MFA_ADAPTER = "apps.users.adapters.mfa.MFAAdapter"
# Otherwise the authenticator app shows the Site row's name, "example.com" until someone renames it.
MFA_TOTP_ISSUER = "{{ cookiecutter.project_name }}"
# A passkey is a second factor here, never a replacement for the password. Leaving this on would
# mount a passwordless login route nothing calls and advertise it in the headless config.
MFA_PASSKEY_LOGIN_ENABLED = False
# Shown once, at generation, so "write these down now" is true rather than advice.
MFA_RECOVERY_CODES_SHOW_ONCE = True

HEADLESS_ONLY = True
HEADLESS_SERVE_SPECIFICATION = True
# Adds "language" to the session/user payload the frontend already fetches on every page load -
# see apps/users/headless.py for why this needs the adapter, not a plain serializer field.
HEADLESS_ADAPTER = "apps.users.headless.HeadlessAdapter"

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

LANGUAGE_CODE = "en"
# Names come from Django's own LANG_INFO, not hand-typed here, so this list can't drift from what
# LocaleMiddleware/get_language_from_request actually recognize.
LANGUAGES = [
    (code, LANG_INFO[code]["name"])
    for code in [
{%- for code in cookiecutter.languages.split(',') %}
        "{{ code.strip() }}",
{%- endfor %}
    ]
]
LOCALE_PATHS = [BASE_DIR / "locale"]
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
    # Uploads go to S3 - LocalStack locally (see docker-compose.yml's `storage`). Path-style
    # addressing, because LocalStack serves buckets as paths rather than as subdomains.
    "default": {
        "BACKEND": "storages.backends.s3.S3Storage",
        "OPTIONS": {
            "bucket_name": config.STORAGE.BUCKET_NAME,
            "endpoint_url": config.STORAGE.ENDPOINT_URL,
            "access_key": config.STORAGE.ACCESS_KEY_ID,
            "secret_key": config.STORAGE.SECRET_ACCESS_KEY,
            "region_name": config.STORAGE.REGION_NAME,
            "addressing_style": "path",
        },
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedStaticFilesStorage",
    },
}

X_FRAME_OPTIONS = "SAMEORIGIN"

# nginx terminates every client connection and always sets this header, whether it speaks plain
# HTTP or sits behind a TLS-terminating load balancer.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_SERIALIZER = "django_msgspec.sessions.JSONSerializer"
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
# A year, so a visitor's browser never starts over plain http where it can be downgraded. Preload stays
# off: getting off the browsers' list again takes months, so it is the owner's call to make.
SECURE_HSTS_SECONDS = 0 if DEBUG else 31_536_000
SECURE_HSTS_INCLUDE_SUBDOMAINS = not DEBUG
# What `check --deploy` (run in CI) is told to accept. W008: nginx or the load balancer in front of it
# redirects http to https, before Django sees the request. W019: SAMEORIGIN above still refuses every
# other site a frame, which is the clickjacking case. W021: preload, as above.
SILENCED_SYSTEM_CHECKS = ["security.W008", "security.W019", "security.W021"]
# Shared across api./admin./auth.<domain> so one session/CSRF cookie pair covers all three -
# without this, each subdomain would need its own login.
SESSION_COOKIE_DOMAIN = f".{config.DOMAIN}"
CSRF_COOKIE_DOMAIN = f".{config.DOMAIN}"


def _origins(hosts: list[str], debug: bool) -> list[str]:
    """Every scheme a browser may reach `hosts` on. Under DEBUG that is http and, once
    scripts/dev-tls.sh has run (or in the e2e stack), https beside it; a real deployment is https only."""
    schemes = ["http", "https"] if debug else ["https"]
    return [f"{scheme}://{host}" for host in hosts for scheme in schemes]


CSRF_TRUSTED_ORIGINS = _origins(
    [config.DOMAIN, f"api.{config.DOMAIN}", f"admin.{config.DOMAIN}", f"auth.{config.DOMAIN}"], DEBUG
)
# The bare domain is where the frontend's own pages are served from, but its client-side JS calls
# api./auth.<domain> directly (see apps/web/src/lib/authOrigin.ts) - a different origin from the
# browser's point of view even though it's the same site for cookie purposes above. Without this,
# the browser blocks those fetches before a response is ever read, regardless of what the response
# actually contains.
CORS_ALLOWED_ORIGINS = _origins([config.DOMAIN], DEBUG)
CORS_ALLOW_CREDENTIALS = True
# A custom response header is invisible to cross-origin JS unless named here, and the frontend's
# fetch wrapper (apiClients.ts) reads both: one sends somebody to prove it is them, the other to the
# login page once their dead session's cookie was cleared.
CORS_EXPOSE_HEADERS = ["X-Reauthentication-Required", "X-Session-Cleared"]

REST_FRAMEWORK = {
    "PAGE_SIZE": 100,
    "DEFAULT_PAGINATION_CLASS": "isik.django.drf.pagination.PageNumberPagination",
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    # isik's own AutoSchema, not drf-spectacular's - fixes HistoryMixin's own schema gaps (colliding
    # operation ids between its two actions, both untyped as paginated lists otherwise).
    "DEFAULT_SCHEMA_CLASS": "isik.django.drf.spectacular.AutoSchema",
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
    # Adds the refusal's code beside `detail` and logs every 403 - see apps/common/api/exception_handler.py.
    "EXCEPTION_HANDLER": "apps.common.api.exception_handler.exception_handler",
    "DEFAULT_RENDERER_CLASSES": ("apps.common.api.renderers.JSONRenderer",),
    # DRF's own default list with only its JSON member replaced - JSON alone would answer 415 to multipart.
    "DEFAULT_PARSER_CLASSES": (
        "django_msgspec.rest_framework.JSONParser",
        "rest_framework.parsers.FormParser",
        "rest_framework.parsers.MultiPartParser",
    ),
}

SPECTACULAR_SETTINGS = {
    "TITLE": "{{ cookiecutter.project_name }} API",
    "DESCRIPTION": "{{ cookiecutter.description }}",
    "VERSION": __version__,
    "COMPONENT_SPLIT_REQUEST": True,
    "POSTPROCESSING_HOOKS": [
        "drf_spectacular.hooks.postprocess_schema_enums",
        # Every POST takes an Idempotency-Key, so the document says so once rather than per operation.
        "apps.idempotency.schema.every_post_declares_the_key",
    ],
    # The schema endpoint documenting itself is noise to every client generated from it.
    "SERVE_INCLUDE_SCHEMA": False,
    # An enum component is a string union to whoever generates against it, so the suffix says
    # nothing. Filled at startup by apps.common.enum_names.
    "ENUM_SUFFIX": "",
    "ENUM_NAME_OVERRIDES": {},
    # Labels come from settings.LANGUAGES and friends, which differ per project; the values are the contract.
    "ENUM_GENERATE_CHOICE_DESCRIPTION": False,
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

if config.SENTRY.DSN:  # see pyproject.toml's coverage exclude_lines for why
    sentry_sdk.init(
        dsn=config.SENTRY.DSN,
        traces_sample_rate=float(config.SENTRY.TRACES_SAMPLE_RATE),
        debug=DEBUG,
        # Named rather than left at the SDK's default: an exception report carries the request that
        # caused it, and scrub_event narrows it by the same allowlist the request log uses.
        send_default_pii=False,
        before_send=scrub_event,
    )
