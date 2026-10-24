from allauth.account.models import EmailAddress
from oauth2_provider.oauth2_validators import OAuth2Validator as _OAuth2Validator

from apps.users.login_policy import admits_session


class OAuth2Validator(_OAuth2Validator):
    """Fills in the claims DOT advertises but never populates; DOT drops those whose scope was not granted."""

    def validate_bearer_token(self, token, scopes, request):
        """Also refuses a token whose application or person has since been shut out: DOT checks neither."""
        if not super().validate_bearer_token(token, scopes, request):
            return False
        access_token = request.access_token
        return bool(
            access_token.application.is_approved
            and access_token.user is not None
            and access_token.user.is_active
            and admits_session(access_token.user)
        )

    def get_additional_claims(self, request):
        user = request.user
        claims = {"preferred_username": user.username}
        if user.first_name:
            claims["given_name"] = user.first_name
        if user.last_name:
            claims["family_name"] = user.last_name
        if user.get_full_name():
            claims["name"] = user.get_full_name()

        # allauth's verified address; createsuperuser writes none, so fall back to User.email, unverified.
        primary = EmailAddress.objects.filter(user=user, primary=True).first()
        email = primary.email if primary else user.email
        if email:
            claims["email"] = email
            claims["email_verified"] = bool(primary and primary.verified)

        if user.last_login:
            claims["auth_time"] = int(user.last_login.timestamp())
        return claims
