from django.contrib import admin

from apps.common.admin.base import BaseAdmin
from apps.users.models.user import User


@admin.register(User)
class UserAdmin(BaseAdmin):
    search_fields = ["username", "email"]
    list_display = ["username", "email", "is_staff", "is_active"]
    list_filter = ["is_staff", "is_superuser", "is_active"]
    # Editing this field directly would store a new password as plaintext, not hash it - view-only
    # here; use the "change password" admin action or `manage.py changepassword` to actually set one.
    global_readonly_fields = ["password"]
    object_fieldsets = [
        (("username", "password"), "Credentials"),
        (("first_name", "last_name", "email"), "Personal info"),
        (("is_active", "is_staff", "is_superuser", "groups", "user_permissions"), "Permissions"),
    ]
