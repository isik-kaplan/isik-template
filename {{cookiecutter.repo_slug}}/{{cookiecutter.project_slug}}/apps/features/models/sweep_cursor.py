from isik.django.apps.features import bases


class SweepCursor(bases.AbstractSweepCursor):
    class Meta(bases.AbstractSweepCursor.Meta):
        db_table = "features_sweep_cursor"
