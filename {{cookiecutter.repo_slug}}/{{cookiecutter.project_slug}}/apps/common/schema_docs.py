"""What a field says when the honest answer is nothing.

Empty to Django, so no sentinel reaches a column comment or a published description, with the reason
kept where only the `every_field_says_what_it_is` check looks. `shows_as=""` is what makes it empty
while `deconstruct()` still writes it out as itself - flat, the migration state would rebuild
`help_text`'s own default and `makemigrations` would ask for the change forever.
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
