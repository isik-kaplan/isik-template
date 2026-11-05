"""allauth's description of its API, with paths matching the routes apps/users/headless_urls.py mounts.

allauth checks every documented path against the routes and drops the ones nothing answers, so a path
still carrying v1/ would leave its API undocumented. Only the step that roots the paths is replaced,
for allauth's served document and the frontend's alike; it has no public seam.
"""

import re

from allauth.headless.spec.internal import schema


# What allauth puts under each client; v0/ versions this API already.
ALLAUTH_VERSION = "v1/"
# Most paths are templated over the client; the few only one client has name it.
VERSIONED = re.compile(r"/(\{client\}|browser|app)/" + re.escape(ALLAUTH_VERSION))

rooted_by_allauth = schema.chroot


def chroot(spec):
    rooted_by_allauth(spec)
    spec["paths"] = {VERSIONED.sub(r"/\1/", path): item for path, item in spec["paths"].items()}


schema.chroot = chroot
