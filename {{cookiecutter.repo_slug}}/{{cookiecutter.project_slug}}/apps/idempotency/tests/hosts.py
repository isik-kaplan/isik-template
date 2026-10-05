from django_hosts import host, patterns


host_patterns = patterns("", host(r"api", "apps.idempotency.tests.urls", name="api"))
