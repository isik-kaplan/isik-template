#!/usr/bin/env python
"""Post-generation setup."""

import shutil
import subprocess


PROJECT_NAME = "{{ cookiecutter.project_name }}"
DOMAIN = "{{ cookiecutter.domain }}"


def main() -> None:
    # .env.example already carries a real, working value for every field that has one (see its
    # own header comment) - domain, DB/broker names, and internal-only credentials are all
    # resolved via cookiecutter at generation time, so nothing here needs patching afterwards.
    shutil.copy(".env.example", ".env")

    subprocess.run(["git", "init", "-q"], check=True)

    print(f"\n{PROJECT_NAME} scaffolded.")
    print(
        "\nThis app is not servable at plain localhost - cross-subdomain session/CSRF cookies "
        f"need a real registrable domain. Before running docker compose, add to /etc/hosts:\n"
        f"  127.0.0.1 api.{DOMAIN} admin.{DOMAIN} auth.{DOMAIN}\n"
        "(or point real DNS at these subdomains if deploying to the real domain instead).\n"
    )


if __name__ == "__main__":
    main()
