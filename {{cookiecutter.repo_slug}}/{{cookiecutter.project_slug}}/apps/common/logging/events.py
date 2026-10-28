"""The closed vocabulary of loggable events; `log()` refuses anything not declared here.

Names are dotted `noun.past_verb` and are what saved queries search by, so they outlive module paths.
"""

import logging
import re
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Event:
    """`severity` belongs to the event, not the call site, so every site agrees on it."""

    name: str
    severity: int
    requires: tuple[str, ...] = field(default_factory=tuple)
    # Written through `audit()` and refused by `log()`.
    audited: bool = False


# The record attribute holding our fields. Here, not beside `log()`: formatters are built mid-settings
# and must import nothing that reads a setting.
PAYLOAD = "{{ cookiecutter.project_slug }}"

NAME_SHAPE = re.compile(r"[a-z][a-z_]*(\.[a-z][a-z_]*)*")

DECLARED: dict[str, Event] = {}


def declare(name: str, severity: int, requires: tuple[str, ...] = (), *, audited: bool = False) -> Event:
    """`log()` accepts only the registered instance, so an `Event(...)` built elsewhere is not loggable."""
    if not NAME_SHAPE.fullmatch(name):
        raise ValueError(f"{name!r} is not a dotted lowercase name like 'permission.refused'.")
    if name in DECLARED:
        raise ValueError(f"{name!r} is declared twice - an event name is how it is searched for.")
    DECLARED[name] = Event(name=name, severity=severity, requires=tuple(requires), audited=audited)
    return DECLARED[name]


# Written by the request middleware, never by hand.
REQUEST = declare("request", logging.INFO, ("method", "path", "status", "duration_ms"))

# Not an error: a refusal is the system working.
PERMISSION_REFUSED = declare("permission.refused", logging.INFO, ("permission",))

# `user` is required: the context was opened before login and names whoever the request started as.
LOGIN_SUCCEEDED = declare("login.succeeded", logging.INFO, ("user",))
# Nothing about who was tried: the identifier somebody typed is theirs.
LOGIN_FAILED = declare("login.failed", logging.WARNING)
LOGOUT_SUCCEEDED = declare("logout.succeeded", logging.INFO, ("user",))
SIGNUP_COMPLETED = declare("signup.completed", logging.INFO, ("user",))
EMAIL_CONFIRMED = declare("email.confirmed", logging.INFO, ("user",))

# Audited: each moves control of an account (its password, or where a reset is sent).
PASSWORD_CHANGED = declare("password.changed", logging.WARNING, ("user", "how"), audited=True)
PASSWORD_RESET = declare("password.reset", logging.WARNING, ("user",), audited=True)
EMAIL_CHANGED = declare("email.changed", logging.WARNING, ("user",), audited=True)

# Recovery codes that come and go with a factor get no line of their own; regenerating them does.
MFA_ENABLED = declare("mfa.enabled", logging.WARNING, ("user", "method"), audited=True)
MFA_DISABLED = declare("mfa.disabled", logging.WARNING, ("user", "method"), audited=True)
RECOVERY_CODES_REGENERATED = declare("recovery_codes.regenerated", logging.WARNING, ("user",), audited=True)
PASSKEY_ADDED = declare("passkey.added", logging.WARNING, ("user",), audited=True)
PASSKEY_REMOVED = declare("passkey.removed", logging.WARNING, ("user",), audited=True)

# Only the demanded/proved pair says a gate was crossed; spent means the act went ahead.
REAUTHENTICATION_DEMANDED = declare("reauthentication.demanded", logging.INFO, ("user", "act"))
REAUTHENTICATION_PROVED = declare("reauthentication.proved", logging.INFO, ("user", "method"))
REAUTHENTICATION_SPENT = declare("reauthentication.spent", logging.INFO, ("user", "act"))

# Raising the login ladder signs people out, so the sweep is audited. `refused_by_policy` so it never
# reads as `login.failed`'s wrong password.
LOGIN_REFUSED_BY_POLICY = declare("login.refused_by_policy", logging.WARNING, ("user", "policy"))
LOGIN_POLICY_SWEPT = declare("login_policy.swept", logging.WARNING, ("policy", "sessions"), audited=True)

# A mail allauth added since apps/notifications/kinds.py was written: sent, but kept nowhere.
ACCOUNT_MAIL_UNRECORDED = declare("account_mail.unrecorded", logging.WARNING, ("template",))
