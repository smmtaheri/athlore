# Exercise video uploads

Coaches upload one original video from each catalog row or the exercise editor.
`ExerciseMediaAsset` remains the single media model. Shared demonstrations have
no owner; each uploaded immutable revision belongs to one coach and one target
exercise. Another coach cannot inspect or alter its upload job, and catalog
serialization refuses an asset owned by a different coach.

Playback is upload-only: the ready asset must belong to the exercise's coach,
target that exact exercise and have an original upload. Shared seeded demo
assets and legacy tutorial/source URLs are not playback alternatives. Student
responses clear those legacy URLs, including in old programs. The browser also
rejects media outside the generated `/media/workout/uploads/` paths and has no
YouTube iframe, thumbnail or external-tutorial fallback. Attribution for a valid
uploaded video is retained separately from playback. Public coach-written text
remains available without video. No migration deletes historical links or files.

## Coach-written movement education

The exercise editor exposes three independent public text fields in
`execution_guide`: `execution`, `tips`, and `mistakes` (up to 4,000 characters
each). Each non-empty line becomes an item in the corresponding student lesson
tab. The separate `coach_notes` field is never used as educational content.
Coach text works without a video; the row's guide button still opens the lesson.

Existing licensed media education remains the default for sections the coach
has not overridden. The editor displays those defaults without silently copying
them into the coach's saved overrides. An explicitly saved empty section hides
the corresponding default text. Coach instructions override only their own
section and are not assigned fabricated video cue timestamps.

Like media, current public education resolves by exercise ID and program coach
when students read existing programs. Catalog edits update the lesson without
rewriting published prescriptions or workout progress. Foreign/missing catalog
IDs do not expose another coach's current guide. Legacy rows without an exercise
ID retain their existing snapshot; no name-based cross-catalog match is invented.

## API

- `GET /api/v1/exercises/{exercise_id}/media/` returns `{media, media_upload}`.
- `POST` on the same URL accepts multipart `file` (MP4/MOV, up to 100 MiB).
  Optional fields: `author`, `source_url`, `license_name`, `license_url`.
  A 202 response means queued, not playable. Only one active job per exercise
  and at most five active jobs per coach are accepted (409 otherwise).
- `POST /api/v1/exercises/{exercise_id}/media/retry/` retries the latest failed
  original; it does not need a second upload.
- `DELETE /api/v1/exercises/{exercise_id}/media/` removes the current association
  and legacy tutorial links, and cancels queued/processing/failed replacements.
  It never deletes the exercise, program prescription, or workout progress.

Statuses: `queued`, `processing`, `ready`, `failed`, `cancelled`. Poll GET while
queued/processing. `error_message` is user-facing; detailed exceptions include
asset and coach IDs in the application log. Old playable media remains active
until every new output succeeds. Removal during processing prevents publication.

## Processing and storage

The single `exercise-video-worker` service runs
`python manage.py process_exercise_videos`. It uses the backend image with FFmpeg
and FFprobe and a durable database queue, with no external queue dependency.
Jobs left processing for 20 minutes become failed and can be retried by the coach.
Do not scale this initial worker beyond one replica.

Actual stream metadata is validated (video stream, finite positive duration up
to 120 seconds, up to 3840 x 2160 pixel area). Three outputs are generated before
the catalog association changes:

- Full H.264/yuv420p MP4, up to 1280 pixels per side, with faststart and optional
  AAC audio. Aspect ratio and phone orientation are preserved.
- Silent, up-to-six-second preview, up to 400 pixels per side.
- Automatically extracted JPEG poster.

Originals are private under `MEDIA_ROOT/exercise-sources/{asset_id}/`.
Published outputs are under `MEDIA_ROOT/workout/uploads/{asset_id}/` and served
at the same origin's `/media/workout/uploads/{asset_id}/{video.mp4,preview.mp4,poster.jpg}`.
Nginx mounts the media volume read-only and exposes only these three processed
educational files. Do not replace that narrow alias with a public MEDIA_ROOT
alias: visit photos and PDFs are private. The processed demonstrations themselves
are public static media; UUID URLs are not an authentication boundary.

Revision URLs are immutable. Old revisions and originals are retained rather
than deleting files that snapshots or cached links may still reference. Account
for these files when monitoring volume capacity; physical garbage collection is
not an automatic consequence of removing a video from an exercise.

## Existing programs and starter media

On student program reads, uploaded media resolves from the program
coach's current catalog by `exercise_id`. Even a populated old snapshot cannot
override a replacement or reintroduce a removed video. Missing/foreign IDs do not
resolve another coach's media. Frozen prescriptions and progress remain intact.

The existing ten demonstrations in `apps/front/public/media/workout/` match the
supplied handoff ZIP byte-for-byte, including credits. They remain the bundled
archived starter library, not automatically playable student videos; runtime
uploads are stored in the persistent media volume,
not in Git or frontend builds. No starter video import or separate DNS record
is needed. The frontend and backend no longer rewrite asset keys to the demo host.
Only the upload workflow makes a video playable on its matching movement.
Bundled `/media/workout/{key}-preview.mp4` URLs remain stored static files but are
not used as a fallback. Uploaded derivatives live under `/media/workout/uploads/`
and do not depend on a browser cache entry for persistence. Reloading fetches
the current coach-owned upload association.

The shared stage gateway forwards the isolated stage Nginx CSP, instead of
appending the production CSP. `stage-gateway-up.sh` patches only the stage server
block in the shared edge when the operator runs the existing stage deploy.

Backups include originals and derivatives from the entire media volume. Recovery
checks both FileField originals and ready-upload derivative paths, reuses the
saved backend image for the worker, and starts the worker after data verification.

## Stage acceptance flow

Use mock SMS for any E2E fixture authentication/publication according to the
existing test-only SMS override; uploading exercise media sends no SMS itself.

1. As coach A, open `/coach-rules?section=exercises`, choose a row's video action,
   and upload one MP4/MOV. Confirm upload progress, queued/processing and ready.
2. Verify automatic poster, silent looping row preview and full-video seeking
   on the student's existing program. Confirm `video/mp4`, JPEG MIME, HTTP 206
   for byte ranges, and no CSP violations. Cover 390px mobile and 1440px desktop.
3. Replace the video: the old file remains playable while processing, then the
   student sees the new revision after refreshing. Sets and history stay intact.
4. Upload corrupt content: show a visible failure, retain the prior revision,
   and offer retry/new-file selection. Reject unsupported extensions and >100 MiB.
5. Remove during processing: no later job completion may reattach the video.
6. As coach B, reject A's upload/status/delete/retry API calls. For two identically
   named exercises owned by different coaches, each student resolves their coach's
   file only. Archive unrelated records and check permissions remain unchanged.
7. On mobile, upload from the picker and verify modal controls, error visibility,
   reduced-motion behavior, and that no long action label causes horizontal scroll.

Deployment is operator-controlled. The existing stage deploy builds the FFmpeg
image, applies migration `0023_coach_exercise_video_uploads` through the backend
entrypoint, mounts the existing volume into Nginx, and starts the new worker.
