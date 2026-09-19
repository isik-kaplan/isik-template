from django.contrib.auth.models import AbstractUser

from apps.common.models.base import BaseModel


class User(AbstractUser, BaseModel):
    class Meta(AbstractUser.Meta):
        swappable = "AUTH_USER_MODEL"
