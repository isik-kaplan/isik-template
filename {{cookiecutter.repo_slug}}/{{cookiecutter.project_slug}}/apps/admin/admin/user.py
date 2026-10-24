from django.contrib import admin

from apps.common.admin.base import BaseAdmin
from apps.users.models.user import User


@admin.register(User)
class UserAdmin(BaseAdmin):
    search_fields = ["username", "email"]
    list_display = ["username", "email", "is_staff", "is_active"]
    list_filter = ["is_staff", "is_superuser", "is_active"]
    # Editing password here would store it as plaintext.
    global_readonly_fields = ["password", "terms_version", "terms_accepted_at"]
    object_fieldsets = [
        (("username", "password"), "Credentials"),
        (("first_name", "last_name", "email"), "Personal info"),
        (("is_active", "is_staff", "is_superuser", "groups", "user_permissions"), "Permissions"),
        # Read-only: an acceptance nobody made is worse than none.
        (("terms_version", "terms_accepted_at"), "Terms"),
    ]
