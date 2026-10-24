from django.contrib.auth import models as auth_models
from django.contrib.auth.backends import ModelBackend

from apps.users.permissions import VOCABULARY


class PermissionsBackend(ModelBackend):
    """The only permission backend. Names are bare `where:action:what`, expanded through what each requires."""

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
        """Expanded, unlike `get_user_permissions`/`get_group_permissions`, which answer "what was granted"."""
        if not user_obj.is_active or user_obj.is_anonymous or obj is not None:
            return set()
        if not hasattr(user_obj, "_perm_cache"):
            granted = VOCABULARY.closure({*self.get_user_permissions(user_obj), *self.get_group_permissions(user_obj)})
            # Set by a token authenticator: the token may hold less than its person.
            token_scopes = getattr(user_obj, "token_scopes", None)
            if token_scopes is not None:
                # Both expanded first, or an implied-only permission could never be given to a token.
                granted &= VOCABULARY.closure(token_scopes)
            user_obj._perm_cache = granted
        return user_obj._perm_cache

    def has_module_perms(self, user_obj, app_label):
        """`has_module_perms("users")` means "holds any `users:*`"."""
        return user_obj.is_active and any(
            permission.split(":")[0] == app_label for permission in self.get_all_permissions(user_obj)
        )
