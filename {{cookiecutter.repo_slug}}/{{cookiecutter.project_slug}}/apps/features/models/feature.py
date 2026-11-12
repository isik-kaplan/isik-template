from django.utils.translation import gettext_lazy as _
from isik.django.apps.features import bases


class Feature(bases.AbstractFeature):
    class Meta(bases.AbstractFeature.Meta):
        db_table = "features_feature"
        verbose_name = _("feature")
        verbose_name_plural = _("features")
