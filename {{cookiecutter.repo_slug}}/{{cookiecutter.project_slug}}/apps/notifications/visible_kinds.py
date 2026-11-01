from isik.django.apps.notifications.kinds import Source

from apps.notifications.kinds import REVIEWER_KINDS
from apps.notifications.models import NoticeKindPolicy


def visible_kinds(request):
    """A recorded mail is a record of allauth's sending, not something anybody chooses or reads in the inbox. The
    reviewers' kinds are only ever sent to superusers."""
    kinds = set(NoticeKindPolicy.objects.exclude(source=Source.RECORDED).values_list("name", flat=True))
    return kinds if request.user.is_superuser else kinds - REVIEWER_KINDS
