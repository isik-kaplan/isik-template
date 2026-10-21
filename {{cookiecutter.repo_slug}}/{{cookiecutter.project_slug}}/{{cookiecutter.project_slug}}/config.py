from dotenv import load_dotenv
from isik.common.config import boolean, comma_separated_list, config, integer, string


load_dotenv(verbose=True, override=False)

CONFIG = config(
    {
        "DEBUG": boolean(),
        "SECRET_KEY": string(),
        "CREDENTIAL_KEY": string(missing_default=""),
        "DOMAIN": string(),
        "DB": {
            "NAME": string(),
            "USER": string(),
            "PASSWORD": string(),
            "HOST": string(),
            "PORT": string(),
        },
{%- if cookiecutter.background_jobs != "inline" %}
        "BROKER": {
            "USER": string(),
            "PASSWORD": string(),
            "HOST": string(),
            "PORT": string(),
        },
{%- endif %}
{%- if cookiecutter.cache == "redis" %}
        "CACHE": {
            "HOST": string(),
            "PORT": string(),
            "PASSWORD": string(),
        },
{%- endif %}
{%- if cookiecutter.storage != "disk" %}
        "STORAGE": {
            "BUCKET_NAME": string(),
            "ENDPOINT_URL": string(),
            "ACCESS_KEY_ID": string(),
            "SECRET_ACCESS_KEY": string(),
            "REGION_NAME": string(),
        },
{%- endif %}
        "SETUP": {
            "SUPERUSER": {
                "USERNAME": string(),
                "EMAIL": string(),
                "PASSWORD": string(),
            },
        },
        "RATE_LIMITS": {
            # Every limit the backend keeps: allauth's on signing in and the like, and the API's.
            # True everywhere except e2e (see e2e/.env): the counts are kept per address and per
            # account across a whole run, and the suite acts far faster than any person.
            "ENABLED": boolean(missing_default=True),
            # Requests an API caller may make, as DRF writes a rate: <count>/<second|minute|hour|day>.
            # Signed out per address, signed in per account.
            "ANONYMOUS": string(missing_default="120/minute"),
            "USER": string(missing_default="600/minute"),
        },
        "OAUTH_PROVIDER": {
            # Whether other apps can offer "Sign in with" this project: off, approval (a superuser
            # approves each app anybody registers) or auto (registered is approved). See settings.py.
            "MODE": string(missing_default="off"),
            # The RSA private key id_tokens are signed with, as PEM. Required unless MODE is off. A
            # literal \n stands for a line break, so it fits on one line of an .env file.
            "SIGNING_KEY": string(missing_default=""),
            # How many applications one person may register.
            "APPLICATIONS_PER_USER": integer(missing_default=10),
        },
        "SOCIAL_LOGIN": {
            # allauth provider ids, e.g. google,github,openid_connect. The frontend reads the same
            # variable to know which buttons to show. Each one's credentials are OAUTH__<ID>__*.
            "PROVIDERS": comma_separated_list(missing_default=[]),
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
