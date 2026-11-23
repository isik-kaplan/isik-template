from django.core.management.base import BaseCommand
from isik.django.apps.accounts.deletion import sweep_deletions


class Command(BaseCommand):
    help = "Deletes every account whose grace period, after its person asked for it to be deleted, is over."

    def handle(self, *args, **options):
        sweep_deletions()
