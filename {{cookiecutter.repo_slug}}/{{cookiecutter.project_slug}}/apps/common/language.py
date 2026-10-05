from django.utils.translation import get_supported_language_variant


def saved_language(user):
    """The language `user` chose for themselves, as this deployment spells it - or None when they
    chose none, have nowhere to keep a choice (no user, AnonymousUser), or chose one no longer shipped.

    Through Django's own resolution, so a stored `es-mx` finds `es`, while "" and a language dropped
    from LANGUAGES both raise LookupError rather than selecting a catalog that isn't there.
    """
    try:
        return get_supported_language_variant(user.language)
    except (AttributeError, LookupError):
        return None
