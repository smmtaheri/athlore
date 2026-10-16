#!/usr/bin/env python3
"""Add the public stage hostname to the existing shared Nginx stage route."""

from pathlib import Path
import re
import sys


def main() -> int:
    if len(sys.argv) != 5:
        print(
            "Usage: add-stage-public-host.py CONFIG PUBLIC_HOST COACH_HOST STUDENT_HOST",
            file=sys.stderr,
        )
        return 2

    config_path = Path(sys.argv[1])
    public_host, coach_host, student_host = sys.argv[2:]
    lines = config_path.read_text().splitlines(keepends=True)
    matches = []

    for index, line in enumerate(lines):
        match = re.match(r"^(\s*server_name\s+)([^;]+)(;.*)$", line)
        if not match:
            continue
        hosts = match.group(2).split()
        if coach_host in hosts and student_host in hosts:
            matches.append((index, match, hosts))

    if len(matches) != 1:
        print(
            "ERROR: expected exactly one existing stage gateway server_name line "
            f"for {coach_host} and {student_host}; found {len(matches)}.",
            file=sys.stderr,
        )
        return 1

    index, match, hosts = matches[0]
    if public_host in hosts:
        print(f"The stage gateway already routes {public_host}.")
        return 0

    hosts.insert(0, public_host)
    lines[index] = f"{match.group(1)}{' '.join(hosts)}{match.group(3)}"
    config_path.write_text("".join(lines))
    print(f"Added {public_host} to the existing stage gateway route.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
