from isik.django.apps.features import bases

from apps.common.models.base import primary_key


class FeatureGrant(bases.AbstractFeatureGrant):
    id = primary_key()

    class Meta(bases.AbstractFeatureGrant.Meta):
        db_table = "features_feature_grant"
