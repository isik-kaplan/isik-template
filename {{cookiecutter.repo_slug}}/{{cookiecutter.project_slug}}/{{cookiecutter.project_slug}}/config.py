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
            # Off only in e2e, which acts far faster than any person.
            "ENABLED": boolean(missing_default=True),
            # DRF rates: signed out per address, signed in per account.
            "ANONYMOUS": string(missing_default="120/minute"),
            "USER": string(missing_default="600/minute"),
        },
        "OAUTH_PROVIDER": {
            # off, approval (a superuser approves each app) or auto.
            "MODE": string(missing_default="off"),
            # RSA private key as PEM; a literal \n stands for a line break.
            "SIGNING_KEY": string(missing_default=""),
            "APPLICATIONS_PER_USER": integer(missing_default=10),
        },
        "SOCIAL_LOGIN": {
            # The frontend reads the same variable. Credentials are OAUTH__<ID>__*.
            "PROVIDERS": comma_separated_list(missing_default=[]),
        },
        "SENTRY": {
            "DSN": string(missing_default=None),
            "TRACES_SAMPLE_RATE": string(missing_default="0"),
        },
        "LOGGING": {
            "FORMAT": string(missing_default="console"),
            # "non-2xx", "all" or "none".
            "REQUESTS": string(missing_default="non-2xx"),
            # A slow request is logged whatever it answered. Zero turns that off.
            "SLOW_REQUEST_MS": integer(missing_default=1000),
        },
        "EMAIL": {
            # Only e2e sets it, forcing "smtp" despite DEBUG.
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
        # Push is off until a service has credentials: see .env.example.
        "PUSH": {
            "APNS": {
                "TEAM_ID": string(missing_default=""),
                "KEY_ID": string(missing_default=""),
                "KEY": string(missing_default=""),
                "TOPIC": string(missing_default={{ (cookiecutter.domain.split(".") | reverse | join(".") ~ ".mobile") | tojson }}),
            },
            "FCM": {
                "CREDENTIALS": string(missing_default=""),
            },
        },
    },
    prefix="{{ cookiecutter.config_prefix }}",
)
