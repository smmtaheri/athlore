# Visit training-system muscle scopes

Each `program_settings.training_systems` item supports an optional `muscles`
array alongside `key` and `variants`. For example:

```json
{"training_systems": [{"key": "drop_set", "muscles": ["سینه", "سرشانه"]}]}
```

The visit UI reveals muscle checkboxes only for selected systems. Each system
has its own scope. Removing the system removes its scope; saving coach defaults
and copying previous program settings preserve it. Missing or empty `muscles`
retains the existing unrestricted behavior. The backend validates and normalizes
the supported generator muscle groups, including separate quadriceps, hamstrings,
glutes and traps; arbitrary muscle strings are rejected. The broad legs choice
continues to cover its constituent primary targets.

Generation matches the exercise's canonical primary snapshot target, alongside
the session's display group; secondary muscles never activate a technique scope.
Scopes filter eligible candidates before per-session limits and recipe
targets (such as last isolation) are applied. They do not force every exercise
of the muscle to use the system. Level, injury, grouping and equipment constraints
still apply. All members of a superset or larger group must be in scope; the
system's existing pairing mode still determines which members can be combined.
Groups remain adjacent in the full session, including unselected muscles.
If no eligible candidate exists, evidence reports zero applications and there
is no fallback to exercises of another muscle. Evidence includes the muscle scope.

Precise execution-plan templates own their own systems. A scoped visit selection
combined with such a template returns a validation error asking the coach to
choose automatic generation, rather than silently discarding the selected scope.

## Focused regression checks

- Visit: choose drop set for chest and shoulders and superset for legs. Save and
  reopen; verify the scopes remain independent. Deselecting a system removes its
  hidden selections. Check wrapped checkbox rows on mobile and desktop.
- Generate from the visit; inspect generation request, evidence, and exercise
  techniques. Untargeted muscles must not acquire the selected system. Verify
  supersets remain consecutive and retain their pairing and safety rules.
- Repeat with no eligible target muscle and with no muscle selection. The former
  must not spill onto other muscles; the latter must retain legacy behavior.
- Save as coach defaults and reuse previous program settings; scopes must survive.
- Upload `apps/front/public/media/workout/bench-reel.mp4` to the matching barbell
  bench press from coach rules > exercise catalog > video. Preserve its attribution
  from `apps/front/public/media/workout/media-credits.json`. Wait for ready, then
  inspect the same coach's student program preview and full player. Do not upload
  the preview or poster separately. Do not send SMS for these checks.
