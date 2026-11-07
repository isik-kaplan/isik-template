from django.core.management.base import BaseCommand

from apps.users.tasks.unverified import remove_unverified_accounts


class Command(BaseCommand):
    help = "Deletes signups that never proved their address before its confirmation link expired."

    def handle(self, *args, **options):
        remove_unverified_accounts()
