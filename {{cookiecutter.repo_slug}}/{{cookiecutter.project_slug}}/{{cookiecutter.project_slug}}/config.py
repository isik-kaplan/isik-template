from dotenv import load_dotenv
from isik.common.config import boolean, config, integer, string


load_dotenv(verbose=True, override=False)

CONFIG = config(
    {
        "DEBUG": boolean(),
        "SECRET_KEY": string(),
        "CREDENTIAL_KEY": string(missing_default=""),
        "DOMAIN": string(),
{%- if cookiecutter.tls_termination == "self" %}
        # nginx is the edge: the only proxy appending to X-Forwarded-For.
        "TRUSTED_PROXY_COUNT": integer(missing_default=1),
{%- else %}
        # The load balancer this deployment needs in front of nginx, plus nginx itself.
        "TRUSTED_PROXY_COUNT": integer(missing_default=2),
{%- endif %}
        "DB": {
            "NAME": string(),
            "USER": string(),
            "PASSWORD": string(),
            "HOST": string(),
            "PORT": string(),
        },
        "BROKER": {
            "USER": string(),
            "PASSWORD": string(),
            "HOST": string(),
            "PORT": string(),
        },
        "STORAGE": {
            "BUCKET_NAME": string(),
            "ENDPOINT_URL": string(),
            "ACCESS_KEY_ID": string(),
            "SECRET_ACCESS_KEY": string(),
            "REGION_NAME": string(),
        },
        "SETUP": {
            "SUPERUSER": {
                "USERNAME": string(),
                "EMAIL": string(),
                "PASSWORD": string(),
            },
        },
        "ACCOUNTS": {
            # True everywhere except e2e (see e2e/e2e.env) - allauth's counters are keyed by ip
            # and by user, shared across a whole test run rather than scoped to one test, and the
            # suite signs up/logs in/changes passwords far faster than any human. See settings.py.
            "RATE_LIMITS_ENABLED": boolean(missing_default=True),
        },
        "SENTRY": {
            "DSN": string(missing_default=None),
            "TRACES_SAMPLE_RATE": string(missing_default="0"),
        },
        "LOGGING": {
            # `console` is one aligned line a person reads; `json` is one object a collector parses.
            "FORMAT": string(missing_default="console"),
            # Which requests earn a line of their own: "non-2xx", "all" or "none". A listing that
            # worked is the least interesting thing in the log and most of its volume.
            "REQUESTS": string(missing_default="non-2xx"),
            # ...except a slow one, whatever it answered. Zero turns that off.
            "SLOW_REQUEST_MS": integer(missing_default=1000),
        },
        "EMAIL": {
            # Unset everywhere except e2e (see e2e/e2e.env), which forces "smtp" (routed to
            # mailpit) independently of DEBUG - every other environment keeps the DEBUG-gated
            # console/smtp default. See settings.py.
            "BACKEND": string(missing_default=""),
            "SMTP": {
                "HOST": string(),
                "PORT": string(),
                "USER": string(),
                "PASSWORD": string(),
                "USE_TLS": boolean(missing_default=True),
            },
            "DEFAULT_FROM": string(),
        },
    },
    prefix="{{ cookiecutter.config_prefix }}",
)
