import os
import sys
from pathlib import Path

import sentry_sdk
from corsheaders.defaults import default_headers
from django.conf.locale import LANG_INFO
from isik.django.apps.common.checks import Check, CheckOption

from apps.common.logging.scrub import scrub_event
from apps.oauth_provider import device_codes
from apps.oauth_provider.mode import oauth_provider_mode
from apps.users.social_login import social_login_provider_ids

from . import __version__
from .config import CONFIG as config  # Django thinks CONFIG is a setting if it is all caps  # NOQA


BASE_DIR = Path(__file__).resolve().parent.parent

DEBUG = config.DEBUG
SECRET_KEY = config.SECRET_KEY
# Not SECRET_KEY, so rotating the signing key does not cost every stored secret.
CREDENTIAL_KEY = config.CREDENTIAL_KEY

# "localhost" is only for the container-internal Docker healthcheck.
ALLOWED_HOSTS = [
    config.DOMAIN,
    f"api.{config.DOMAIN}",
    f"admin.{config.DOMAIN}",
    f"auth.{config.DOMAIN}",
    "localhost",
]


SOCIAL_LOGIN_PROVIDER_IDS = social_login_provider_ids(config.SOCIAL_LOGIN.PROVIDERS)

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
    "oauth2_provider",
{%- if cookiecutter.background_jobs == "celery-with-beat" %}
    "django_celery_beat",
{%- endif %}
{%- if cookiecutter.background_jobs != "inline" %}
    "django_celery_results",
{%- endif %}
    "apps.common.apps.CommonConfig",
    "apps.core.apps.CoreConfig",
    "apps.users.apps.UsersConfig",
    "apps.oauth_provider.apps.OAuthProviderConfig",
    "apps.admin.apps.AdminConfig",
]

MIDDLEWARE = [
    # First: the Docker healthcheck's Host: localhost matches no django-hosts pattern.
    "apps.common.middleware.health_check.HealthCheckMiddleware",
    "django_hosts.middleware.HostsRequestMiddleware",
    # Before anything that may answer early (CommonMiddleware), or the response lacks CORS headers.
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "allauth.account.middleware.AccountMiddleware",
    # After AuthenticationMiddleware, which decides whether a request that sent a session cookie is signed in.
    "isik.django.apps.common.middleware.DeadSessionCookieMiddleware",
    # After AuthenticationMiddleware: the user's saved language beats the browser's.
    "apps.common.middleware.language.UserLanguageMiddleware",
    # After AuthenticationMiddleware: stamps request.user as the pghistory actor.
    "isik.django.apps.common.middleware.HistoryContextMiddleware",
    # Below the history context, so the actor is already on its line.
    "apps.common.middleware.request_log.RequestLogMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "django_hosts.middleware.HostsResponseMiddleware",
]

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "console": {"()": "apps.common.logging.formatters.ConsoleFormatter"},
        "json": {"()": "apps.common.logging.formatters.JSONFormatter"},
    },
    "handlers": {
        "stdout": {"class": "logging.StreamHandler", "stream": sys.stdout, "formatter": config.LOGGING.FORMAT},
    },
    "root": {"handlers": ["stdout"], "level": "WARNING"},
    "loggers": {
        "{{ cookiecutter.project_slug }}": {"level": "INFO"},
        # No propagation: lowering the logger above cannot quieten an audit record.
        "{{ cookiecutter.project_slug }}.audit": {"level": "INFO", "handlers": ["stdout"], "propagate": False},
        "django.security": {"level": "INFO"},
        # ERROR, not off: a 500 raised outside the request-log middleware still lands.
        "django.request": {"level": "ERROR"},
        # Logs every query at DEBUG.
        "django.db.backends": {"level": "WARNING"},
        "celery": {"level": "WARNING"},
    },
}

# Only the fallback where no request picks a host (shell, management commands).
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
            # allauth's email templates use blocktranslate without loading i18n.
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
        # Idempotency claims need a transaction to commit inside. Opt out with isik's not_atomic(reason).
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

# Spelled by defining module, not the package re-export: allauth records a social login under that
# path, and a session whose path is not listed here is anonymous from its next request.
AUTHENTICATION_BACKENDS = [
    "apps.users.backends.authentication.AuthenticationBackend",
    "apps.users.backends.permissions.PermissionsBackend",
]

ACCOUNT_LOGIN_METHODS = {"username", "email"}
ACCOUNT_SIGNUP_FIELDS = ["email*", "username*", "password1*"]
ACCOUNT_ADAPTER = "apps.users.adapters.account.AccountAdapter"
SOCIALACCOUNT_ADAPTER = "apps.users.adapters.social_account.SocialAccountAdapter"
# True would commit the provider's username unconfirmed on a first social signup.
SOCIALACCOUNT_AUTO_SIGNUP = False
ACCOUNT_EMAIL_VERIFICATION = "mandatory"
ACCOUNT_EMAIL_NOTIFICATIONS = True
# False, not {}: allauth .update()s its defaults with this, so {} would disable nothing.
if not config.RATE_LIMITS.ENABLED:  # see pyproject.toml's coverage exclude_lines for why
    ACCOUNT_RATE_LIMITS = False

# On costs a write per request; off, last_seen_at never moves.
USERSESSIONS_TRACK_ACTIVITY = False

MFA_SUPPORTED_TYPES = ["totp", "recovery_codes", "webauthn"]
MFA_ADAPTER = "apps.users.adapters.mfa.MFAAdapter"
# Otherwise the authenticator app shows the Site row's name, "example.com".
MFA_TOTP_ISSUER = {{ cookiecutter.project_name|tojson }}
# A passkey is a second factor here, never a replacement for the password.
MFA_PASSKEY_LOGIN_ENABLED = False
MFA_RECOVERY_CODES_SHOW_ONCE = True

HEADLESS_ONLY = True
HEADLESS_SERVE_SPECIFICATION = True
# Adds "language" to the session/user payload.
HEADLESS_ADAPTER = "apps.users.headless.HeadlessAdapter"

FRONTEND_SCHEME = "http" if DEBUG else "https"
FRONTEND_ORIGIN = f"{FRONTEND_SCHEME}://{config.DOMAIN}"
# Backstop in case a proxy drops X-Forwarded-Proto: allauth's links stay https outside DEBUG.
ACCOUNT_DEFAULT_HTTP_PROTOCOL = FRONTEND_SCHEME
# Absolute: the frontend is a different origin from auth.<domain>. Concatenated, not an f-string,
# so allauth's "{key}" placeholder survives.
HEADLESS_FRONTEND_URLS = {
    "account_signup": FRONTEND_ORIGIN + "/auth/signup",
    "account_reset_password": FRONTEND_ORIGIN + "/auth/forgot-password",
    "account_reset_password_from_key": FRONTEND_ORIGIN + "/auth/password-reset/{key}",
    "account_confirm_email": FRONTEND_ORIGIN + "/auth/verify-email/{key}",
    "socialaccount_login_error": FRONTEND_ORIGIN + "/auth/provider-error",
}


# Read from the environment, not config.py: the set of providers has no fixed schema.
_OAUTH_PREFIX = "{{ cookiecutter.config_prefix }}__OAUTH"


def _social_app_config(provider_id: str) -> dict:
    prefix = f"{_OAUTH_PREFIX}__{provider_id.upper()}"
    config = {
        "client_id": os.environ.get(f"{prefix}__CLIENT_ID", ""),
        "secret": os.environ.get(f"{prefix}__CLIENT_SECRET", ""),
        "key": "",
    }
    if provider_id == "openid_connect":
        # provider_id names this issuer and builds the callback URL, so it must match the IdP's
        # registered redirect_uri.
        config["provider_id"] = os.environ.get(f"{prefix}__PROVIDER_ID", "openid_connect")
        config["name"] = "OpenID Connect"
        config["settings"] = {"server_url": os.environ.get(f"{prefix}__SERVER_URL", "")}
    return config


# Settings, not SocialApp rows: nothing to configure in the admin or seed in e2e.
SOCIALACCOUNT_PROVIDERS = {
    provider_id: {"APPS": [_social_app_config(provider_id)]} for provider_id in SOCIAL_LOGIN_PROVIDER_IDS
}

# Its tables exist whatever the mode, so switching it on later is a restart, never a migration.
OAUTH_PROVIDER_MODE = oauth_provider_mode(config.OAUTH_PROVIDER.MODE, config.OAUTH_PROVIDER.SIGNING_KEY)
OAUTH_PROVIDER_APPLICATIONS_PER_USER = config.OAUTH_PROVIDER.APPLICATIONS_PER_USER
OAUTH2_PROVIDER_APPLICATION_MODEL = "oauth_provider.Application"
OAUTH2_PROVIDER = {
    "OIDC_ENABLED": True,
    "OIDC_RSA_PRIVATE_KEY": config.OAUTH_PROVIDER.SIGNING_KEY.replace("\\n", "\n"),
    # Only for discovery; the consent page words each scope itself.
    "SCOPES": {"openid": "Who you are", "profile": "Your name and username", "email": "Your email address"},
    "DEFAULT_SCOPES": ["openid"],
    "SCOPES_BACKEND_CLASS": "apps.oauth_provider.token_scopes.TokenScopes",
    # DOT's own advertises the profile and email claims and fills in neither.
    "OAUTH2_VALIDATOR_CLASS": "apps.oauth_provider.validators.OAuth2Validator",
    "REQUEST_APPROVAL_PROMPT": "auto",
    "PKCE_REQUIRED": True,
    "ALLOWED_REDIRECT_URI_SCHEMES": ["http", "https"] if DEBUG else ["https"],
    "REFRESH_TOKEN_REUSE_PROTECTION": True,
    # RFC 9700, ahead of DOT 4.0 making it the default.
    "COMPLIANT_BCP_RFC9700_IMPLICIT_GRANT": True,
    "COMPLIANT_BCP_RFC9700_PASSWORD_GRANT": True,
    "COMPLIANT_BCP_RFC9700_PKCE_METHOD": True,
    "COMPLIANT_BCP_RFC9700_ACCESS_TOKEN_TRANSPORT": True,
    "COMPLIANT_BCP_RFC9700_AUTHZ_RESPONSE_ISS": True,
    "COMPLIANT_BCP_RFC9700_TOKEN_STORAGE": True,
    # These make a shortfall fail check --deploy rather than warn.
    "COMPLIANT_BCP_RFC9700_REFRESH_TOKEN": True,
    "COMPLIANT_BCP_RFC9700_REDIRECT_URI_SCHEME": True,
    "COMPLIANT_BCP_RFC9700_REDIRECT_URI_MATCHING": True,
    "COMPLIANT_BCP_RFC9700_PKCE_REQUIRED": True,
    "OAUTH_DEVICE_VERIFICATION_URI": FRONTEND_ORIGIN + "/device",
    "OAUTH_DEVICE_VERIFICATION_URI_COMPLETE": FRONTEND_ORIGIN + "/device?code={user_code}",
    "OAUTH_DEVICE_USER_CODE_GENERATOR": device_codes.user_code,
    "OAUTH_PRE_TOKEN_VALIDATION": [device_codes.spend_device_code],
}
# Absolute: DOT's authorize endpoint is on auth.<domain>, the sign-in page on the frontend.
LOGIN_URL = FRONTEND_ORIGIN + "/auth/login"

LANGUAGE_CODE = "en"
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
# Not the Manifest variant: it needs collectstatic before any admin page renders, tests included.
STORAGES = {
{%- if cookiecutter.storage == "disk" %}
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
        "OPTIONS": {"location": "/media"},
    },
{%- else %}
    # Uploads go to S3 - {% if cookiecutter.storage == "garage" %}Garage{% else %}Garage locally{% endif %}.
    # Path-style, as Garage serves buckets as paths.
    "default": {
        "BACKEND": "storages.backends.s3.S3Storage",
        "OPTIONS": {
            "bucket_name": config.STORAGE.BUCKET_NAME,
            "endpoint_url": config.STORAGE.ENDPOINT_URL,
            "access_key": config.STORAGE.ACCESS_KEY_ID,
            "secret_key": config.STORAGE.SECRET_ACCESS_KEY,
            "region_name": config.STORAGE.REGION_NAME,
            "addressing_style": "path",
            # boto3 still presigns with SigV2 in us-east-1, which Garage refuses.
            "signature_version": "s3v4",
        },
    },
{%- endif %}
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedStaticFilesStorage",
    },
}

# nginx always sets this header.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_SERIALIZER = "django_msgspec.sessions.JSONSerializer"
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
# Preload stays off: leaving the browsers' list takes months, so it is the owner's call.
SECURE_HSTS_SECONDS = 0 if DEBUG else 31_536_000
SECURE_HSTS_INCLUDE_SUBDOMAINS = not DEBUG
# W008: nginx or the load balancer redirects to https. W021: preload, as above.
SILENCED_SYSTEM_CHECKS = ["security.W008", "security.W021"]
# One session/CSRF cookie pair across every subdomain.
SESSION_COOKIE_DOMAIN = f".{config.DOMAIN}"
CSRF_COOKIE_DOMAIN = f".{config.DOMAIN}"


def _origins(hosts: list[str], debug: bool) -> list[str]:
    """Under DEBUG https too, for scripts/dev-tls.sh and the e2e stack."""
    schemes = ["http", "https"] if debug else ["https"]
    return [f"{scheme}://{host}" for host in hosts for scheme in schemes]


CSRF_TRUSTED_ORIGINS = _origins(
    [config.DOMAIN, f"api.{config.DOMAIN}", f"admin.{config.DOMAIN}", f"auth.{config.DOMAIN}"], DEBUG
)
# The frontend's JS calls api./auth.<domain> directly - same site, but a different origin.
CORS_ALLOWED_ORIGINS = _origins([config.DOMAIN], DEBUG)
CORS_ALLOW_CREDENTIALS = True
# Response headers the frontend reads; cross-origin JS sees no custom header unless named here.
CORS_EXPOSE_HEADERS = ["X-Reauthentication-Required", "X-Session-Cleared", "ETag"]
# A custom request header not listed here is refused at the preflight.
CORS_ALLOW_HEADERS = (*default_headers, "idempotency-key", "if-match", "if-none-match")

# Rate limits count here, so it must be shared: a per-process cache multiplies every limit.
{%- if cookiecutter.cache == "redis" %}
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": f"redis://{config.CACHE.HOST}:{config.CACHE.PORT}/0",
        "OPTIONS": {"password": config.CACHE.PASSWORD},
    },
}
{%- else %}
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.db.DatabaseCache",
        # Made by `createcachetable` (entrypoint.sh), not a migration.
        "LOCATION": "cache",
    },
}
{%- endif %}

THROTTLE_CLASSES = [
    "apps.common.api.throttling.AnonymousRateThrottle",
    "apps.common.api.throttling.UserRateThrottle",
    "apps.common.api.throttling.ScopedRateThrottle",
]

REST_FRAMEWORK = {
    "DEFAULT_THROTTLE_CLASSES": THROTTLE_CLASSES if config.RATE_LIMITS.ENABLED else [],
    "DEFAULT_THROTTLE_RATES": {
        "anon": config.RATE_LIMITS.ANONYMOUS,
        "user": config.RATE_LIMITS.USER,
        # A device's user code is short enough to guess at.
        "device_codes": "10/minute",
    },
    "PAGE_SIZE": 100,
    "DEFAULT_PAGINATION_CLASS": "isik.django.drf.pagination.PageNumberPagination",
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    # isik's own, for HistoryMixin's colliding operation ids and untyped paginated lists.
    "DEFAULT_SCHEMA_CLASS": "isik.django.drf.spectacular.AutoSchema",
    "DEFAULT_PERMISSION_CLASSES": [
        "isik.django.drf.permissions.ReadOnly",
    ],
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
        # The token is the session key, for non-browser clients - not a second auth system.
        "allauth.headless.contrib.rest_framework.authentication.XSessionTokenAuthentication",
        # After the session ones, whose answer to nobody signed in (403) is the one DRF gives.
        "apps.users.authentication.PersonalAccessTokenAuthentication",
        "apps.oauth_provider.authentication.ApplicationTokenAuthentication",
    ],
    "EXCEPTION_HANDLER": "apps.common.api.exception_handler.exception_handler",
    "DEFAULT_RENDERER_CLASSES": ("apps.common.api.renderers.JSONRenderer",),
    # JSON alone would answer 415 to multipart.
    "DEFAULT_PARSER_CLASSES": (
        "django_msgspec.rest_framework.JSONParser",
        "rest_framework.parsers.FormParser",
        "rest_framework.parsers.MultiPartParser",
    ),
}

# The web app watches for this header to sign a tab out once the backend has dropped a dead session cookie.
DEAD_SESSION_HEADER = "X-Session-Cleared"
# Each row says which build wrote it.
HISTORY_CONTEXT_KEYS = ("version",)
HISTORY_CONTEXT_VERSION = __version__
# A task queued inside a request runs only once that request's rows are committed.
HISTORY_TASK_DISPATCH_ON_COMMIT = True
# Time-ordered ids: rows made later sort later, which keeps index pages filling in order.
ISIK_PRIMARY_KEY_DEFAULT = "isik.django.apps.common.db.models.uuid7"
ISIK_CHECKS = {
    Check.DOCUMENTATION: {
        CheckOption.EXEMPTION_TYPES: ["apps.common.schema_docs.NoHelpText", "apps.common.schema_docs.NoComment"],
        # AbstractUser's and DOT's fields are described by their libraries, not redeclared here to say it again.
        CheckOption.INHERITED_FROM_LIBRARIES: False,
    },
}

SPECTACULAR_SETTINGS = {
    "TITLE": {{ (cookiecutter.project_name ~ " API")|tojson }},
    "DESCRIPTION": {{ cookiecutter.description|tojson }},
    "VERSION": __version__,
    "COMPONENT_SPLIT_REQUEST": True,
    "POSTPROCESSING_HOOKS": [
        "drf_spectacular.hooks.postprocess_schema_enums",
    ],
    "SERVE_INCLUDE_SCHEMA": False,
    # Filled at startup by apps.common.enum_names.
    "ENUM_SUFFIX": "",
    "ENUM_NAME_OVERRIDES": {},
    # Labels differ per project; the values are the contract.
    "ENUM_GENERATE_CHOICE_DESCRIPTION": False,
}

{%- if cookiecutter.background_jobs == "inline" %}
# No broker: a task runs in-process on commit (celery_task.py). Countdown/eta is not waited for.
CELERY_TASK_ALWAYS_EAGER = True
{%- else %}
# RabbitMQ's guest user is loopback-only, so real credentials are needed even locally.
CELERY_BROKER_URL = f"amqp://{config.BROKER.USER}:{config.BROKER.PASSWORD}@{config.BROKER.HOST}:{config.BROKER.PORT}//"
CELERY_RESULT_BACKEND = "django-db"
{%- endif %}

# EMAIL__BACKEND overrides DEBUG's choice: e2e needs smtp but DEBUG=false would force secure cookies.
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
# Without one a mail host that drops packets holds the worker forever.
EMAIL_TIMEOUT = 10
DEFAULT_FROM_EMAIL = config.EMAIL.DEFAULT_FROM

if config.SENTRY.DSN:  # see pyproject.toml's coverage exclude_lines for why
    sentry_sdk.init(
        dsn=config.SENTRY.DSN,
        traces_sample_rate=float(config.SENTRY.TRACES_SAMPLE_RATE),
        debug=DEBUG,
        send_default_pii=False,
        before_send=scrub_event,
    )
