from isik.django.apps.common.middleware import Middleware


# RFC 9110 forbids a length on these, though Django's CommonMiddleware writes one anyway.
BODILESS = frozenset({204, 304})


class ContentLengthMiddleware(Middleware):
    """Outermost: without a length uWSGI's router closes the pooled connection nginx would reuse."""

    def after(self, request, response):
        if response.status_code in BODILESS:
            del response["Content-Length"]
        elif not response.streaming and not response.has_header("Content-Length"):
            response["Content-Length"] = str(len(response.content))
        return response
