# Experience configuration

The active `experience.json` lives at the selected external content root. The first launch seeds `~/Movies/RELight Engine Content/experience.json` and an empty `media/` folder from the packaged Test default.

Use **Settings → Open Content Folder** to edit files, then **Validate**. **Reload** and narrative-setting changes are accepted only while the engine is IDLE. An invalid edit never replaces the in-memory configuration: the next live Start is blocked, exact validation paths are shown, and **Restore Last Known Good** rewrites the last validated copy atomically.

## Top-level shape

```json
{
  "schemaVersion": 1,
  "experience": {
    "title": "RE:Light",
    "recordingDurationMs": 6000,
    "minimumEarlyStopMs": 1000,
    "endHoldMs": 8000,
    "visitorWaitTimeoutMs": null
  },
  "audioBuses": {},
  "voiceEffects": {},
  "audience": {},
  "states": []
}
```

Narrative timing belongs to this file. Operating mode, hardware assignments, display preference, microphone/output choices, volumes, and developer diagnostics live in application settings.

## Protected graph

The required states are:

```text
BOOT → SYSTEM_CHECK → IDLE
IDLE → MEMORY_INTRO → WAITING_FOR_RECORD
RED → RECORDING → DREAM → PRESSURE → NARROWING
NARROWING → FINAL_PROMPT → WAITING_FOR_CHOICE
WHITE → RELIGHT → END → RESETTING → IDLE
```

Every reserved state must appear once and be reachable. Recording and choice gates must retain this order. Additional passive states may be inserted between gates, but every transition must be declared. Cycles are rejected except explicit idle and wait loops. `RESETTING` must lead to `IDLE`.

State fields:

- `id`: unique state identifier.
- `kind`: `system`, `wait`, `passive`, `recordGate`, `recording`, or `choiceGate`.
- `durationMs`: required for timed passive/recording states.
- `media`: optional relative path such as `media/memory-intro.mp4`; absolute paths and URLs are invalid.
- `placeholder`: local audience title/copy used by the text-only Test presentation and developer diagnostics.
- `loop`: whether authored media loops.
- `next`: the single validated next state.
- `timeline`: time-ordered events for this state.

Supported timeline actions are deliberately closed. `transition` may target only the state’s declared `next`; `playVisitorVoice` may use one of the typed voice presets and is legal only where visitor playback is expected. Unknown actions—including future ideas such as `vibrateVisual`—fail validation.

## Timeline rules

Timeline time follows media time and pauses with playback. Events fire once per state revision when playback crosses their timestamp. Seeking forward intentionally does not backfill skipped events. A loop starts a new loop epoch without duplicating one-shot narrative events. Restart Scene creates a fresh state revision and a fresh event ledger.

Canonical placeholder timing is 5s Memory, 6s Dream, 6s Pressure, 12s Narrowing, 5s Final Prompt, 10s Relight, and 8s End hold. `memoryDecay` begins 1.5s into Narrowing and clean visitor-voice playback begins 1.5s into Relight. Wait states have no timeout by default.

## Test presentation and media handling

Test traverses the same protected graph, waits at the same recording and choice gates, and uses the same revision/stale-callback rules as Production. It deliberately renders the current scene name as local text rather than substituting an unofficial film. `Space` starts from Idle, `R` controls the recording gate, and `W` represents White / Choose Again. Timed states advance automatically; the operator transport may pause, resume, restart, skip, return to Idle, or reset.

Test mode and placeholder content never satisfy Production media readiness. This separation lets operators verify the complete interaction now without weakening the later final-content gate.

Only files under the selected content root can be loaded. The local media protocol rejects traversal, absolute paths, symlink escapes, query URLs, remote schemes, and files outside the root. MP4 byte ranges are supported for seeking.

Missing or corrupt production media fails System Check. Text-only scene rendering is available only in labeled Test/developer behavior. `scene01.mp4` is not bundled; an operator may select it through the development-only local-media action as smoke material.

Final media is intentionally deferred. When approved assets arrive, recommended delivery is 1920×1080 H.264 video with AAC audio, stable frame rate, and captions reviewed on the actual projector. Confirm rights, loudness, motion/flashing safety, dropped frames, transition gaps, and exact cue timing before exhibition acceptance. Keep every final asset in the external content pack, never in the repository or app bundle.
