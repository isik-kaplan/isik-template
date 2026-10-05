"""An exemption that carries the reason it exists.

isik's opt-outs accept any non-blank string, so "n/a" satisfies them and a comment beside it is the only
thing saying why. A `str` subclass drops into the same slot while making the reason a required argument,
validated where it is written. The minimum length is there so "n/a" is not the easier answer.
"""

from isik.common.utils.declared_string import DeclaredString, text


SHORTEST_USEFUL_REASON = 40


class Exemption(DeclaredString):
    reason = text(min_length=SHORTEST_USEFUL_REASON)
