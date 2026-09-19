from isik.django.drf.serializers import BaseModelSerializer as _BaseModelSerializer


class BaseModelSerializer(_BaseModelSerializer):
    is_base_class = True
