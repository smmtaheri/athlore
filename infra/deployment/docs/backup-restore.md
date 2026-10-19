# Athlore backup, update and disaster recovery

This is the canonical operator runbook. "Take a backup" means a **full**
snapshot. "Update the backup" means a new **update** snapshot. "Recover on a
new server" means restoring the latest verified snapshot on a fresh host,
then changing the existing CDN origin. Never restore over production in place.

**Backup acceptance:** `COMPLETE` and `verify` establish artifact integrity,
not successful recovery on a different Docker installation. The 2026-10-20
replacement-host recovery exposed an image archive that passed these checks
but did not load all four services on Docker 29. Follow the image compatibility,
data comparison and cutover requirements below before accepting a new backup
or deleting the preceding one.

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

The automated snapshot covers **production only**. It does not capture the
isolated stage database/media volumes, `/root/athlore-stage/infra/deployment/.env.stage`,
stage images/release, laptop shell commands, SSH configuration/private keys,
GitHub deploy-key registrations, or ParsPack DNS/CDN configuration. Record
these separately in a private recovery inventory. A fresh stage checkout and
newly generated `.env.stage` do not restore existing stage accounts or data.
The production `--remote-root` option alone does not implement stage backup:
the collector still assumes production `compose.yaml` and its services.

Laptop prerequisites: Python 3.10.16+ (3.12 recommended), Git, SSH access via `ssh athlore`, and a
PostgreSQL 16 `pg_restore` client. Backup does not require local Docker.
Production prerequisites: the four Compose services must be running, healthy
where health checks exist, and the deployed Git checkout must be clean.

On a replacement host, check the prerequisites **before** transfer/restore:
Python, Git, Docker Engine, Compose, PostgreSQL client, available disk and
architecture. Install `rsync` on both ends if using it for transfer. Use a
`pg_restore` version compatible with the dump producer; these snapshots use
PostgreSQL 16. Record source and destination Docker versions and image stores
(`docker info`), and rehearse with the destination combination. A successful
local `overlay2` rehearsal does not establish compatibility with Docker 29's
containerd image store. Allow disk space for decompressed image archives,
loaded images, media and the restored database. Put large conversion files on
a disk-backed filesystem; `/tmp` can be RAM-backed on Debian.

Run operator commands in an existing terminal, in small independently checked
steps, retaining the output and exit status of each. The laptop uses Zsh;
Bash's `read -p` is not a portable pause command there. Do not wrap the whole
migration in a terminal-launching command that closes before its error can be
read. A failed `rsync` prerequisite or image import is a separate issue from
database restoration; identify the failed phase before retrying it.

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

Keep the preceding usable backup until the new snapshot passes verification
**and an actual isolated restore**, including DB/account comparison and media
checks. Delete older snapshots only when explicitly requested and only after
resolving their exact paths and update-parent dependencies. If the requirement
is one self-contained backup directory, take a full snapshot; an update that
references an older full snapshot cannot meet that requirement on its own.

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

Inspect both Docker archive formats when present: `manifest.json` and the OCI
`index.json`/referenced manifest blobs. Require coverage of every saved service
in the format the destination Docker actually imports. A legacy manifest
containing four config IDs is insufficient if the OCI index exposes only one.
Prefer explicit service/release tags during image export and verify their
mapping to the saved image configurations and filesystem layers. On Docker
29, displayed image IDs can be manifest digests rather than the config digests
used by the classic image store; do not rely on their equality or attempt to
fix this by guessing/shortening IDs.

After `docker load`, inspect **each** expected service reference. The message
`Loaded image ID` or a zero exit status does not prove that four usable images
exist. Missing/misidentified images block database restore. `verify_images`
in the current `recovery.py` checks the legacy manifest only, and `restore`
retags by saved image ID: these checks alone do not enforce the compatibility
requirements above. An existing full snapshot reused by `--mode update`
inherits the same image compatibility limitations.

During the 2026-10-20 recovery, the operator used the separate laptop helpers
`backups/restore-docker29.py` and `backups/audit-restored-data.py`. They are
ignored by Git and are **not automatically included** by the current backup
collector. Before the next snapshot is accepted as self-contained, preserve
any required compatibility/audit tools in the versioned deployment tooling
and the checksummed recovery package, and rehearse using only that package.
If tooling is still separate, retain a checksummed companion package and
record that dependency explicitly; do not claim the snapshot alone is enough.

If an image compatibility failure occurs after transfer, keep the original
snapshot and checksums unchanged. A separately reviewed helper can convert
and name images from the archive already on the destination, then verify each
service's configuration/layers against the saved originals. Transfer only
that small helper when needed; do not resend the whole backup unnecessarily.
Rebuilding/pulling application images is not an equivalent offline restore
unless the intended source version, dependencies and resulting behavior are
separately established. Never use replacement demo data to work around it.

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

Compare the restored database **against the dump being restored**, ideally
before normal traffic, using a read-only consistent transaction. Compare
row contents in an order-independent way, not just table counts. Separately
check every account ID, password hash, active flag, login identifier and its
coach/student relationship. Check student phone numbers and portal access
flags as well. Never print passwords, stored hashes, tokens or full personal
records in reports. Password-hash equality preserves credentials from the
snapshot; it does not test browser authentication for every user or include
password changes made on the old server after the dump.

`restore-verification.json` records counts and file integrity, not a full DB
row/password comparison. Record the latter separately. After login QA, extra
outstanding/blacklisted token rows can be legitimate. An operator-edited
student record can also differ. Explain each difference rather than either
claiming corruption or dismissing all mismatches as harmless.

Test password login using actual existing coach and student accounts, plus
OTP only when configured. If a login fails, inspect the direct origin JSON
response and the saved account/profile data before changing credentials:
CDN-generated HTML can hide an underlying JSON `401`, and a pre-existing
wrong profile phone is not evidence of lost password data. Do not reset all
passwords, rename accounts, reseed users or change profile links to make QA
pass. Also test visit submission, photo upload, program upload/download and
Body Check submission on mobile and desktop. Report untested flows as such;
successful login and file checks do not prove every workflow works.

TLS is still terminated by the ParsPack CDN (`TLS_MODE=external`). Change the
origin IP for `athlore.ir`, `coach.athlore.ir`, and `student.athlore.ir` in the
CDN/DNS panel to the replacement server after QA. Keep proxying enabled,
forward HTTPS scheme, and preserve API/auth no-cache rules. CDN access,
account recovery codes and DNS configuration are external prerequisites and
are not reconstructed from this backup. Do not install local Certbot.

An HTTP request to the bare replacement IP can return the default Nginx `404`.
Test the canonical Host header instead. Set `RECOVERY_ORIGIN_IP` to the new
host for this migration; the address below is the 2026-10-20 replacement:

```bash
RECOVERY_ORIGIN_IP=82.115.8.152
curl --fail --resolve "athlore.ir:80:${RECOVERY_ORIGIN_IP}" http://athlore.ir/
curl --fail --resolve "coach.athlore.ir:80:${RECOVERY_ORIGIN_IP}" \
  -H 'X-Forwarded-Proto: https' http://coach.athlore.ir/api/v1/health/
curl --fail --resolve "student.athlore.ir:80:${RECOVERY_ORIGIN_IP}" \
  -H 'X-Forwarded-Proto: https' http://student.athlore.ir/api/v1/health/
```

An HTML `200` proves only that HTML was served. After cutover, verify browser
login/API/file requests through the CDN and correlate a unique test request
with access logs on the **new** origin. `dig` can show CDN edge addresses when
proxying is enabled; it does not identify the configured origin. Preserve
working POST/PATCH and API error-handling rules, and inspect any Origin Rules
that still override the origin IP. Change stage hostnames only when stage has
actually been prepared on the destination; production recovery does not
recover it. Inventory `www` and wildcard records separately so a retired
origin is not left behind unintentionally.

Writes after the last snapshot are not recovered. Existing sessions may be
present in the DB; browser authentication is verified separately after cutover.

For a planned migration, arrange a final write freeze or another verified
catch-up mechanism, then capture the final DB/media state before switching
traffic. Otherwise changes made on the old origin after the dump are absent
even when every backup check passes. Keep the old host recoverable until
data comparison and cutover QA pass. Do not promise zero data loss or zero
downtime from a live `pg_dump` plus DNS/CDN changes alone.

Before retiring the old host, move operational access too:

- Update the laptop SSH alias `athlore` and any explicit host overrides used
  by production/stage commands. Confirm the resolved destination with
  `ssh -G athlore`. Commands must work from outside the repository as before.
- Create a new repository-scoped, read-only GitHub deploy key on the new host,
  register only its public half, and trust a verified GitHub host key. Never
  copy the operator's private key onto the server. Test repository reads from
  both checkouts without a forwarded laptop agent. Retire the old deploy-key
  authorization after the new access is confirmed.
- Prepare `/root/athlore-stage` on the stage branch and restore its separate
  environment/data if they are required. A new empty stage remains explicitly
  empty. Do not copy production secrets or data into it implicitly.
- The recovered stack uses `recovery.compose.json` image references. Before
  switching back to ordinary deploy commands, resolve the standard Compose
  image names and ensure the recovered images are available under the names
  required for failure rollback, including PostgreSQL/Nginx and app images.
  Adding an alias to an inspected image does not require restarting it.
- Verify status and command routing without invoking a deploy just to test
  connectivity. Building, starting stage, restarting production and changing
  CDN records require the corresponding operator request. Do not claim a
  simulated dispatch test is a real deployment test.

Git/source bundles and the runtime `.env` do not recreate deploy-key
registrations, the server's local Git SSH settings or laptop command targets.
Keep a private inventory of these operational dependencies with the backup.

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

## Recorded replacement-host recovery: 2026-10-20

- Full production snapshot: `20261019T194937Z`; release `41af141`.
- Destination: Debian 13, x86_64, Docker 29.9.1 using the containerd image
  store. The laptop's classic `overlay2` image store behaved differently.
- Checksums and the original `verify` passed, but the archive's legacy
  manifest listed four images while its OCI index exposed one. The initial
  restore stopped during image loading/tagging, before DB/media restoration.
- The separate compatibility helper imported all four as named service
  images from the existing server archive and checked their saved filesystem
  layers and runtime image configuration. No large retransfer was needed.
- The original recovery then restored the database atomically and verified
  all 97 saved media files and all 97 DB file references.
- A subsequent read-only comparison checked 64 tables. 61 matched exactly;
  one student record had an operator-confirmed edit, and the two token tables
  contained extra rows consistent with login/session tests. All 42 account
  IDs remained present, with no password-hash, active-flag or username changes.
  The student count remained 1,044.
- Coach login and the existing athlete account's password login were tested
  against the new origin/CDN. A wrong stored profile phone was diagnosed
  separately and corrected by the operator; credentials were not reset.
- The operator moved the CDN origin and later requested laptop-command and
  repository-access migration. Stage data was not part of this snapshot.

These are evidence for this one snapshot/recovery, not automatic guarantees
for later backups. The source `recovery.py` was not fixed by this documentation
update; its image compatibility checks and full-data comparison must be
implemented or supplied as verified recovery tooling before the next backup
can be accepted under the requirements above.
