from isik.django.apps.notifications import bases

from apps.common.models.base import primary_key


class Delivery(bases.AbstractDelivery):
    id = primary_key()
