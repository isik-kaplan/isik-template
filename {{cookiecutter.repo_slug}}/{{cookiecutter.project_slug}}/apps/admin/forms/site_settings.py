from django import forms
from django.utils.translation import gettext_lazy as _

from apps.users.models.site_settings import SiteSettings


class SiteSettingsForm(forms.ModelForm):
    # Per change, not stored: during a breach you do not want to mail the account you just cut off.
    mail_the_people_signed_out = forms.BooleanField(
        required=False,
        label=_("Email the people this signs out"),
        help_text=_("Leave this off during a breach, so the account you are shutting out is not told."),
    )

    class Meta:
        model = SiteSettings
        fields = ["login_policy"]
