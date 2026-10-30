from isik.django.apps.notifications.kinds import Source

from apps.notifications.models import NoticeKindPolicy


def visible_kinds(request):
    """A recorded mail is a record of allauth's sending, not something anybody chooses or reads in the inbox."""
    return set(NoticeKindPolicy.objects.exclude(source=Source.RECORDED).values_list("name", flat=True))
