import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "add-stage-public-host.py"
PUBLIC_HOST = "stage.athlore.ir"
COACH_HOST = "stage.coach.athlore.ir"
STUDENT_HOST = "stage.student.athlore.ir"


class AddStagePublicHostTests(unittest.TestCase):
    def run_patch(self, contents: str) -> tuple[subprocess.CompletedProcess[str], str]:
        with tempfile.TemporaryDirectory() as directory:
            config_path = Path(directory) / "nginx.conf"
            config_path.write_text(contents)
            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    str(config_path),
                    PUBLIC_HOST,
                    COACH_HOST,
                    STUDENT_HOST,
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            return result, config_path.read_text()

    def test_adds_public_host_to_the_existing_stage_route(self) -> None:
        original = (
            "http {\n"
            "  server {\n"
            f"    server_name {COACH_HOST} {STUDENT_HOST};\n"
            "  }\n"
            "  server {\n"
            "    server_name athlore.ir;\n"
            "  }\n"
            "}\n"
        )

        result, updated = self.run_patch(original)

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(
            f"server_name {PUBLIC_HOST} {COACH_HOST} {STUDENT_HOST};",
            updated,
        )
        self.assertIn("    server_name athlore.ir;", updated)
        self.assertIn('    add_header Cache-Control "no-store" always;\n', updated)
        self.assertIn("    proxy_hide_header Cache-Control;\n", updated)
        self.assertIn("    proxy_hide_header Expires;\n", updated)
        self.assertIn(f"{STUDENT_HOST};\n    proxy_hide_header", updated)

    def test_is_idempotent_when_public_host_is_already_routed(self) -> None:
        original = (
            "http {\n"
            "  server {\n"
            f"    server_name {PUBLIC_HOST} {COACH_HOST} {STUDENT_HOST};\n"
            "    proxy_hide_header Cache-Control;\n"
            "    proxy_hide_header Expires;\n"
            '    add_header Cache-Control "no-store" always;\n'
            "    client_max_body_size 110m;\n"
            "    client_body_timeout 120s;\n"
            "    proxy_read_timeout 180s;\n"
            "    proxy_send_timeout 180s;\n"
            "  }\n"
            "}\n"
        )

        result, updated = self.run_patch(original)

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(updated, original)

    def test_adds_cache_policy_when_only_the_offline_location_has_no_store(self) -> None:
        original = (
            "http {\n"
            "  server {\n"
            f"    server_name {PUBLIC_HOST} {COACH_HOST} {STUDENT_HOST};\n"
            "    location / {\n"
            "      proxy_pass http://stage;\n"
            "    }\n"
            "    location @stage_offline {\n"
            '      add_header Cache-Control "no-store" always;\n'
            "    }\n"
            "  }\n"
            "}\n"
        )

        result, updated = self.run_patch(original)

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(updated.count('add_header Cache-Control "no-store" always;'), 2)
        self.assertLess(updated.index("proxy_hide_header Cache-Control;"), updated.index("location /"))

    def test_refuses_ambiguous_or_missing_gateway_routes(self) -> None:
        original = (
            "http {\n"
            "  server {\n"
            f"    server_name {COACH_HOST};\n"
            "  }\n"
            "}\n"
        )

        result, updated = self.run_patch(original)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("expected exactly one existing stage gateway", result.stderr)
        self.assertEqual(updated, original)

    def test_stage_forwards_upstream_csp_and_keeps_offline_and_production_headers(self):
        original = (
            "http {\n  server {\n"
            f"    server_name {PUBLIC_HOST} {COACH_HOST} {STUDENT_HOST};\n"
            "    include /etc/nginx/snippets/security-headers.conf;\n"
            "    include /etc/nginx/snippets/hsts.conf;\n"
            "    location / { proxy_pass http://stage; }\n"
            "    location @stage_offline {\n"
            "      include /etc/nginx/snippets/security-headers.conf;\n"
            "    }\n  }\n  server {\n"
            "    server_name athlore.ir;\n"
            "    include /etc/nginx/snippets/security-headers.conf;\n"
            "  }\n}\n"
        )
        result, updated = self.run_patch(original)
        self.assertEqual(result.returncode, 0, result.stderr)
        stage_header = updated.split("location /", 1)[0]
        self.assertNotIn("security-headers.conf", stage_header)
        self.assertIn("client_max_body_size 110m;", stage_header)
        self.assertEqual(updated.count("include /etc/nginx/snippets/security-headers.conf;"), 2)
        again, repeated = self.run_patch(updated)
        self.assertEqual(again.returncode, 0, again.stderr)
        self.assertEqual(repeated, updated)


if __name__ == "__main__":
    unittest.main()
