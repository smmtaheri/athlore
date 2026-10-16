#!/usr/bin/env python3
"""Ensure the shared stage route uses the public hostname and disables caching."""

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
    original = config_path.read_text()
    lines = original.splitlines(keepends=True)
    matches = []

    for index, line in enumerate(lines):
        match = re.match(r"^([ \t]*server_name[ \t]+)([^;]+)(;.*)$", line, re.DOTALL)
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
    if public_host not in hosts:
        hosts.insert(0, public_host)
    lines[index] = f"{match.group(1)}{' '.join(hosts)}{match.group(3)}"
    header_end = next(
        (
            position
            for position in range(index + 1, len(lines))
            if re.match(r"^\s*(?:location\b|})", lines[position])
        ),
        len(lines),
    )
    existing = {line.strip() for line in lines[index + 1 : header_end]}
    required = (
        "proxy_hide_header Cache-Control;",
        "proxy_hide_header Expires;",
        'add_header Cache-Control "no-store" always;',
    )
    indentation = re.match(r"^[ \t]*", lines[index]).group()
    lines[index + 1 : index + 1] = [
        f"{indentation}{directive}\n" for directive in required if directive not in existing
    ]
    updated = "".join(lines)
    if updated == original:
        print(f"The stage gateway already routes {public_host} without caching.")
    else:
        config_path.write_text(updated)
        print(f"Configured the stage gateway for {public_host} with Cache-Control: no-store.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
