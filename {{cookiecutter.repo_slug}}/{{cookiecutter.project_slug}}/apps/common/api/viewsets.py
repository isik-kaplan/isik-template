from isik.django.drf.viewsets import BaseModelViewSet as _BaseModelViewSet


class BaseModelViewSet(_BaseModelViewSet):
    # Also forks a private model->viewset registry instead of isik's shared one.
    is_base_class = True
