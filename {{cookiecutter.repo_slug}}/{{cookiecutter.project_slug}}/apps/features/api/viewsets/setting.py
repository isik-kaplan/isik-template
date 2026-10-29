from isik.django.apps.features import drf


class SettingViewSet(drf.SettingViewSet):
    """Your settings: what each is, why it's that value, and whether you may change it. Changing one that guards your
    account asks you to prove it's you first."""

    endpoint = "settings"
