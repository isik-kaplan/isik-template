from isik.django.apps.features import drf


class FeatureViewSet(drf.FeatureViewSet):
    """The features you have, and until when."""

    endpoint = "features"
