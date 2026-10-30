from isik.django.apps.features import bases


class Feature(bases.AbstractFeature):
    class Meta(bases.AbstractFeature.Meta):
        db_table = "features_feature"
