from django.contrib import admin

from apps.users.models.user_permission import UserPermission


class DirectPermissionInline(admin.TabularInline):
    model = UserPermission
    fields = ["permission"]
    extra = 0
