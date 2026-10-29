"""Every feature a person can be granted, every setting they choose within them, and who may force one. Named by
ISIK_FEATURES["SETTINGS"], so a setting's columns on UserOverrides come from here."""

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils.translation import gettext_lazy as _
from isik.django.apps.common.forcing import declare_force_source
from isik.django.apps.features.declarations import AtMost, {% if cookiecutter.webhooks == "users" %}Fixed, {% endif %}declare_feature, declare_setting

from apps.common.api.request_policies import RecentlyProvedWhoTheyAre


STAFF = declare_force_source("staff", label=_("Staff"), shows_reason_to_holder=True)
# A grant's source: given by staff, or a trial with an end.
GRANT_SOURCES = ("staff", "trial")

LONG_LIVED_TOKENS = declare_feature(
    "long_lived_tokens",
    label=_("Long-lived tokens"),
    description=_("Personal access tokens that last longer than 90 days."),
)
{%- if cookiecutter.webhooks == "users" %}
WEBHOOKS = declare_feature("webhooks", label=_("Webhooks"), description=_("Send your notifications to your own URLs."))
{%- endif %}

declare_setting(
    "token_lifetime_days",
    models.PositiveIntegerField(validators=[MinValueValidator(1), MaxValueValidator(365)]),
    default=30,
    feature=LONG_LIVED_TOKENS,
    without_feature=AtMost(90),
    label=_("Token lifetime"),
    description=_("How many days a new personal access token works for."),
)
declare_setting(
    "two_factor_required",
    models.BooleanField(),
    default=False,
    label=_("Keep two-factor sign-in"),
    description=_("While on, the last way you prove a sign-in with a second factor can't be removed."),
    request_policies=(RecentlyProvedWhoTheyAre,),
)
{%- if cookiecutter.webhooks == "users" %}
declare_setting(
    "max_endpoints",
    models.PositiveIntegerField(validators=[MaxValueValidator(50)]),
    default=5,
    feature=WEBHOOKS,
    without_feature=Fixed(0),
    # A limit staff set for somebody, which they read but don't choose.
    holder_may_change=False,
    label=_("Webhook endpoints"),
    description=_("How many webhook endpoints you may register."),
)
{%- endif %}
