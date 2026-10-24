"""Sentinels for a field with nothing honest to say: empty to Django, the reason kept for the check.

`shows_as=""` lets `deconstruct()` still write it out as itself, or `makemigrations` would never settle.
"""

from isik.common.utils.exemptions import exemption_class


NoHelpText = exemption_class(
    "NoHelpText",
    rule="schema-docs.help-text",
    why="Every field says what it holds in help_text, which is the description the API publishes.",
    shows_as="",
)

NoComment = exemption_class(
    "NoComment",
    rule="schema-docs.db-comment",
    why="Every column says what it holds in db_comment, which is what somebody in psql has instead of the code.",
    shows_as="",
)
