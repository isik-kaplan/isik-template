from dotenv import load_dotenv
from isik.common.config import boolean, config, string


load_dotenv(verbose=True, override=False)

CONFIG = config(
    {
        "DEBUG": boolean(),
        "SECRET_KEY": string(),
        "DOMAIN": string(),
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
