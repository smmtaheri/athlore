"""Exercise branch selection against local Git remotes without deploying."""

import os
from pathlib import Path
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "scripts/athlore-stage-command-local.sh"


class StageCommandTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="athlore-stage-command-")
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.remote = self.root / "remote.git"
        self.checkout = self.root / "checkout"
        subprocess.run(["git", "init", "--bare", "--quiet", str(self.remote)], check=True)
        subprocess.run(["git", "init", "--quiet", "-b", "main", str(self.checkout)], check=True)
        self.git("config", "user.name", "Stage Command Test")
        self.git("config", "user.email", "stage-test@example.invalid")
        self.git("remote", "add", "origin", str(self.remote))
        template = self.checkout / "infra/deployment/nginx/templates/server-stage-gateway.conf.template"
        template.parent.mkdir(parents=True)
        template.write_text(
            'server_name ${STAGE_PUBLIC_DOMAIN};\nproxy_hide_header Cache-Control;\n'
            'proxy_hide_header Expires;\nadd_header Cache-Control "no-store" always;\n'
        )
        self.git("add", str(template.relative_to(self.checkout)))
        self.commit_file("initial.txt", "initial")
        self.git("branch", "stage")
        self.git("push", "--quiet", "-u", "origin", "main", "stage")
        self.ssh_log = self.root / "ssh.log"
        bin_dir = self.root / "bin"
        bin_dir.mkdir()
        ssh = bin_dir / "ssh"
        ssh.write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> "$FAKE_SSH_LOG"\ncat >/dev/null\n')
        ssh.chmod(0o700)
        self.env = dict(os.environ, ATHLORE_LOCAL_ROOT=str(self.checkout),
                        ATHLORE_STAGE_SSH_HOST="test-stage-host", FAKE_SSH_LOG=str(self.ssh_log),
                        PATH=str(bin_dir) + os.pathsep + os.environ["PATH"])

    def git(self, *args):
        return subprocess.run(["git", "-C", str(self.checkout), *args], check=True,
                              text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout.strip()

    def commit_file(self, name, text):
        (self.checkout / name).write_text(text)
        self.git("add", name)
        self.git("commit", "--quiet", "-m", "test change")
        return self.git("rev-parse", "HEAD")

    def deploy(self):
        return subprocess.run(["bash", str(SCRIPT), "deploy"], cwd=self.root,
                              env=self.env, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    def test_main_publishes_stage_only_without_switching(self):
        original_main = self.git("rev-parse", "origin/main")
        self.git("switch", "stage")
        stage_commit = self.commit_file("stage-only.txt", "stage")
        self.git("switch", "main")
        main_commit = self.commit_file("main-only.txt", "main")
        result = self.deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.git("rev-parse", "origin/stage"), stage_commit)
        self.assertEqual(self.git("rev-parse", "origin/main"), original_main)
        self.assertEqual(self.git("rev-parse", "HEAD"), main_commit)
        self.assertEqual(self.git("branch", "--show-current"), "main")
        self.assertIn("test-stage-host", self.ssh_log.read_text())

    def test_stage_feature_and_detached_checkouts_do_not_switch(self):
        for branch in ("stage", "feature/test", None):
            with self.subTest(branch=branch):
                if branch == "feature/test":
                    self.git("switch", "-c", branch)
                elif branch:
                    self.git("switch", branch)
                else:
                    self.git("switch", "--detach")
                head = self.git("rev-parse", "HEAD")
                result = self.deploy()
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(self.git("rev-parse", "HEAD"), head)
                self.assertEqual(self.git("branch", "--show-current"), branch or "")

    def test_dirty_checkout_is_rejected(self):
        (self.checkout / "initial.txt").write_text("unsaved")
        result = self.deploy()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("uncommitted changes", result.stderr)
        self.assertFalse(self.ssh_log.exists())

    def test_stage_behind_remote_is_rejected(self):
        old = self.git("rev-parse", "stage")
        self.git("switch", "stage")
        self.commit_file("new-stage.txt", "remote update")
        self.git("push", "--quiet", "origin", "stage")
        self.git("switch", "main")
        self.git("update-ref", "refs/heads/stage", old)
        result = self.deploy()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("behind origin/stage", result.stderr)
        self.assertFalse(self.ssh_log.exists())

    def test_missing_stage_is_rejected(self):
        self.git("branch", "-D", "stage")
        result = self.deploy()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("local stage branch is missing", result.stderr)
        self.assertFalse(self.ssh_log.exists())


if __name__ == "__main__":
    unittest.main()
