from django.http import JsonResponse
from oauth2_provider.models import get_application_model
from oauth2_provider.scopes import get_scopes_backend
from oauth2_provider.views import DeviceAuthorizationView as _DeviceAuthorizationView


Application = get_application_model()


class DeviceAuthorizationView(_DeviceAuthorizationView):
    """DOT's, refusing what oauthlib does not check at this end: a client registered to sign people in by
    redirect, and a scope beyond what its application may ask for - which would otherwise be put to
    somebody for consent, and refused only when the device came back for its token.

    An unknown or unapproved client is left to DOT, which refuses it as no client at all.
    """

    def post(self, request, *args, **kwargs):
        application = Application.objects.filter(client_id=request.POST.get("client_id")).first()
        if application is not None and application.is_approved:
            if application.authorization_grant_type != Application.GRANT_DEVICE_CODE:
                return JsonResponse({"error": "unauthorized_client"}, status=400)
            asked = set(request.POST.get("scope", "").split())
            if not asked <= set(get_scopes_backend().get_available_scopes(application=application)):
                return JsonResponse({"error": "invalid_scope"}, status=400)
        # The route captures nothing, so there are no arguments to pass on.
        return super().post(request)
