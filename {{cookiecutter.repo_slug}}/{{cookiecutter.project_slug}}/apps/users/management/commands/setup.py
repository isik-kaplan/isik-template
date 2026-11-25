from allauth.account.models import EmailAddress
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.users.models.user import User

from {{ cookiecutter.project_slug }}.config import CONFIG as config


class Command(BaseCommand):
    help = "Creates a local-dev superuser from SETUP__SUPERUSER__* if none exists."

    def handle(self, *args, **options):
        if User.objects.filter(is_superuser=True).exists():
            self.stdout.write("A superuser already exists, skipping.")
            return
        with transaction.atomic():
            user = User.objects.create_superuser(
                email=config.SETUP.SUPERUSER.EMAIL,
                password=config.SETUP.SUPERUSER.PASSWORD,
                username=config.SETUP.SUPERUSER.USERNAME or None,
{%- if cookiecutter.phone == "required" %}
                # Verified for the same reason as the address: allauth turns away a login with no number.
                phone=config.SETUP.SUPERUSER.PHONE,
                phone_verified=True,
{%- endif %}
            )
            # Without a verified address allauth would hold the sign-in for a confirmation mail first.
            EmailAddress.objects.create(user=user, email=user.email, verified=True, primary=True)
        self.stdout.write(self.style.SUCCESS(f"Created superuser '{config.SETUP.SUPERUSER.EMAIL}'."))
