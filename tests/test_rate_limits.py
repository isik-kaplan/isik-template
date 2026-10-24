import json
import os
import shutil
import subprocess
import textwrap

import pytest
from conftest import load_context


# The real nginx between two stand-ins that echo each request's headers back.
pytestmark = [
    pytest.mark.skipif(shutil.which("docker") is None, reason="docker not available"),
    pytest.mark.usefixtures("skip_lockfile_generation"),
]

FRONTEND_KEY = "local-insecure-frontend-key-change-in-real-deployments"

# Answers any request with the headers it arrived with, as JSON.
ECHO = textwrap.dedent(
    """
    import json
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

    class Echo(BaseHTTPRequestHandler):
        def do_GET(self):
            body = json.dumps({name.lower(): value for name, value in self.headers.items()}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    ThreadingHTTPServer(("", 80), Echo).serve_forever()
    """
)

# Sends the requests a case lists from inside the stack's own network, and prints what came back.
PROBE = textwrap.dedent(
    """
    import json, ssl, sys, urllib.request, urllib.error

    context = ssl._create_unverified_context()
    answers = []
    for scheme, host, path, headers in json.loads(sys.argv[1]):
        request = urllib.request.Request(f"{scheme}://{host}{path}", headers=headers)
        try:
            response = urllib.request.urlopen(request, context=context, timeout=10)
        except urllib.error.HTTPError as refused:
            response = refused
        answers.append({"status": response.status, "headers": dict(response.headers), "body": response.read().decode()})
    print(json.dumps(answers))
    """
)


def _stand_in(alias):
    return {
        "build": None,
        "image": "python:3.13-alpine",
        "command": ["python", "-c", ECHO],
        "env_file": [],
        "volumes": [],
        "depends_on": {},
        "networks": {"internal": {"aliases": [alias]}},
        "healthcheck": {
            "test": ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1/')"],
            "interval": "2s",
            "retries": 15,
        },
    }


class Stack:
    def __init__(self, project_path, context):
        self.path = project_path
        self.context = context
        self.scheme = "https" if context["tls_termination"] == "self" else "http"
        self.domain = context["domain"]
        self.prefix = context["config_prefix"]
        self.name = f"{os.environ.get('COMPOSE_PROJECT_NAME', project_path.name)}-limits"
        override = {
            "services": {
                "backend": _stand_in("backend-internal"),
                "frontend": _stand_in("frontend-internal"),
                # The bare domain too, which the frontend's own fetches never need but these probes do.
                "server": {"ports": [], "volumes": [], "networks": {"internal": {"aliases": [context["domain"]]}}},
            }
        }
        # Compose merges lists and maps rather than replacing them, except under !reset.
        text = json.dumps(override)
        (project_path / "stand-ins.yml").write_text(
            text.replace('"build": null', '"build": !reset null')
            .replace('"env_file": []', '"env_file": !reset []')
            .replace('"volumes": []', '"volumes": !reset []')
            .replace('"depends_on": {}', '"depends_on": !reset {}')
            .replace('"ports": []', '"ports": !reset []')
        )
        shutil.copy(project_path / ".env.example", project_path / ".env")

    def compose(self, *args, env=None):
        return subprocess.run(
            ["docker", "compose", "-f", "docker-compose.yml", "-f", "stand-ins.yml", *args],
            cwd=self.path,
            env={**os.environ, "COMPOSE_PROJECT_NAME": self.name, **(env or {})},
            capture_output=True,
            text=True,
        )

    def up(self, **env):
        variables = {f"{self.prefix}__{name}": value for name, value in env.items()}
        started = self.compose("up", "-d", "--build", "--wait", "--force-recreate", "server", env=variables)
        assert started.returncode == 0, started.stderr + self.compose("logs", "--no-color", "server").stdout

    def send(self, *requests):
        """Each (host prefix, path, headers) request, in order, as nginx answered it."""
        cases = [[self.scheme, f"{prefix}{self.domain}", path, headers] for prefix, path, headers in requests]
        probe = subprocess.run(
            ["docker", "run", "--rm", "--network", f"{self.name}_internal", "python:3.13-alpine"]
            + ["python", "-c", PROBE, json.dumps(cases)],
            capture_output=True,
            text=True,
        )
        assert probe.returncode == 0, probe.stderr
        return json.loads(probe.stdout)

    def seen_by_backend(self, **headers):
        [answer] = self.send(("api.", "/", headers))
        assert answer["status"] == 200, answer
        return json.loads(answer["body"])


@pytest.fixture(params=["default", "self-tls"])
def stack(cookies, request):
    result = cookies.bake(extra_context=load_context(request.param))
    assert result.exit_code == 0
    stack = Stack(result.project_path, result.context)
    try:
        yield stack
    finally:
        stack.compose("down", "-v", "--remove-orphans")


def test_nginx_names_the_client_to_the_backend_whatever_the_client_claims(stack):
    stack.up(TRUSTED_PROXY_COUNT="2", RATE_LIMITS__ENABLED="false")

    seen = stack.seen_by_backend(**{"X-Forwarded-For": "6.6.6.6, 203.0.113.5", "X-Client-Ip": "6.6.6.6"})
    # One proxy in front: its appended entry is the client; earlier ones are the client's own word.
    assert seen["x-client-ip"] == "203.0.113.5"

    # Fewer entries than proxies trusted: something reached nginx without them, and its own address is the answer.
    direct = stack.seen_by_backend()
    assert direct["x-client-ip"] not in {"", "203.0.113.5"}
    assert "x-frontend-key" not in direct
    assert "x-visitor-ip" not in direct


def test_with_nginx_alone_in_front_the_header_is_ignored(stack):
    stack.up(TRUSTED_PROXY_COUNT="1", RATE_LIMITS__ENABLED="false")

    seen = stack.seen_by_backend(**{"X-Forwarded-For": "203.0.113.5"})
    assert seen["x-client-ip"] != "203.0.113.5"


def test_a_fetch_proven_to_be_the_frontend_s_is_for_the_visitor_it_names(stack):
    stack.up(RATE_LIMITS__ENABLED="false")

    proven = stack.seen_by_backend(**{"X-Frontend-Key": FRONTEND_KEY, "X-Visitor-Ip": "198.51.100.7"})
    assert proven["x-client-ip"] == "198.51.100.7"
    # The key goes no further than nginx.
    assert "x-frontend-key" not in proven
    assert "x-visitor-ip" not in proven

    unproven = stack.seen_by_backend(**{"X-Frontend-Key": "a-guess", "X-Visitor-Ip": "198.51.100.7"})
    assert unproven["x-client-ip"] != "198.51.100.7"


def test_the_frontend_hears_who_the_visitor_is(stack):
    stack.up(RATE_LIMITS__ENABLED="false")

    [page] = stack.send(("", "/", {"X-Client-Ip": "6.6.6.6"}))
    seen = json.loads(page["body"])
    assert seen["x-client-ip"] not in {"", "6.6.6.6"}


def test_a_flood_is_refused_per_client_in_a_way_the_page_can_read(stack):
    stack.up(TRUSTED_PROXY_COUNT="2", RATE_LIMITS__REQUESTS_PER_SECOND="1")
    origin = f"{stack.scheme}://{stack.domain}"
    flood = [("api.", "/", {"X-Forwarded-For": "203.0.113.5", "Origin": origin})] * 30

    answers = stack.send(*flood, ("api.", "/", {"X-Forwarded-For": "203.0.113.6"}))
    statuses = [answer["status"] for answer in answers[:-1]]

    # Ten seconds' worth at once, then refused.
    assert statuses[:10] == [200] * 10
    assert 429 in statuses
    refused = answers[statuses.index(429)]
    assert refused["headers"]["Retry-After"] == "1"
    assert json.loads(refused["body"]) == {"detail": "Too many requests.", "code": "throttled"}
    assert refused["headers"]["Access-Control-Allow-Origin"] == origin
    assert refused["headers"]["Access-Control-Allow-Credentials"] == "true"
    # Somebody else is counted on their own.
    assert answers[-1]["status"] == 200


def test_a_refusal_carries_no_cors_grant_for_another_origin(stack):
    stack.up(TRUSTED_PROXY_COUNT="2", RATE_LIMITS__REQUESTS_PER_SECOND="1")

    answers = stack.send(*[("api.", "/", {"X-Forwarded-For": "203.0.113.5", "Origin": "https://evil.test"})] * 30)
    refused = next(answer for answer in answers if answer["status"] == 429)
    assert "Access-Control-Allow-Origin" not in refused["headers"]


def test_the_frontend_s_own_fetches_and_static_files_are_never_refused(stack):
    stack.up(RATE_LIMITS__REQUESTS_PER_SECOND="1")
    proven = {"X-Frontend-Key": FRONTEND_KEY, "X-Visitor-Ip": "198.51.100.7"}

    answers = stack.send(*[("api.", "/", proven)] * 30, *[("", "/_next/static/chunk.js", {})] * 30)
    assert {answer["status"] for answer in answers} == {200}


def test_a_page_load_past_the_limit_is_answered_in_a_page(stack):
    stack.up(RATE_LIMITS__REQUESTS_PER_SECOND="1")

    answers = stack.send(*[("", "/", {})] * 30)
    refused = next(answer for answer in answers if answer["status"] == 429)
    assert refused["headers"]["Content-Type"].startswith("text/html")
    assert refused["headers"]["Retry-After"] == "1"


def test_rate_limits_off_turns_nginx_s_off_too(stack):
    stack.up(RATE_LIMITS__ENABLED="false", RATE_LIMITS__REQUESTS_PER_SECOND="1")

    answers = stack.send(*[("api.", "/", {})] * 30)
    assert {answer["status"] for answer in answers} == {200}


def test_nginx_will_not_start_without_the_frontend_s_key(stack):
    """An empty key would match every request that sent none, and let each name its own address."""
    run = stack.compose("run", "--rm", "--no-deps", "server", env={f"{stack.prefix}__FRONTEND_KEY": ""})

    assert run.returncode != 0
    assert "FRONTEND_KEY is not set" in run.stderr
