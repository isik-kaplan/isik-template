"""The permission vocabulary, declared here and nowhere else.

Names are `where:action:what` - the same strings an application asks for as OAuth scopes, so narrowing a
token to what it was granted needs no translation table. `sync.py` writes these into `auth_permission`.
"""

from django.core.exceptions import ImproperlyConfigured


class Declaration(str):
    """A `str`, so `has_perm(Permission.FOO)` needs no unwrapping and a name compares equal to the same
    string arriving in a token's scopes."""

    def __new__(cls, name, *, label, delegatable, requires=()):
        # `has_module_perms` splits on the colons, so a name missing a segment would make it answer about
        # the wrong half of another permission.
        segments = name.split(":")
        if len(segments) != 3 or not all(segments):
            raise ValueError(f"{name!r} is not where:action:what")
        self = super().__new__(cls, name)
        self.label = label
        self.delegatable = delegatable
        self.requires = tuple(requires)
        return self

    def __repr__(self):
        return f"<Declaration {str(self)!r}>"


class Vocabulary:
    """An object rather than module functions, so the sync, the backend and their tests can work against a
    constructed set of declarations instead of the live one."""

    def __init__(self, declarations):
        self.by_name = {str(declaration): declaration for declaration in declarations}
        for declaration in declarations:
            for required in declaration.requires:
                if required not in self.by_name:
                    raise ImproperlyConfigured(f"{declaration} requires {required!r}, which is not declared.")

    def delegatable(self):
        """What an application may ask to act with, in name order."""
        # Declarations are strings, so they sort by name as they are.
        return sorted(declaration for declaration in self.by_name.values() if declaration.delegatable)

    def not_delegatable(self, names):
        """The names here an application may not be given, sorted. One nobody declared counts as not
        delegatable: an undeclared scope is not one this deployment agreed to hand over."""
        refused = []
        for name in names:
            declaration = self.by_name.get(str(name))
            if declaration is None or not declaration.delegatable:
                refused.append(str(name))
        return sorted(refused)

    def closure(self, names):
        """Expanded when checked, not when granted, so a stored grant stays a faithful record of what was
        granted. An undeclared name passes through: a stale grant should not raise."""
        expanded = set()
        for name in names:
            self._expand(name, expanded)
        return expanded

    def _expand(self, name, expanded):
        # Recursive rather than a queue, so a walk that forgets where it has been fails at once on a cycle
        # instead of spinning forever.
        if name in expanded:
            return
        expanded.add(name)
        for required in getattr(self.by_name.get(name), "requires", ()):
            self._expand(required, expanded)


class Permission:
    """The vocabulary. `Permission.FOO` is the string to pass to `has_perm`."""

    # Running the people list is not the same trust as widening what people may do, so they are two names:
    # somebody can be given the first without the second.
    USERS_MANAGE_USER = Declaration(
        "users:manage:user",
        label="See everybody's account, and activate or deactivate them",
        delegatable=True,
    )

    # Every permission, including ones not declared yet. What keeps that safe is the rule where it is used:
    # you may grant only what you hold yourself, so nothing is created from nothing. Delegatable because an
    # application cannot widen its own access by granting - that is its token's scopes, which a person chose.
    USERS_GRANT_RIGHTS = Declaration(
        "users:grant:rights",
        label="Change what other people may do",
        delegatable=True,
        requires=("users:manage:user",),
    )

    @classmethod
    def declared(cls):
        return tuple(value for value in vars(cls).values() if isinstance(value, Declaration))


VOCABULARY = Vocabulary(Permission.declared())
