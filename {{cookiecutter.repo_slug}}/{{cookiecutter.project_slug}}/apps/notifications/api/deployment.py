from isik.django.apps.notifications.audience import get_endpoint_model

from apps.notifications.api.permissions.may_manage_endpoints import MayManageEndpoints


class DeploymentEndpoints:
    """The deployment's endpoints have no owner, so every one is staff's to see."""

    permission_classes = [MayManageEndpoints]

    def owned_endpoints(self):
        return get_endpoint_model()._default_manager.all()
