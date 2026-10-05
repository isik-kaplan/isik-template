"""Everything this deployment is allowed to log, and what each one has to carry.

A closed vocabulary. `log()` refuses an event that was not declared here, so adding a log line is a
line in this file somebody reviews rather than a string somebody invents at six in the evening. The
friction is the feature.

A name is a noun and a past-tense verb, dotted: what it happened to, then what happened. It is the
field everything is searched by, so it outlives the module the call sits in - moving the code does
not break a saved query the way a module path would.
"""

import logging
import re
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Event:
    """One thing worth writing down, and the fields it is useless without.

    `severity` belongs to the event rather than the call site: a refusal is a refusal wherever it is
    raised from, and choosing per call is how twenty sites end up disagreeing about the same thing.
    """

    name: str
    severity: int
    requires: tuple[str, ...] = field(default_factory=tuple)
    # Written through `audit()` and refused by `log()`, which is what makes "a different sink with
    # different rules" a fact about the event rather than a habit at the call site.
    audited: bool = False


# Where a record carries what this package put on it. One attribute rather than several, so a
# formatter can tell our records from a library's by asking once. Here rather than beside `log()`,
# because the formatters are built while Django is still configuring itself and must import nothing
# that reaches for a setting.
PAYLOAD = "{{ cookiecutter.project_slug }}"

# Lowercase dotted words: a name somebody saves a query against cannot be one spelling here and
# another in the collector.
NAME_SHAPE = re.compile(r"[a-z][a-z_]*(\.[a-z][a-z_]*)*")

DECLARED: dict[str, Event] = {}


def declare(name: str, severity: int, requires: tuple[str, ...] = (), *, audited: bool = False) -> Event:
    """Register one, refusing a name already taken or not shaped like the others.

    Registration is what closes the vocabulary: `log()` checks the event it was handed is the one
    registered under its name, so an `Event(...)` built anywhere else is not loggable.
    """
    if not NAME_SHAPE.fullmatch(name):
        raise ValueError(f"{name!r} is not a dotted lowercase name like 'permission.refused'.")
    if name in DECLARED:
        raise ValueError(f"{name!r} is declared twice - an event name is how it is searched for.")
    DECLARED[name] = Event(name=name, severity=severity, requires=tuple(requires), audited=audited)
    return DECLARED[name]


# The request line, written by the middleware rather than by hand - the only event nobody calls.
REQUEST = declare("request", logging.INFO, ("method", "path", "status", "duration_ms"))

# Somebody was refused something they asked for. Not an error: a refusal is the system working, and
# what is worth having later is that it happened and to whom.
PERMISSION_REFUSED = declare("permission.refused", logging.INFO, ("permission",))

# Signing in and out. `user` is required even though the context carries one, because the context
# was opened before the login and names whoever the request started as.
LOGIN_SUCCEEDED = declare("login.succeeded", logging.INFO, ("user",))
# Nothing about who was tried: the identifier somebody typed is theirs, and the request line beside
# this one already carries the address it came from.
LOGIN_FAILED = declare("login.failed", logging.WARNING)
LOGOUT_SUCCEEDED = declare("logout.succeeded", logging.INFO, ("user",))
SIGNUP_COMPLETED = declare("signup.completed", logging.INFO, ("user",))
EMAIL_CONFIRMED = declare("email.confirmed", logging.INFO, ("user",))

# Audited, not logged. Each one moves control of an account - whoever holds the password, or the
# address a reset is sent to - and none may sit in a stream somebody can turn down mid-incident.
PASSWORD_CHANGED = declare("password.changed", logging.WARNING, ("user", "how"), audited=True)
PASSWORD_RESET = declare("password.reset", logging.WARNING, ("user",), audited=True)
EMAIL_CHANGED = declare("email.changed", logging.WARNING, ("user",), audited=True)

# Second factors, audited for the same reason: each adds or removes a way to prove who you are. The
# recovery codes that come and go with the first and last factor are not their own line - they are
# worth nothing without the factor they shadow - but asking for a fresh set is.
MFA_ENABLED = declare("mfa.enabled", logging.WARNING, ("user", "method"), audited=True)
MFA_DISABLED = declare("mfa.disabled", logging.WARNING, ("user", "method"), audited=True)
RECOVERY_CODES_REGENERATED = declare("recovery_codes.regenerated", logging.WARNING, ("user",), audited=True)
PASSKEY_ADDED = declare("passkey.added", logging.WARNING, ("user",), audited=True)
PASSKEY_REMOVED = declare("passkey.removed", logging.WARNING, ("user",), audited=True)

# Proving it is you again before an act. A provider's proof is recorded by this project (a password
# or a factor's code is allauth's own record); spending one is the act it was asked for going ahead.
REAUTHENTICATION_PROVED = declare("reauthentication.proved", logging.INFO, ("user", "method"))
REAUTHENTICATION_SPENT = declare("reauthentication.spent", logging.INFO, ("user",))

# The login ladder. A refused sign-in is the ladder working; raising it signs people out, which moves
# control of every account it shuts out, so that line is audited.
LOGIN_REFUSED_BY_POLICY = declare("login.refused_by_policy", logging.WARNING, ("user", "policy"))
LOGIN_POLICY_SWEPT = declare("login_policy.swept", logging.WARNING, ("policy", "sessions"), audited=True)
