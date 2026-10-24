from django.utils.translation import get_supported_language_variant


def saved_language(user):
    """`user`'s saved language as this deployment spells it (`es-mx` finds `es`), or None when unset,
    no longer shipped, or there is no user to hold one."""
    try:
        return get_supported_language_variant(user.language)
    except (AttributeError, LookupError):
        return None
