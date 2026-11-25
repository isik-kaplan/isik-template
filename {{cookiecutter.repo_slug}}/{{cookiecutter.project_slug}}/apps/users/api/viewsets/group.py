from apps.common.api.reauthentication import ProvesWhoTheyAre
from apps.common.api.viewsets import BaseModelViewSet
from apps.users.api.permissions.may_manage_groups import MayManageGroups
from apps.users.api.serializers.group import GroupSerializer
from apps.users.models.group import Group


class GroupViewSet(ProvesWhoTheyAre, BaseModelViewSet):
    """Named sets of permissions. Read by whoever reads every account, changed by whoever may grant."""

    model = Group
    endpoint = "groups"
    serializer_class = GroupSerializer
    permission_classes = [MayManageGroups]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    search_fields = ["name"]
    ordering_fields = ["name", "created_at"]
    ordering = ["name"]
    reauthentication_acts = {"create": None, "partial_update": None, "destroy": None}
    precondition_read_actions = ("retrieve",)

    def get_queryset(self):
        return super().get_queryset().prefetch_related("permissions")
