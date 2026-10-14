from django.contrib.auth import models as auth_models
from django.contrib.auth.backends import ModelBackend

from apps.users.permissions import VOCABULARY


class PermissionsBackend(ModelBackend):
    """The only backend that answers permission questions, and it authenticates nobody.

    Permissions read as bare `where:action:what` names rather than `app_label.codename`, expanded through
    what each one requires.
    """

    def authenticate(self, request, **kwargs):
        return None

    def _get_permissions(self, user_obj, obj, from_name):
        """`ModelBackend`'s, answering bare codenames."""
        if not user_obj.is_active or user_obj.is_anonymous or obj is not None:
            return set()
        cache_name = f"_{from_name}_perm_cache"
        if not hasattr(user_obj, cache_name):
            if user_obj.is_superuser:
                permissions = auth_models.Permission.objects.all()
            else:
                permissions = getattr(self, f"_get_{from_name}_permissions")(user_obj)
            setattr(user_obj, cache_name, set(permissions.values_list("codename", flat=True).order_by()))
        return getattr(user_obj, cache_name)

    def get_all_permissions(self, user_obj, obj=None):
        """Direct and group grants, expanded through what each requires.

        `get_user_permissions` and `get_group_permissions` stay unexpanded on purpose: they answer "what was
        granted", this answers "what can this user do".
        """
        if not user_obj.is_active or user_obj.is_anonymous or obj is not None:
            return set()
        if not hasattr(user_obj, "_perm_cache"):
            granted = VOCABULARY.closure({*self.get_user_permissions(user_obj), *self.get_group_permissions(user_obj)})
            # Set by a token's authenticator for one request: the person may hold more than the token they
            # handed an application, or made for themselves, was given.
            token_scopes = getattr(user_obj, "token_scopes", None)
            if token_scopes is not None:
                # Both sides expanded before they meet. Narrowing first would make a permission that is only
                # implied impossible to give a token on its own.
                granted &= VOCABULARY.closure(token_scopes)
            user_obj._perm_cache = granted
        return user_obj._perm_cache

    def has_module_perms(self, user_obj, app_label):
        """`has_module_perms("users")` means "holds any `users:*`". `ModelBackend`'s splits on a dot."""
        return user_obj.is_active and any(
            permission.split(":")[0] == app_label for permission in self.get_all_permissions(user_obj)
        )
