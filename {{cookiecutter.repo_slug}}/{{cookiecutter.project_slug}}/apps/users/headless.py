import dataclasses

from allauth.headless.adapter import DefaultHeadlessAdapter


class HeadlessAdapter(DefaultHeadlessAdapter):
    """Adds "language" to the session/user payload every headless response already carries, so the
    frontend can resolve the signed-in user's language preference with no extra request.

    Per DefaultHeadlessAdapter.serialize_user()'s own docstring, get_user_dataclass()/
    user_as_dataclass() - not serialize_user() itself - are the extension points that also keep a
    custom field reflected in the (dynamically rendered) OpenAPI spec.
    """

    def get_user_dataclass(self):
        base = super().get_user_dataclass()
        # base.__name__, not a fresh "User" literal - it already is "User" (allauth's own
        # get_user_dataclass() names it that), so this never needs its own copy to drift from it.
        # default_factory=str, not default="" - the base class's own user_as_dataclass() also calls
        # self.get_user_dataclass() (polymorphically resolving to this override) but builds its
        # kwargs with no idea "language" exists, so this field needs *some* default or that call
        # crashes - user_as_dataclass() below always overrides it before returning, so which
        # default hardly matters, and str() is what "no value yet" already means for this field.
        return dataclasses.make_dataclass(
            base.__name__, [("language", str, dataclasses.field(default_factory=str))], bases=(base,)
        )

    def user_as_dataclass(self, user):
        base = super().user_as_dataclass(user)
        # user.language directly, not getattr(user, "language", ...): user is always this
        # project's own User model (apps/users/models/user.py), which always has this field -
        # blank, never missing - so there is no absent case to default around.
        return dataclasses.replace(base, language=user.language)
