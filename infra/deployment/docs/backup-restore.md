# Athlore backup, update and disaster recovery

This is the canonical operator runbook. "Take a backup" means a **full**
snapshot. "Update the backup" means a new **update** snapshot. "Recover on a
new server" means restoring the latest verified snapshot on a fresh host,
then changing the existing CDN origin. Never restore over production in place.

## Coverage and location

Run backups on the operator's laptop, not inside the production checkout:

```text
/home/nobitex/Desktop/Tasks/Nobitex/athlore/backups/<UTC timestamp>/
```

Each snapshot contains a custom PostgreSQL dump, all `/data/media` files
(student photos and generated PDFs), the actual production runtime `.env`,
the deployed Git source archive and bundle, the rendered Nginx configuration,
a media file/hash inventory, release metadata, recovery tools and this guide.
A full snapshot also includes all four **running image IDs**, including
PostgreSQL and Nginx, in `images.tar.gz`. Image tags alone are not trusted.

Snapshots contain private data and secrets. They are excluded from Git;
directories are private (`700`) and files are private (`600`). They are not
encrypted. Keep a second copy on a trusted separate disk. Never publish these
files or print `server.env`. The scripts never prune or overwrite snapshots.

Laptop prerequisites: Python 3.10.16+ (3.12 recommended), Git, SSH access via `ssh athlore`, and a
PostgreSQL 16 `pg_restore` client. Backup does not require local Docker.
Production prerequisites: the four Compose services must be running, healthy
where health checks exist, and the deployed Git checkout must be clean.

## 1. Take a full backup

```bash
cd /home/nobitex/Desktop/Tasks/Nobitex/athlore
bash infra/deployment/scripts/backup.sh --mode full
```

The script reads `/root/athlore` through SSH. It does not deploy, migrate,
restart services, modify runtime configuration or write application data.
It creates a temporary Git bundle on the server and removes that temporary
file afterwards. All lasting backup files are downloaded to the laptop.

An unfinished operation stays under `.incomplete-<timestamp>` and may contain
`.part` files. It is not a valid recovery snapshot. A directory receives its
final timestamp name only after complete dump reading, archive checks,
image inventory checks and relative SHA-256 checksum verification succeed.
The source commit and running container/image IDs are checked again at the
end; a concurrent release change rejects the snapshot. Do not deploy while
the backup is running.

Database consistency is provided by PostgreSQL's MVCC dump. Media is copied
live afterwards. Cross-resource consistency cannot be guaranteed during
concurrent uploads/deletions: a recovery rehearsal must check all DB file
references against restored media. If any are missing, investigate and take
another snapshot before treating it as a recovery point.

## 2. Update the backup

```bash
cd /home/nobitex/Desktop/Tasks/Nobitex/athlore
bash infra/deployment/scripts/backup.sh --mode update
```

This creates a separate complete DB/media/env/source snapshot. When all four
running image IDs match a verified full snapshot, the new snapshot references
that full snapshot instead of downloading the image archive again. Both
directories must be retained and transferred together. Its manifest records
the exact parent snapshot and image archive hash. Updates are independent of
earlier updates: only the referenced full image snapshot is required.

If images have changed or no matching full snapshot exists, the update
automatically becomes a full snapshot. No old file is modified. Use updates
daily or after important data changes, and full backups before major releases
or migrations. Scheduling is manual; no cron job is installed by this change.

## 3. Verify or transfer a snapshot

Substitute the actual timestamp printed by the backup command:

```bash
python3 infra/deployment/scripts/recovery.py verify \
  --snapshot backups/<timestamp>
```

Relative checksums still work after transferring the directory:

```bash
cd /path/to/snapshot
sha256sum -c SHA256SUMS
```

Archive verification is not a substitute for a real recovery rehearsal.
Check permissions after copying to another disk. Do not include real backups
in a Git commit; only scripts and documentation belong in Git.

## 4. Recover on a fresh replacement server

Prepare Linux **x86_64**, Docker Engine, Docker Compose v2.26+, Python 3.10.16+,
Git and PostgreSQL 16 client tools ahead of time. Package installation is not
included in the offline guarantee. Copy the latest data snapshot and its
referenced full snapshot to the new server, preserving directory names.
No access to the old server, GitHub or Docker Hub is needed for the restore.

For example, place snapshots under `/root/athlore-backups/`. Then run:

```bash
bash /root/athlore-backups/<latest timestamp>/recovery/restore.sh \
  --snapshot /root/athlore-backups/<latest timestamp> \
  --target /root/athlore
```

The target must be absent or empty. The Compose project `athlore` must have no
existing containers or volumes. The script verifies checksums and image
architecture, loads saved images, recreates the deployed Git checkout,
restores `.env` and Nginx configuration, starts only PostgreSQL, waits for
health, and restores the database in one transaction with stop-on-error.
It then restores media to a fresh volume and starts the saved backend,
frontend and Nginx using `--no-build --pull never`.
Before reporting success, it checks every saved media file's size/hash and
every nonempty Django FileField reference. Missing files fail verification.
Model row counts and verification metadata are written privately to
`infra/deployment/restore-verification.json` on the replacement host.

An update automatically resolves its sibling full snapshot. If that full
snapshot is elsewhere, pass `--images-from /path/to/full-snapshot`.
The script never ignores restore errors or deletes existing application
data. A failed attempt may leave a partial **new** installation; inspect it
before cleanup or retry. It refuses to silently resume over that installation.

Keep `/root/athlore/infra/deployment/recovery.compose.json` after recovery:
it selects the exact loaded image tags. For status, use both Compose files:

```bash
cd /root/athlore/infra/deployment
docker compose -f compose.yaml -f recovery.compose.json ps
```

Before cutover, check health and the public Home, coach/student login,
student lists, visits, programs, PDF downloads and progress photos. Confirm
database counts and media hashes/reference completeness. Existing accounts
and passwords come from the restored DB; do not create replacement demo data.

TLS is still terminated by the ParsPack CDN (`TLS_MODE=external`). Change the
origin IP for `athlore.ir`, `coach.athlore.ir`, and `student.athlore.ir` in the
CDN/DNS panel to the replacement server after QA. Keep proxying enabled,
forward HTTPS scheme, and preserve API/auth no-cache rules. CDN access,
account recovery codes and DNS configuration are external prerequisites and
are not reconstructed from this backup. Do not install local Certbot.

Writes after the last snapshot are not recovered. Existing sessions may be
present in the DB; browser authentication is verified separately after cutover.

## 5. Isolated recovery rehearsal

On a machine with Docker, restore into a temporary empty checkout with a
different Compose project and HTTP port, leaving production untouched:

```bash
bash backups/<timestamp>/recovery/restore.sh \
  --snapshot backups/<timestamp> \
  --target /absolute/path/to/empty/rehearsal/athlore \
  --project athlore-recovery-qa --http-port 18082
```

Access the origin with canonical Host and forwarded scheme headers. Backend
startup runs the deployed migration/collectstatic entrypoint only against the
isolated restored DB; demo fixture loading is explicitly disabled. Record the
result and remove only the rehearsal project's containers and volumes once
verified. Never run teardown commands against the production project.

## Recorded recovery rehearsal: 2026-10-02

- Full snapshot: `backups/20261002T064549Z/` (approximately 450 MiB).
- Updated snapshot: `backups/20261002T065222Z/`, referencing the full snapshot's images.
- Deployed source: `06acfd993da727ac98103850f42d6ce26a9ef6d6`.
- The updated snapshot was actually restored under a separate local Compose
  project using only the saved Git bundle, configuration and four saved images.
- PostgreSQL and backend health passed, including the Nginx API gateway.
- All 9 media file sizes/hashes matched; all 9 DB file references resolved.
- Restored counts included 3 coaches, 1,019 students, 8 visits, 5 programs,
  16 Body Check cycles, 44 daily entries, 2 progress photos and 7 PDF artifacts.
- The private JSON verification report is
  `backups/restore-checks/20261002T065222Z.json`.
- The rehearsal containers and volumes were removed afterwards. Production
  services were not restarted, deployed or migrated by this operation.

These results describe this historical snapshot, not the current live counts.
