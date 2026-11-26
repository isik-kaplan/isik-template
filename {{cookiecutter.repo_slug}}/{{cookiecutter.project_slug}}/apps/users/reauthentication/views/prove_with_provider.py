import json

from allauth.socialaccount.providers.base.constants import AuthProcess
from django.http import HttpResponseBadRequest
from django.views import View

from apps.users.reauthentication.forms.prove_with_provider import ProveWithProviderForm
from apps.users.reauthentication.proof import proving_state


# Google documents no max_age, and sends auth_time only when asked for it by name.
CLAIMS = {"google": {"claims": json.dumps({"id_token": {"auth_time": {"essential": True}}})}}


class ProveWithProviderView(View):
    """Sends the signed-in person to their provider to sign in again. A form POST, not an API call, so
    the browser follows the redirect."""

    def post(self, request):
        form = ProveWithProviderForm(request.POST, request=request)
        if not form.is_valid():
            return HttpResponseBadRequest()
        provider = form.cleaned_data["provider"]
        return provider.redirect(
            request,
            AuthProcess.LOGIN,
            next_url=form.cleaned_data["callback_url"],
            data=proving_state(),
            # `max_age=0` obliges an OIDC provider to challenge and report `auth_time`; `prompt=login` is older.
            auth_params={
                **provider.get_auth_params(),
                "prompt": "login",
                "max_age": "0",
                **CLAIMS.get(provider.id, {}),
            },
            headless=True,
        )
