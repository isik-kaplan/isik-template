"""Publishing the header, so the generated clients know it exists.

A postprocessing hook rather than `extend_schema` on every operation: the rule is "every POST", and a
hook says that once instead of being repeated everywhere and forgotten on the next one.
"""

from isik.django.apps.idempotency.drf import IdempotencyMixin


PARAMETER = {
    "in": "header",
    "name": IdempotencyMixin.idempotency_header,
    "required": True,
    "schema": {"type": "string", "format": "uuid"},
    "description": (
        "A UUID of the caller's choosing. Sending the same key with the same body again returns what "
        "the first attempt answered rather than doing the work twice. It belongs to the attempt, not "
        "to the call: mint a new one when the payload changes or once a submit succeeds."
    ),
}


def every_post_declares_the_key(result, generator, request, public):
    for operations in result.get("paths", {}).values():
        post = operations.get("post")
        if post is None:
            continue
        # Keyed by name, so a document a previous run already touched is replaced rather than appended.
        post["parameters"] = [
            one for one in post.get("parameters", []) if one.get("name") != IdempotencyMixin.idempotency_header
        ]
        post["parameters"].append(PARAMETER)
    return result
