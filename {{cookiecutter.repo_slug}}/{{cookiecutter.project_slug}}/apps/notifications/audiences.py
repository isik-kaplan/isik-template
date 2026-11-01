from django.contrib.auth import get_user_model
from isik.django.apps.notifications.audiences import Audience


class Reviewers(Audience):
    """The superusers who approve and withdraw applications (MayReviewApplications)."""

    def recipients(self, notice):
        return get_user_model().objects.filter(is_superuser=True, is_active=True)
