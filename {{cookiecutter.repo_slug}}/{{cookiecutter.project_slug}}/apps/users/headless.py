import dataclasses
from types import MappingProxyType

from allauth.headless.adapter import DefaultHeadlessAdapter


# Any fixed uuid7-shaped value.
EXAMPLE_USER_ID = "01920000-0000-7000-8000-000000000000"


class HeadlessAdapter(DefaultHeadlessAdapter):
    """Adds "language" to the headless user payload."""

    def get_user_dataclass(self):
        base = super().get_user_dataclass()
        # Upstream draws a random uuid4 example each call, so the schema would never be stable.
        identifier = base.__dataclass_fields__["id"]
        identifier.metadata = MappingProxyType({**identifier.metadata, "example": EXAMPLE_USER_ID})
        # Needs a default: the base user_as_dataclass() builds this class without "language".
        return dataclasses.make_dataclass(
            base.__name__, [("language", str, dataclasses.field(default_factory=str))], bases=(base,)
        )

    def user_as_dataclass(self, user):
        base = super().user_as_dataclass(user)
        return dataclasses.replace(base, language=user.language)
