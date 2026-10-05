from django.contrib import admin, messages
from django.shortcuts import redirect
from django.urls import reverse
from django.utils.translation import gettext_lazy as _
from django.utils.translation import ngettext

from apps.admin.forms.site_settings import SiteSettingsForm
from apps.common.admin.base import BaseAdmin
from apps.users.login_policy import sweep
from apps.users.models.site_settings import SiteSettings
from apps.users.tasks.logins_closed import tell_the_people_a_rung_signed_out


@admin.register(SiteSettings)
class SiteSettingsAdmin(BaseAdmin):
    form = SiteSettingsForm
    object_fieldsets = [(("login_policy", "mail_the_people_signed_out"), _("Who may sign in"))]

    def changelist_view(self, request, extra_context=None):
        # One row, so the list is a detour: straight to it, or to creating it.
        existing = SiteSettings.objects.first()
        if existing is None:
            return redirect(reverse("admin:users_sitesettings_add"))
        return redirect(reverse("admin:users_sitesettings_change", args=[existing.pk]))

    def has_add_permission(self, request):
        return super().has_add_permission(request) and not SiteSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False

    def formfield_for_choice_field(self, db_field, request, **kwargs):
        # The top rung shuts out everybody but superusers, so only a superuser may choose it - nobody
        # below can pick the setting that locks them out of the setting.
        if db_field.name == "login_policy" and not request.user.is_superuser:
            top = SiteSettings.LoginPolicy.SUPERUSERS
            kwargs["choices"] = [choice for choice in db_field.choices if choice[0] != top]
        return super().formfield_for_choice_field(db_field, request, **kwargs)

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        self.sweep_on_a_new_rung(request, obj, form)

    def sweep_on_a_new_rung(self, request, obj, form):
        if "login_policy" not in form.changed_data:
            return
        swept = sweep(obj.login_policy)
        messages.info(
            request,
            ngettext("%(count)d session signed out.", "%(count)d sessions signed out.", swept) % {"count": swept},
        )
        if swept and form.cleaned_data["mail_the_people_signed_out"]:
            tell_the_people_a_rung_signed_out.delay()
