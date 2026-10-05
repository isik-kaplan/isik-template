from django.core.management.base import BaseCommand, CommandError
from drf_spectacular.drainage import GENERATOR_STATS
from drf_spectacular.renderers import OpenApiJsonRenderer

from apps.common.openapi import api_document, auth_document


DOCUMENTS = {"api": api_document, "auth": auth_document}


class Command(BaseCommand):
    help = "Print the OpenAPI document a typed frontend client is checked against, as JSON."

    def add_arguments(self, parser):
        parser.add_argument("document", choices=sorted(DOCUMENTS))

    def handle(self, *args, document, **options):
        built = DOCUMENTS[document]()
        # Any warning, not only errors: a warning is often a component the generator dropped or renamed
        # to settle a collision, which the document cannot show - it just looks complete.
        if GENERATOR_STATS:
            raise CommandError(f"Generating the {document} document emitted warnings; see above.")
        self.stdout.write(OpenApiJsonRenderer().render(built).decode())
