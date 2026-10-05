from allauth.account.adapter import get_adapter as get_account_adapter
from allauth.socialaccount.models import SocialAccount
from django import forms
from django.utils.translation import gettext_lazy as _

from apps.users.reauthentication.proof import can_prove_with


class ProveWithProviderForm(forms.Form):
    """Which of the signed-in person's own connected providers to prove themselves at, and where to
    come back to. Only one that can be held to a fresh challenge is accepted."""

    provider = forms.CharField()
    callback_url = forms.CharField()

    def __init__(self, data, *, request):
        super().__init__(data)
        self.request = request

    def clean_callback_url(self):
        url = self.cleaned_data["callback_url"]
        if not get_account_adapter().is_safe_url(url):
            raise forms.ValidationError(_("That is not a page this site can send you back to."))
        return url

    def clean_provider(self):
        account = SocialAccount.objects.filter(
            user_id=self.request.user.pk, provider=self.cleaned_data["provider"]
        ).first()
        provider = account.get_provider() if account is not None else None
        if provider is None or not can_prove_with(provider):
            raise forms.ValidationError(_("You cannot confirm it is you through that provider."))
        return provider
