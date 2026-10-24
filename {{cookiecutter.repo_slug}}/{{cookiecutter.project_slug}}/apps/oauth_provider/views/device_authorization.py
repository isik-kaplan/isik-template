from django.http import JsonResponse
from oauth2_provider.models import get_application_model
from oauth2_provider.scopes import get_scopes_backend
from oauth2_provider.views import DeviceAuthorizationView as _DeviceAuthorizationView


Application = get_application_model()


class DeviceAuthorizationView(_DeviceAuthorizationView):
    """Refuses what oauthlib does not check here: a redirect-flow client, and a scope beyond what its
    application may ask for, which would otherwise reach consent and fail only at the token."""

    def post(self, request, *args, **kwargs):
        application = Application.objects.filter(client_id=request.POST.get("client_id")).first()
        if application is not None and application.is_approved:
            if application.authorization_grant_type != Application.GRANT_DEVICE_CODE:
                return JsonResponse({"error": "unauthorized_client"}, status=400)
            asked = set(request.POST.get("scope", "").split())
            if not asked <= set(get_scopes_backend().get_available_scopes(application=application)):
                return JsonResponse({"error": "invalid_scope"}, status=400)
        return super().post(request)
