from isik.django.apps.idempotency.claims import AbstractIdempotencyClaim


class IdempotencyClaim(AbstractIdempotencyClaim):
    """A spent Idempotency-Key, replayed by re-serializing the row its request named."""

    class Meta(AbstractIdempotencyClaim.Meta):
        pass
