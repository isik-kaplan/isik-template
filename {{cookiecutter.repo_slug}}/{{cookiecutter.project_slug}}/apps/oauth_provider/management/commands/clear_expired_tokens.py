from django.core.management.base import BaseCommand

from apps.oauth_provider.tasks import clear_expired_tokens


class Command(BaseCommand):
    help = "Deletes expired access tokens, their refresh tokens and spent grants."

    def handle(self, *args, **options):
        clear_expired_tokens()
