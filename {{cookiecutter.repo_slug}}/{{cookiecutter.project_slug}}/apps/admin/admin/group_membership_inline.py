from django.contrib import admin

from apps.users.models.user_group import UserGroup


# Django's admin edits a many-to-many with a model of its own only as rows like these.
class GroupMembershipInline(admin.TabularInline):
    model = UserGroup
    fields = ["group"]
    extra = 0
