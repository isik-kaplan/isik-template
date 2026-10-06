"""What a routed POST says when it leaves the idempotency guard, held to a floor by the checks here.

isik's `{action: reason}` maps take any reason that is not blank or a placeholder; these make the one
POST that opts out say enough for a reviewer to agree with it.
"""

from isik.common.utils.exemptions import exemption_class


NoIdempotencyKey = exemption_class(
    "NoIdempotencyKey",
    rule="idempotency.exempt-action",
    why="Every routed POST honours an idempotency key, so a retried request cannot do its work twice.",
)

NoReplay = exemption_class(
    "NoReplay",
    rule="idempotency.no-replay",
    why="A retried POST is answered with what its first attempt got, so a caller who lost that answer can read it.",
)
