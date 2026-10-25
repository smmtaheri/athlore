#!/usr/bin/env python3
"""Collect Athlore snapshots over SSH and recover on a fresh host, offline."""

import argparse
import datetime as dt
import gzip
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import shlex
import shutil
import subprocess
import sys
import tarfile
import time

FORMAT = "athlore.backup.v1"
HERE = Path(__file__).resolve().parent


def log(message):
    print(message, file=sys.stderr, flush=True)


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def capture(args):
    return run(args, stdout=subprocess.PIPE, text=True).stdout.strip()


def digest(path):
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


def safe_relative(name):
    path = PurePosixPath(name)
    if path.is_absolute() or ".." in path.parts:
        raise ValueError("Unsafe archive/checksum path")
    return path


def inspect_archive(path, inventory=False):
    # Read all compressed bytes, including the trailer, before trusting the TOC.
    with gzip.open(path, "rb") as stream:
        while stream.read(1024 * 1024):
            pass
    files = []
    with tarfile.open(path, "r:gz") as archive:
        for member in archive:
            relative = safe_relative(member.name)
            if member.issym() or member.islnk():
                safe_relative(member.linkname)
                if inventory:
                    raise ValueError("Media archive contains a link; review required")
            elif not (member.isfile() or member.isdir()):
                raise ValueError(f"Unsupported archive member in {path.name}")
            if inventory and member.isfile():
                checksum = hashlib.sha256()
                payload = archive.extractfile(member)
                for chunk in iter(lambda: payload.read(1024 * 1024), b""):
                    checksum.update(chunk)
                files.append({"path": str(relative), "bytes": member.size,
                              "sha256": checksum.hexdigest()})
    return files


def checksums(directory):
    paths = sorted(p for p in directory.rglob("*") if p.is_file() and p.name != "SHA256SUMS")
    (directory / "SHA256SUMS").write_text("".join(
        f"{digest(p)}  {p.relative_to(directory).as_posix()}\n" for p in paths))


def image_archive_catalog(path):
    """Map runtime image IDs to the config objects stored by Docker save."""
    small_files = {}
    member_names = set()
    small_bytes = 0
    with gzip.open(path, "rb") as compressed:
        with tarfile.open(fileobj=compressed, mode="r|") as archive:
            for member in archive:
                relative = safe_relative(member.name)
                name = str(relative)
                if name in member_names:
                    raise ValueError("Image archive contains a duplicate member")
                member_names.add(name)
                if member.issym() or member.islnk() or not (member.isfile() or member.isdir()):
                    raise ValueError("Image archive contains an unsupported member")
                wanted = name in ("manifest.json", "index.json", "oci-layout")
                small_blob = name.startswith("blobs/sha256/") and member.size <= 4 * 1024 * 1024
                small_config = name.endswith(".json") and member.size <= 4 * 1024 * 1024
                if member.isfile() and (wanted or small_blob or small_config):
                    small_bytes += member.size
                    if small_bytes > 128 * 1024 * 1024:
                        raise ValueError("Image archive metadata exceeds the safe inspection limit")
                    small_files[name] = archive.extractfile(member).read()
            # Drain gzip after tar's end markers so its CRC/trailer is checked.
            while compressed.read(1024 * 1024):
                pass

    if "manifest.json" not in small_files:
        raise ValueError("Docker image archive is missing manifest.json")
    entries = json.loads(small_files["manifest.json"])
    configs = {}
    for item in entries:
        config_path = item["Config"]
        if config_path not in member_names or any(layer not in member_names for layer in item.get("Layers", [])):
            raise ValueError("Docker image manifest references a missing archive member")
        config_bytes = small_files.get(config_path)
        if config_bytes is None:
            raise ValueError("Docker image config is missing or exceeds the inspection limit")
        config_id = "sha256:" + PurePosixPath(config_path).name.removesuffix(".json")
        if hashlib.sha256(config_bytes).hexdigest() != config_id.removeprefix("sha256:"):
            raise ValueError("Image configuration digest does not match its archive path")
        configs[config_id] = json.loads(config_bytes)

    def read_blob(digest_value):
        algorithm, value = digest_value.split(":", 1)
        blob = f"blobs/{algorithm}/{value}"
        payload = small_files.get(blob)
        if algorithm != "sha256" or payload is None:
            raise ValueError("Image archive references a missing or unsupported OCI blob")
        if hashlib.sha256(payload).hexdigest() != value:
            raise ValueError("OCI image blob digest does not match its index")
        return json.loads(payload)

    def configs_for(descriptor, seen=None):
        seen = seen or set()
        digest_value = descriptor["digest"]
        if digest_value in seen:
            raise ValueError("Image archive contains a cyclic OCI index")
        content = read_blob(digest_value)
        if "config" in content:
            return [content["config"]["digest"]]
        seen.add(digest_value)
        result = []
        for child in content.get("manifests", []):
            result.extend(configs_for(child, seen.copy()))
        return result

    runtime_configs = {}
    if "index.json" in small_files:
        index = json.loads(small_files["index.json"])
        for descriptor in index.get("manifests", []):
            if descriptor["digest"] in runtime_configs:
                raise ValueError("OCI image index contains a duplicate runtime image ID")
            runtime_configs[descriptor["digest"]] = configs_for(descriptor)
    else:
        runtime_configs = {config_id: [config_id] for config_id in configs}
    return entries, configs, runtime_configs


def matching_image_configs(image, configs, runtime_configs):
    config_ids = runtime_configs.get(image["image_id"], [image["image_id"]])
    return [config_id for config_id in config_ids
            if config_id in configs
            and configs[config_id].get("architecture") == image["architecture"]
            and configs[config_id].get("os") == image["os"]]


def verify_images(path, manifest):
    entries, configs, runtime_configs = image_archive_catalog(path)
    matched = []
    for service, image in manifest["services"].items():
        candidates = matching_image_configs(image, configs, runtime_configs)
        if len(candidates) != 1:
            raise ValueError(f"Image archive does not contain exactly one matching image for {service}")
        matched.append(candidates[0])
    if len(entries) != len(manifest["services"]) or set(matched) != set(configs):
        raise ValueError("Image archive contains missing or unexpected service images")


def write_named_image_archive(source, destination, manifest):
    """Convert Docker 29's OCI export into a tagged archive Docker can load reliably."""
    entries, configs, runtime_configs = image_archive_catalog(source)
    config_to_service = {}
    config_paths = {}
    service_configs = {}
    for service, image in manifest["services"].items():
        candidates = matching_image_configs(image, configs, runtime_configs)
        if len(candidates) != 1 or candidates[0] in config_to_service:
            raise ValueError(f"Could not uniquely map the saved image for {service}")
        config_id = candidates[0]
        config_to_service[config_id] = service
        service_configs[service] = configs[config_id]
        config_paths[service] = next(item["Config"] for item in entries
                                     if "sha256:" + PurePosixPath(item["Config"]).name.removesuffix(".json") == config_id)

    entry_config_ids = {"sha256:" + PurePosixPath(item["Config"]).name.removesuffix(".json")
                        for item in entries}
    if len(entries) != len(manifest["services"]) or entry_config_ids != set(config_to_service):
        raise ValueError("Image archive contains missing or unexpected service images")

    with tarfile.open(source, "r|gz") as incoming, tarfile.open(destination, "w|") as outgoing:
        seen = set()
        for member in incoming:
            name = str(PurePosixPath(member.name))
            if PurePosixPath(name).is_absolute() or ".." in PurePosixPath(name).parts:
                raise ValueError("Unsafe image archive member")
            if name in ("index.json", "oci-layout"):
                continue
            if member.isdir():
                outgoing.addfile(member)
                continue
            if not member.isfile():
                raise ValueError("Unsupported image archive member")
            payload = incoming.extractfile(member)
            if name == "manifest.json":
                rows = json.load(payload)
                if len(rows) != len(config_to_service):
                    raise ValueError("Unexpected image count in Docker manifest")
                for row in rows:
                    config_id = "sha256:" + PurePosixPath(row["Config"]).name.removesuffix(".json")
                    service = config_to_service.get(config_id)
                    if service is None or config_id in seen:
                        raise ValueError("Unexpected or duplicate image config in Docker manifest")
                    seen.add(config_id)
                    row["RepoTags"] = [f"athlore-recovery-{service}:{manifest['snapshot'].lower()}"]
                data = json.dumps(rows).encode()
                member.size = len(data)
                outgoing.addfile(member, io.BytesIO(data))
            else:
                outgoing.addfile(member, payload)
        if len(seen) != len(config_to_service):
            raise ValueError("Docker image manifest is incomplete")
    return config_paths, service_configs


def load_recovery_images(snapshot, manifest):
    image_snapshot = snapshot if manifest["mode"] == "full" else (
        snapshot.parent / manifest["image_snapshot"])
    image_manifest = manifest if image_snapshot == snapshot else verify(image_snapshot)
    if image_manifest["mode"] != "full" or digest(image_snapshot / "images.tar.gz") != manifest["image_archive_sha256"]:
        raise ValueError("The required full image snapshot is missing or incompatible")
    import tempfile
    tags = {}
    with tempfile.TemporaryDirectory(prefix=".athlore-image-import-", dir=image_snapshot.parent) as directory:
        named_archive = Path(directory) / "images.tar"
        _, service_configs = write_named_image_archive(
            image_snapshot / "images.tar.gz", named_archive, image_manifest
        )
        run(["docker", "load", "-i", str(named_archive)], stdout=subprocess.DEVNULL)
        for service, item in image_manifest["services"].items():
            tag = f"athlore-recovery-{service}:{image_manifest['snapshot'].lower()}"
            loaded = json.loads(capture(["docker", "image", "inspect", tag]))[0]
            config = service_configs[service]
            if (loaded["Os"] != config["os"] or loaded["Architecture"] != config["architecture"]
                    or loaded["RootFS"]["Layers"] != config["rootfs"]["diff_ids"]):
                raise ValueError(f"Restored image layers or platform mismatch for {service}")
            original = config.get("config", {})
            for key in ("Env", "Cmd", "Entrypoint", "WorkingDir", "User", "Labels", "Volumes",
                        "ExposedPorts", "Healthcheck"):
                if (loaded["Config"].get(key) or None) != (original.get(key) or None):
                    raise ValueError(f"Restored image configuration mismatch for {service}: {key}")
            tags[service] = tag
            log(f"Verified restored image: {service}")
    return tags


def verify(directory):
    directory = directory.resolve()
    manifest = json.loads((directory / "manifest.json").read_text())
    if manifest.get("format") != FORMAT:
        raise ValueError("Unknown snapshot format")
    entries = {}
    for line in (directory / "SHA256SUMS").read_text().splitlines():
        checksum, name = line.split("  ", 1)
        safe_relative(name)
        path = directory / name
        if path.is_symlink() or not path.is_file() or digest(path) != checksum:
            raise ValueError(f"Checksum verification failed: {name}")
        entries[name] = checksum
    required = {"manifest.json", "server.env", "postgres.dump", "media.tar.gz", "media-files.json",
                "source.tar.gz", "source.bundle", "nginx.tar.gz", "recovery/recovery.py",
                "recovery/restore.sh", "COMPLETE"}
    if manifest["mode"] == "full":
        required.add("images.tar.gz")
    if not required.issubset(entries):
        raise ValueError("Snapshot is missing required checksummed files")
    for name in ("source.tar.gz", "nginx.tar.gz"):
        inspect_archive(directory / name)
    if inspect_archive(directory / "media.tar.gz", inventory=True) != json.loads((directory / "media-files.json").read_text()):
        raise ValueError("Media inventory does not match the archive")
    if manifest["mode"] == "full":
        verify_images(directory / "images.tar.gz", manifest)
    run(["pg_restore", "--file=/dev/null", str(directory / "postgres.dump")])
    run(["git", "bundle", "list-heads", str(directory / "source.bundle")], stdout=subprocess.DEVNULL)
    return manifest


REMOTE_METADATA = r'''
import json, pathlib, subprocess, sys
root = pathlib.Path(sys.argv[1])
deployment = root / "infra/deployment"
def out(args):
    return subprocess.check_output(args, text=True).strip()
if out(["git", "-C", str(root), "status", "--porcelain"]):
    raise SystemExit("Production checkout has uncommitted files; snapshot refused")
compose = ["docker", "compose", "--project-directory", str(deployment), "-f", str(deployment / "compose.yaml")]
services = {}
for service in ("postgres", "backend", "frontend", "nginx"):
    cid = out(compose + ["ps", "-q", service])
    if not cid or "\n" in cid:
        raise SystemExit("Expected exactly one running container per service")
    container = json.loads(out(["docker", "inspect", cid]))[0]
    if not container["State"]["Running"]:
        raise SystemExit("A required container is not running")
    health = container["State"].get("Health", {}).get("Status")
    if health and health != "healthy":
        raise SystemExit("A required container is unhealthy")
    image_id = container["Image"]
    image = json.loads(out(["docker", "image", "inspect", image_id]))[0]
    services[service] = {"container_id": cid, "image_id": image_id,
                         "architecture": image["Architecture"], "os": image["Os"]}
    if service == "backend":
        env = dict(value.split("=", 1) for value in container["Config"]["Env"] if "=" in value)
        media_root = env.get("DJANGO_MEDIA_ROOT", "/data/media")
        if media_root != "/data/media" or not any(m["Destination"] == media_root for m in container["Mounts"]):
            raise SystemExit("Media root is not the expected persisted volume")
print(json.dumps({"source_commit": out(["git", "-C", str(root), "rev-parse", "HEAD"]),
                  "services": services, "media_root": "/data/media"}))
'''

RESTORED_DATA_CHECK = r'''
import hashlib, json, os, pathlib, sys
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "coach_copilot.settings")
import django
django.setup()
from django.apps import apps
from django.db import models
media = pathlib.Path("/data/media")
inventory = json.load(sys.stdin)
for entry in inventory:
    file = media / entry["path"]
    if not file.is_file() or file.stat().st_size != entry["bytes"]:
        raise SystemExit("Restored media file is missing or has the wrong size")
    checksum = hashlib.sha256()
    with file.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1048576), b""):
            checksum.update(chunk)
    if checksum.hexdigest() != entry["sha256"]:
        raise SystemExit("Restored media checksum does not match")
counts, referenced, missing = {}, set(), set()
for model in apps.get_models():
    if model._meta.proxy or not model._meta.managed:
        continue
    counts[model._meta.label_lower] = model._base_manager.count()
    for field in model._meta.fields:
        if isinstance(field, models.FileField):
            for value in model._base_manager.exclude(**{field.name: ""}).exclude(**{field.name: None}).values_list(field.name, flat=True):
                referenced.add(value)
                if not field.storage.exists(value):
                    missing.add(value)
# Published derivatives are path fields, while original uploads are FileFields.
asset_model = next((model for model in apps.get_models() if model._meta.label_lower == "accounts.exercisemediaasset"), None)
assets = asset_model.objects.filter(status="ready", owner__isnull=False) if asset_model is not None and hasattr(asset_model, "status") else []
for asset in assets:
    for value in (asset.preview_path, asset.poster_path, asset.reel_path):
        if not value.startswith("/media/workout/uploads/"):
            raise SystemExit("Unexpected exercise video path in restored DB")
        relative = value.removeprefix("/media/")
        referenced.add(relative)
        if not (media / relative).is_file():
            missing.add(relative)
print(json.dumps({"model_counts": counts, "media_files_checked": len(inventory),
                  "referenced_files": len(referenced), "missing_file_references": len(missing)}))
if missing:
    raise SystemExit("Restored DB references missing media; recovery is not verified")
'''


def backup(args):
    os.umask(0o077)
    root = args.output_root.resolve()
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    ssh = ["ssh", "-o", "ConnectTimeout=15", "-o", "ServerAliveInterval=15",
           "-o", "ServerAliveCountMax=6", args.ssh]
    remote_root = shlex.quote(args.remote_root)

    def metadata():
        return json.loads(run(ssh + ["python3 - " + remote_root], input=REMOTE_METADATA,
                              text=True, stdout=subprocess.PIPE).stdout)

    before = metadata()
    image_ids = {name: item["image_id"] for name, item in before["services"].items()}
    parent = None
    if args.mode == "update":
        for candidate in sorted(root.glob("*/manifest.json"), reverse=True):
            if candidate.parent.name.startswith("."):
                continue
            data = json.loads(candidate.read_text())
            if data.get("format") == FORMAT and data.get("mode") == "full" and {
                name: item["image_id"] for name, item in data["services"].items()
            } == image_ids:
                verify(candidate.parent)
                parent = candidate.parent
                break
        if parent is None:
            log("No matching full image snapshot; promoting update to a full backup.")
    mode = "update" if parent else "full"
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    target = root / stamp
    pending = root / (".incomplete-" + stamp)
    if target.exists() or pending.exists():
        raise ValueError("Snapshot directory already exists")
    pending.mkdir(mode=0o700)
    log(f"Creating {mode} snapshot {stamp}; production services stay running.")

    def stream(name, command):
        log(f"Saving {name}")
        partial = pending / (name + ".part")
        shell = "bash -e -o pipefail -c " + shlex.quote(command)
        with partial.open("xb") as output:
            run(ssh + [shell], stdout=output)
        if partial.stat().st_size == 0:
            raise ValueError(f"Empty backup artifact: {name}")
        partial.rename(pending / name)

    pg = shlex.quote(before["services"]["postgres"]["container_id"])
    backend = shlex.quote(before["services"]["backend"]["container_id"])
    stream("server.env", f"cat {remote_root}/infra/deployment/.env")
    dump = 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner --no-acl'
    stream("postgres.dump", f"docker exec {pg} sh -c {shlex.quote(dump)}")
    stream("media.tar.gz", f"docker exec {backend} tar -czf - -C /data/media .")
    stream("source.tar.gz", f"git -C {remote_root} archive --format=tar.gz HEAD")
    bundle = f'cd {remote_root}; snapshot_bundle=$(mktemp); trap \'rm -f "$snapshot_bundle"\' EXIT; git bundle create "$snapshot_bundle" --all >/dev/null && cat "$snapshot_bundle"'
    stream("source.bundle", bundle)
    stream("nginx.tar.gz", f"tar -czf - -C {remote_root}/infra/deployment nginx")
    if mode == "full":
        ids = " ".join(shlex.quote(value) for value in sorted(set(image_ids.values())))
        stream("images.tar.gz", f"docker save {ids} | gzip -1")
    if metadata() != before:
        raise ValueError("Production release changed during backup; snapshot left incomplete")
    media = inspect_archive(pending / "media.tar.gz", inventory=True)
    (pending / "media-files.json").write_text(json.dumps(media, indent=2) + "\n")
    manifest = {"format": FORMAT, "snapshot": stamp, "mode": mode,
                "started_at_utc": stamp, "completed_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
                "source_commit": before["source_commit"], "services": before["services"],
                "media_file_count": len(media), "media_bytes": sum(f["bytes"] for f in media),
                "image_snapshot": parent.name if parent else stamp,
                "image_archive_sha256": digest((parent or pending) / "images.tar.gz"),
                "consistency": "PostgreSQL MVCC dump; live media copy verified separately"}
    (pending / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    recovery = pending / "recovery"
    recovery.mkdir(mode=0o700)
    for name in ("recovery.py", "backup.sh", "restore.sh"):
        shutil.copyfile(HERE / name, recovery / name)
    shutil.copyfile(HERE.parent / "docs/backup-restore.md", recovery / "backup-restore.md")
    (pending / "COMPLETE").write_text(FORMAT + "\n")
    checksums(pending)
    log("Verifying checksums, complete dump, archives and saved image inventory.")
    verify(pending)
    for path in pending.rglob("*"):
        path.chmod(0o700 if path.is_dir() else 0o600)
    pending.rename(target)
    log(f"Backup complete: {target}")
    print(json.dumps({"snapshot": str(target), "mode": mode, "image_snapshot": manifest["image_snapshot"],
                      "source_commit": manifest["source_commit"], "media_files": len(media)}))


def restore(args):
    os.umask(0o077)
    snapshot = args.snapshot.resolve()
    log("Verifying snapshot before changing the replacement host.")
    manifest = verify(snapshot)
    image_snapshot = snapshot if manifest["mode"] == "full" else (
        args.images_from.resolve() if args.images_from else snapshot.parent / manifest["image_snapshot"])
    image_manifest = manifest if image_snapshot == snapshot else verify(image_snapshot)
    if image_manifest["mode"] != "full" or digest(image_snapshot / "images.tar.gz") != manifest["image_archive_sha256"]:
        raise ValueError("The required full image snapshot is missing or incompatible")
    architecture = {"x86_64": "amd64", "aarch64": "arm64"}.get(platform.machine())
    if any(item["architecture"] != architecture or item["os"] != "linux" for item in manifest["services"].values()):
        raise ValueError("Replacement host architecture must match the saved images")
    target = args.target.resolve()
    if target == Path("/") or (target.exists() and any(target.iterdir())):
        raise ValueError("Restore target must be a new or empty checkout directory")
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", args.project):
        raise ValueError("Invalid Compose project name")
    for command in (["docker", "ps", "-aq"], ["docker", "volume", "ls", "-q"]):
        if capture(command + ["--filter", f"label=com.docker.compose.project={args.project}"]):
            raise ValueError("Compose project already has containers or volumes; refusing to overwrite data")
    run(["docker", "compose", "version"], stdout=subprocess.DEVNULL)
    log("Importing and verifying each saved service image without registry access.")
    tags = load_recovery_images(image_snapshot, image_manifest)
    target.parent.mkdir(parents=True, exist_ok=True)
    run(["git", "clone", "--quiet", str(snapshot / "source.bundle"), str(target)])
    run(["git", "-C", str(target), "checkout", "--quiet", "-B", "main", manifest["source_commit"]])
    run(["git", "-C", str(target), "remote", "set-url", "origin", "git@github.com:smmtaheri/athlore.git"])
    deployment = target / "infra/deployment"
    env = (snapshot / "server.env").read_text()
    if args.http_port is not None:
        env = re.sub(r"(?m)^HTTP_PORT=.*$", "", env) + f"\nHTTP_PORT={args.http_port}\n"
    (deployment / ".env").write_text(env)
    with tarfile.open(snapshot / "nginx.tar.gz", "r:gz") as archive:
        archive.extractall(deployment, filter="data")
    overlay = {"services": {service: {"image": tag} for service, tag in tags.items()}}
    overlay["services"]["backend"]["environment"] = {"DJANGO_DEBUG": "false", "LOAD_DEMO_FIXTURES": "false"}
    overlay_path = deployment / "recovery.compose.json"
    overlay_path.write_text(json.dumps(overlay, indent=2) + "\n")
    compose = ["docker", "compose", "--project-directory", str(deployment), "--env-file", str(deployment / ".env"),
               "-p", args.project, "-f", str(deployment / "compose.yaml"), "-f", str(overlay_path)]
    restored_services = capture(compose + ["config", "--services"]).splitlines()
    if "exercise-video-worker" in restored_services:
        overlay["services"]["exercise-video-worker"] = {"image": tags["backend"]}
        overlay_path.write_text(json.dumps(overlay, indent=2) + "\n")
    run(compose + ["config", "--quiet"])
    run(compose + ["up", "-d", "--no-build", "--pull", "never", "postgres"])

    def wait_health(service):
        for _ in range(90):
            cid = capture(compose + ["ps", "-q", service])
            status = capture(["docker", "inspect", "--format", "{{.State.Health.Status}}", cid]) if cid else ""
            if status == "healthy":
                return
            if status == "unhealthy":
                raise ValueError(f"Restored {service} is unhealthy; inspect logs before proceeding")
            time.sleep(2)
        raise ValueError(f"Timeout waiting for {service} health")

    wait_health("postgres")
    log("Restoring database atomically into the fresh project.")
    command = 'exec pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-acl --exit-on-error --single-transaction'
    with (snapshot / "postgres.dump").open("rb") as stream:
        run(compose + ["exec", "-T", "postgres", "sh", "-c", command], stdin=stream)
    log("Restoring photos, PDFs, and exercise videos into the fresh media volume.")
    command = 'mkdir -p /data/media; test -z "$(ls -A /data/media)"; tar xzf - -C /data/media; chown -R 10001:10001 /data/media'
    with (snapshot / "media.tar.gz").open("rb") as stream:
        run(compose + ["run", "--rm", "-T", "--no-deps", "--pull", "never", "--user", "0", "--entrypoint", "sh", "backend", "-ec", command], stdin=stream)
    run(compose + ["up", "-d", "--no-build", "--pull", "never", "backend", "frontend", "nginx"])
    wait_health("backend")
    health = "import os,urllib.request; h=os.environ['COACH_DOMAIN']; r=urllib.request.Request('http://nginx/api/v1/health/',headers={'Host':h,'X-Forwarded-Proto':'https'}); assert urllib.request.urlopen(r,timeout=10).status==200"
    run(compose + ["exec", "-T", "backend", "python", "-c", health])
    with (snapshot / "media-files.json").open("rb") as inventory:
        result = run(compose + ["exec", "-T", "backend", "python", "-c", RESTORED_DATA_CHECK],
                     stdin=inventory, stdout=subprocess.PIPE)
    report = json.loads(result.stdout)
    report.update({"snapshot": manifest["snapshot"], "source_commit": manifest["source_commit"],
                   "project": args.project, "verified_at_utc": dt.datetime.now(dt.timezone.utc).isoformat()})
    (deployment / "restore-verification.json").write_text(json.dumps(report, indent=2) + "\n")
    log(f"Verified {report['media_files_checked']} media files and {report['referenced_files']} DB file references.")
    if "exercise-video-worker" in restored_services:
        run(compose + ["up", "-d", "--no-build", "--pull", "never", "exercise-video-worker"])
    log(f"Restore healthy: project={args.project}, checkout={target}. Switch CDN origin after browser QA.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    b = commands.add_parser("backup")
    b.add_argument("--mode", choices=("full", "update"), default="full")
    b.add_argument("--ssh", default="athlore")
    b.add_argument("--remote-root", default="/root/athlore")
    b.add_argument("--output-root", type=Path, default=HERE.parents[2] / "backups")
    r = commands.add_parser("restore")
    r.add_argument("--snapshot", type=Path, required=True)
    r.add_argument("--images-from", type=Path)
    r.add_argument("--target", type=Path, required=True)
    r.add_argument("--project", default="athlore")
    r.add_argument("--http-port", type=int)
    v = commands.add_parser("verify")
    v.add_argument("--snapshot", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "backup":
        backup(args)
    elif args.command == "restore":
        if args.http_port is not None and not 1 <= args.http_port <= 65535:
            raise ValueError("HTTP port must be between 1 and 65535")
        restore(args)
    else:
        manifest = verify(args.snapshot)
        print(json.dumps({"verified": True, "snapshot": manifest["snapshot"], "mode": manifest["mode"]}))


if __name__ == "__main__":
    try:
        main()
    except (subprocess.CalledProcessError, OSError, ValueError, KeyError, tarfile.TarError) as error:
        log(f"Recovery operation failed ({type(error).__name__}); success is not claimed.")
        # Subprocess arguments and environment values may contain secrets.
        if isinstance(error, ValueError):
            log(str(error))
        sys.exit(1)
