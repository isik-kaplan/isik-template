def takes_a_token(view):
    """Only actions named in `token_actions` take a token, so an endpoint added later is closed to tokens."""
    return getattr(view, "action", None) in getattr(view, "token_actions", ())
