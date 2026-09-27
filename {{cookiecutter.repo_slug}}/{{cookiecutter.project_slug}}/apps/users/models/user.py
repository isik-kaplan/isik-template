from django.contrib.auth.models import AbstractUser
from isik.django.apps.common.db import track_events

from apps.common.models.base import BaseModel


@track_events()
class User(AbstractUser, BaseModel):
    class Meta(AbstractUser.Meta):
        swappable = "AUTH_USER_MODEL"
