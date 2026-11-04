"""What a signup asks somebody to be called, chosen when the project was generated."""

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _


NAMES = ("first_name", "last_name", "username")
REQUIRED = (_("This field is required."), "required")
NOT_OFFERED = (_("This project does not ask for one."), "not_offered")


class NameRequirement(models.TextChoices):
    """A full name and a handle, each required, optional or never asked for.

    The combinations that could leave somebody with no name at all are absent. A policy over signup, not
    an invariant over the row: accounts made before a change stay as they are.
    """

    FULL_ONLY = "full_only", "First and last name; no handle"
    FULL_AND_USERNAME = "full_and_username", "First and last name, and a handle"
    FULL_WITH_OPTIONAL_USERNAME = "full_with_optional_username", "First and last name; handle optional"
    USERNAME_WITH_OPTIONAL_FULL = "username_with_optional_full", "A handle; first and last name optional"
    USERNAME_ONLY = "username_only", "A handle; no name asked for"

    @classmethod
    def current(cls):
        return cls(settings.NAME_REQUIREMENT)

    @property
    def required(self):
        """The fields a signup must carry."""
        full = ("first_name", "last_name")
        return {
            self.FULL_ONLY: full,
            self.FULL_AND_USERNAME: (*full, "username"),
            self.FULL_WITH_OPTIONAL_USERNAME: full,
            self.USERNAME_WITH_OPTIONAL_FULL: ("username",),
            self.USERNAME_ONLY: ("username",),
        }[self]

    @property
    def offered(self):
        """The fields a signup or a profile may carry at all."""
        full = ("first_name", "last_name")
        return {
            self.FULL_ONLY: full,
            self.FULL_AND_USERNAME: (*full, "username"),
            self.FULL_WITH_OPTIONAL_USERNAME: (*full, "username"),
            self.USERNAME_WITH_OPTIONAL_FULL: ("username", *full),
            self.USERNAME_ONLY: ("username",),
        }[self]

    def refusals(self, values):
        """(message, code) by field: what `values` leaves out that this requires, or carries that it never asks."""
        refused = {}
        for name, given in values.items():
            if not given and name in self.required:
                refused[name] = REQUIRED
            elif given and name not in self.offered:
                refused[name] = NOT_OFFERED
        return refused

    @property
    def login_methods(self):
        """A handle logs in only where every account made since has one."""
        return {"email", "username"} if "username" in self.required else {"email"}


def label(user):
    """Name, then handle, then address. The address fallback is only for surfaces staff alone can see."""
    return user.get_full_name() or user.username or user.email
