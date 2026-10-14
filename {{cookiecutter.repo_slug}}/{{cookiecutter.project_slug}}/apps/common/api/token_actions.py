def takes_a_token(view):
    """Whether `view` is about to do something a token may - an application's or a personal access token:
    only the actions it names in `token_actions`. Shut by default, so an endpoint added later is closed to
    tokens until somebody decides otherwise; a view with no action at all, not a viewset, is closed too."""
    return getattr(view, "action", None) in getattr(view, "token_actions", ())
