from isik.django.apps.notifications import bases

from apps.common.models.base import primary_key


class DeliveryAttempt(bases.AbstractDeliveryAttempt):
    id = primary_key()
