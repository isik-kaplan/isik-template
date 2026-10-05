"""What a field says when the honest answer is nothing.

Empty to Django, so no sentinel reaches a column comment or a published description, with the reason
kept where only the `every_field_says_what_it_is` check looks. `displays_as=""` is what makes it
empty while `deconstruct()` still writes it out as itself - flat, the migration state would rebuild
`help_text`'s own default and `makemigrations` would ask for the change forever.
"""

from isik.common.utils.declared_string import DeclaredString, text


SHORTEST_USEFUL_REASON = 40


class _Unsaid(DeclaredString, displays_as=""):
    reason = text(min_length=SHORTEST_USEFUL_REASON)


class NoHelpText(_Unsaid):
    """This field needs no description in the API, and here is why."""


class NoComment(_Unsaid):
    """This column needs no comment in the database, and here is why."""
