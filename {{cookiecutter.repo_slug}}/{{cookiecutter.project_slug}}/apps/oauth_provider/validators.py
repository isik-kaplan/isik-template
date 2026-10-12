from allauth.account.models import EmailAddress
from oauth2_provider.oauth2_validators import OAuth2Validator as _OAuth2Validator


class OAuth2Validator(_OAuth2Validator):
    """Fills in the profile and email claims DOT advertises but never populates. DOT still drops each one
    whose scope was not granted (`oidc_claim_scope`), so this can say everything it knows."""

    def get_additional_claims(self, request):
        user = request.user
        claims = {"preferred_username": user.username}
        if user.first_name:
            claims["given_name"] = user.first_name
        if user.last_name:
            claims["family_name"] = user.last_name
        if user.get_full_name():
            claims["name"] = user.get_full_name()

        # The address allauth verified, not User.email, which nothing checks; createsuperuser writes no
        # EmailAddress row, so such an account falls back to it, said to be unverified.
        primary = EmailAddress.objects.filter(user=user, primary=True).first()
        email = primary.email if primary else user.email
        if email:
            claims["email"] = email
            claims["email_verified"] = bool(primary and primary.verified)

        # When they last really signed in - see AuthorizationView.get for why that is `last_login`.
        if user.last_login:
            claims["auth_time"] = int(user.last_login.timestamp())
        return claims
