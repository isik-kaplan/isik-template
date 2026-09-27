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
        # default="", not required: the base class's own user_as_dataclass() also calls
        # self.get_user_dataclass() (polymorphically resolving to this override) but builds its
        # kwargs with no idea "language" exists - a required field there would crash every call,
        # including the super().user_as_dataclass() this class's own override makes below.
        return dataclasses.make_dataclass(
            "User",
            [
                (
                    "language",
                    str,
                    dataclasses.field(
                        default="",
                        metadata={
                            "description": 'The user\'s saved language preference, or "" for none (browser fallback).',
                            "example": "en",
                        },
                    ),
                )
            ],
            bases=(base,),
        )

    def user_as_dataclass(self, user):
        base = super().user_as_dataclass(user)
        return dataclasses.replace(base, language=getattr(user, "language", "") or "")
