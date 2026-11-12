from django.utils.translation import gettext_lazy as _
from isik.django.apps.idempotency.claims import AbstractIdempotencyClaim


class IdempotencyClaim(AbstractIdempotencyClaim):
    """A spent Idempotency-Key, replayed by re-serializing the row its request named."""

    class Meta(AbstractIdempotencyClaim.Meta):
        db_table = "common_idempotency_claim"
        verbose_name = _("idempotency claim")
        verbose_name_plural = _("idempotency claims")
