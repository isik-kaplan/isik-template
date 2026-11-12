from django.utils.translation import gettext_lazy as _
from isik.django.apps.common.db import track_events
from isik.django.apps.features import bases

from apps.common.models.base import primary_key


# Its history says when each grant was revoked (isik.E017).
@track_events()
class FeatureGrant(bases.AbstractFeatureGrant):
    id = primary_key()

    class Meta(bases.AbstractFeatureGrant.Meta):
        db_table = "features_feature_grant"
        verbose_name = _("feature grant")
        verbose_name_plural = _("feature grants")
