from django.core.files.storage import storages
from django.core.management.base import BaseCommand

from apps.common.storage import ensure_bucket
from apps.users.models.user import User

from {{ cookiecutter.project_slug }}.config import CONFIG as config


class Command(BaseCommand):
    help = "Creates the storage bucket and a local-dev superuser from SETUP__SUPERUSER__*, whichever is missing."

    def handle(self, *args, **options):
        self._ensure_storage_bucket()
        self._ensure_superuser()

    def _ensure_storage_bucket(self):
        bucket = storages["default"].bucket_name
        if ensure_bucket():
            self.stdout.write(self.style.SUCCESS(f"Created storage bucket '{bucket}'."))
        else:
            self.stdout.write(f"Storage bucket '{bucket}' already exists, skipping.")

    def _ensure_superuser(self):
        if User.objects.filter(is_superuser=True).exists():
            self.stdout.write("A superuser already exists, skipping.")
            return
        User.objects.create_superuser(
            username=config.SETUP.SUPERUSER.USERNAME,
            email=config.SETUP.SUPERUSER.EMAIL,
            password=config.SETUP.SUPERUSER.PASSWORD,
        )
        self.stdout.write(self.style.SUCCESS(f"Created superuser '{config.SETUP.SUPERUSER.USERNAME}'."))
