from allauth.socialaccount.providers.base.constants import AuthProcess
from django.http import HttpResponseBadRequest
from django.views import View

from apps.users.reauthentication.forms.prove_with_provider import ProveWithProviderForm
from apps.users.reauthentication.proof import proving_state


class ProveWithProviderView(View):
    """Sends the signed-in person to their provider to sign in again, as the proof the gate asks for.

    A real form POST with a CSRF token rather than an API call, so the browser follows the redirect
    to the provider natively. What comes back is recognised by the stashed state and answered by
    `SocialAccountAdapter.pre_social_login`, which never lets it log anybody in or out.
    """

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
            # `max_age=0` is what obliges an OpenID Connect provider to challenge again and to say when
            # it did (`auth_time`); `prompt=login` asks for the same thing in the older vocabulary.
            auth_params={**provider.get_auth_params(), "prompt": "login", "max_age": "0"},
            headless=True,
        )
