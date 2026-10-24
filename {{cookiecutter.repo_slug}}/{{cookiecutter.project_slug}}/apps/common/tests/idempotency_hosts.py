from django_hosts import host, patterns


host_patterns = patterns("", host(r"api", "apps.common.tests.idempotency_urls", name="api"))
