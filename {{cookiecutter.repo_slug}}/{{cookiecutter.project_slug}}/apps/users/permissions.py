"""The permission vocabulary. Names are `where:action:what`, the same strings as OAuth scopes."""

from django.core.exceptions import ImproperlyConfigured


class Declaration(str):
    """A `str`, so it passes to `has_perm` and compares equal to a token's scopes."""

    def __new__(cls, name, *, label, delegatable, requires=()):
        # `has_module_perms` splits on the colons.
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
    """An object so tests can build one from their own declarations."""

    def __init__(self, declarations):
        self.by_name = {str(declaration): declaration for declaration in declarations}
        for declaration in declarations:
            for required in declaration.requires:
                if required not in self.by_name:
                    raise ImproperlyConfigured(f"{declaration} requires {required!r}, which is not declared.")

    def delegatable(self):
        return sorted(declaration for declaration in self.by_name.values() if declaration.delegatable)

    def not_delegatable(self, names):
        """Sorted; an undeclared name counts as not delegatable."""
        refused = []
        for name in names:
            declaration = self.by_name.get(str(name))
            if declaration is None or not declaration.delegatable:
                refused.append(str(name))
        return sorted(refused)

    def closure(self, names):
        """Expanded when checked, so stored grants stay a record. Undeclared names pass through."""
        expanded = set()
        for name in names:
            self._expand(name, expanded)
        return expanded

    def _expand(self, name, expanded):
        # Recursive, so a bug that forgets visited names fails fast on a cycle instead of spinning.
        if name in expanded:
            return
        expanded.add(name)
        for required in getattr(self.by_name.get(name), "requires", ()):
            self._expand(required, expanded)


class Permission:
    """The vocabulary. `Permission.FOO` is the string to pass to `has_perm`."""

    # Separate from granting rights, which is a higher trust.
    USERS_MANAGE_USER = Declaration(
        "users:manage:user",
        label="See everybody's account, and activate or deactivate them",
        delegatable=True,
    )

    # Safe to delegate: you may grant only what you hold, and a token's scopes cap that.
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
