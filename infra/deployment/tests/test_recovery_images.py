import hashlib
import importlib.util
import io
import json
import tarfile
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "recovery.py"
SPEC = importlib.util.spec_from_file_location("athlore_recovery", SCRIPT)
RECOVERY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RECOVERY)


def encoded(value):
    return json.dumps(value, separators=(",", ":")).encode()


def digest(value):
    return "sha256:" + hashlib.sha256(value).hexdigest()


def add_file(archive, name, data):
    entry = tarfile.TarInfo(name)
    entry.size = len(data)
    archive.addfile(entry, io.BytesIO(data))


class RecoveryImageTests(unittest.TestCase):
    def make_oci_archive(self, directory):
        config = {
            "architecture": "amd64",
            "os": "linux",
            "rootfs": {"type": "layers", "diff_ids": ["sha256:" + "a" * 64]},
            "config": {"Cmd": ["run"]},
        }
        config_bytes = encoded(config)
        config_id = digest(config_bytes)
        layer_id = "sha256:" + "b" * 64
        oci_manifest = {
            "schemaVersion": 2,
            "config": {"mediaType": "application/vnd.oci.image.config.v1+json", "digest": config_id},
            "layers": [{"mediaType": "application/vnd.oci.image.layer.v1.tar", "digest": layer_id}],
        }
        manifest_bytes = encoded(oci_manifest)
        manifest_digest = digest(manifest_bytes)
        image_index = {
            "schemaVersion": 2,
            "manifests": [{"mediaType": "application/vnd.oci.image.manifest.v1+json", "digest": manifest_digest}],
        }
        image_index_bytes = encoded(image_index)
        runtime_id = digest(image_index_bytes)
        index_bytes = encoded({
            "schemaVersion": 2,
            "manifests": [{"mediaType": "application/vnd.oci.image.index.v1+json", "digest": runtime_id}],
        })
        docker_manifest = encoded([{
            "Config": f"blobs/sha256/{config_id.removeprefix('sha256:')}",
            "RepoTags": None,
            "Layers": [f"blobs/sha256/{layer_id.removeprefix('sha256:')}"],
        }])
        archive_path = directory / "images.tar.gz"
        with tarfile.open(archive_path, "w:gz") as archive:
            add_file(archive, "manifest.json", docker_manifest)
            add_file(archive, "index.json", index_bytes)
            add_file(archive, "oci-layout", encoded({"imageLayoutVersion": "1.0.0"}))
            add_file(archive, f"blobs/sha256/{config_id.removeprefix('sha256:')}", config_bytes)
            add_file(archive, f"blobs/sha256/{manifest_digest.removeprefix('sha256:')}", manifest_bytes)
            add_file(archive, f"blobs/sha256/{runtime_id.removeprefix('sha256:')}", image_index_bytes)
            add_file(archive, f"blobs/sha256/{layer_id.removeprefix('sha256:')}", b"layer")
        return archive_path, runtime_id, config_id

    def test_oci_runtime_id_maps_to_classic_config_and_named_restore_tag(self):
        with tempfile.TemporaryDirectory() as directory_name:
            directory = Path(directory_name)
            archive, runtime_id, _ = self.make_oci_archive(directory)
            manifest = {
                "snapshot": "20261026T000000Z",
                "mode": "full",
                "services": {"backend": {"image_id": runtime_id, "architecture": "amd64", "os": "linux"}},
            }

            RECOVERY.verify_images(archive, manifest)
            named = directory / "named.tar"
            RECOVERY.write_named_image_archive(archive, named, manifest)

            with tarfile.open(named) as converted:
                rows = json.load(converted.extractfile("manifest.json"))
            self.assertEqual(rows[0]["RepoTags"], ["athlore-recovery-backend:20261026t000000z"])

    def test_legacy_config_id_archive_remains_supported(self):
        with tempfile.TemporaryDirectory() as directory_name:
            directory = Path(directory_name)
            archive, runtime_id, config_id = self.make_oci_archive(directory)
            # A classic archive identifies an image by its config digest.
            with tarfile.open(archive, "r:gz") as source:
                members = {member.name: source.extractfile(member).read()
                           for member in source.getmembers() if member.isfile()}
            members.pop("index.json")
            members.pop("oci-layout")
            rows = json.loads(members["manifest.json"])
            config_path = rows[0]["Config"]
            rows[0]["Config"] = f"{config_id.removeprefix('sha256:')}.json"
            members[rows[0]["Config"]] = members.pop(config_path)
            members["manifest.json"] = encoded(rows)
            legacy = directory / "legacy.tar.gz"
            with tarfile.open(legacy, "w:gz") as target:
                for name, data in members.items():
                    add_file(target, name, data)
            manifest = {
                "snapshot": "20261026T000000Z",
                "mode": "full",
                "services": {"backend": {"image_id": config_id, "architecture": "amd64", "os": "linux"}},
            }

            RECOVERY.verify_images(legacy, manifest)

    def test_rejects_archive_that_does_not_contain_the_running_image(self):
        with tempfile.TemporaryDirectory() as directory_name:
            directory = Path(directory_name)
            archive, _, _ = self.make_oci_archive(directory)
            manifest = {
                "services": {"backend": {"image_id": "sha256:" + "f" * 64,
                                           "architecture": "amd64", "os": "linux"}},
            }

            with self.assertRaisesRegex(ValueError, "backend"):
                RECOVERY.verify_images(archive, manifest)


if __name__ == "__main__":
    unittest.main()
