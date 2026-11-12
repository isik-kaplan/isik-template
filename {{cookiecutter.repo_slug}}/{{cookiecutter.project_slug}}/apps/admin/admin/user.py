from django.contrib import admin

from apps.admin.admin.direct_permission_inline import DirectPermissionInline
from apps.admin.admin.group_membership_inline import GroupMembershipInline
from apps.common.admin.base import BaseAdmin
from apps.users.models.user import User


@admin.register(User)
class UserAdmin(BaseAdmin):
    inlines = [GroupMembershipInline, DirectPermissionInline]
    search_fields = ["email", "username", "first_name", "last_name"]
    list_display = ["email", "username", "first_name", "last_name", "is_staff", "is_active"]
    list_filter = ["is_staff", "is_superuser", "is_active"]
    # Editing password here would store it as plaintext.
    global_readonly_fields = ["password", "terms_version", "terms_accepted_at"]
    object_fieldsets = [
        (("email", "password"), "Credentials"),
        (("first_name", "last_name", "username"), "Personal info"),
        (("is_active", "is_staff", "is_superuser"), "Permissions"),
        # Read-only: an acceptance nobody made is worse than none.
        (("terms_version", "terms_accepted_at"), "Terms"),
    ]
