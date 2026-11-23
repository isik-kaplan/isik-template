from rest_framework import serializers

from apps.users.deletion import DELETION_BACKENDS


class AccountDeletionSerializer(serializers.Serializer):
    """What deleting the signed-in person's account would do, for the page that asks them."""

    deletion_mode = serializers.ChoiceField(
        choices=sorted(DELETION_BACKENDS),
        help_text="erase: the account and everything of theirs goes. anonymize: the account stays, nameless, "
        "so what it did stays attributed to it.",
    )
    after_days = serializers.IntegerField(help_text="How many days after asking it happens; signing in cancels it.")

