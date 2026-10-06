# RE:Light — Technical Delivery and Installation Contract v3

**Purpose:** make the film, physical epilogue, and exhibition handoff reproducible by people who were not in the room during development.

## Runtime boundaries

- Projected film: **exactly 02:00 maximum** from first black frame to final encoded black frame.
- Projection reaches full black at **01:51** and remains encoded black until 02:00.
- Physical light/telephone epilogue begins at **01:51** and may continue to approximately **02:12**.
- The pre-film recording interaction and post-film reset are installation states, not part of the two-minute projected-film limit.
- The film never autoloops. `IDLE`/attract behavior is separate from the active experience.

## Seedance constraints

- Seedance is the only video-generation platform.
- Default request length is 5 seconds.
- Maximum allowance is 60 five-second-generation equivalents.
- Any longer request requires a written reason and proportional deduction from the remaining allowance before submission.
- Maintain a six-equivalent emergency reserve until a full two-minute rough cut exists.
- Prompt cards may request clean visual plates only—never readable Thai text, ages, logos, or factual labels.
- Reference-frame image-to-video conditioning is mandatory for P06, C00–C07, N01, and N02 and recommended elsewhere.
- Conditioning stills must be owned, licensed, or project-created. “Reference only” research images cannot be used as literal first frames without permission.
- Planning assumption: importing an existing still does not consume a five-second video-generation equivalent. Verify this in the live account before the first attempt. If the account charges for reference inputs, stop and recalculate the budget.
- The first technical test wave has a hard ceiling of 12 five-second equivalents and ends with a mandatory stop-and-review.

## Asset naming convention

Use:

`RL_[SHOT]_[SLUG]_G[ATTEMPT]_[DURATION]_[STATUS].[ext]`

Examples:

- `RL_M02_child-wake_G01_5s_RAW.mp4`
- `RL_C04_offer_G03_5s_SELECT.mp4`
- `RL_N01_elevator-master_G02_5s_APPROVED.mp4`
- `RL_R03_vapor-retreat_G01_5s_RAW.mp4`

Allowed status tokens: `RAW`, `REJECT`, `SELECT`, `APPROVED`, `FINAL`.

Never overwrite a prior generation. Resolve timelines reference only `SELECT` or `APPROVED` assets.

## Folder contract

```text
RELight_Content_v3/
  00_admin/
  01_references/
  02_seedance_raw/
    M_memory/
    P_possibility/
    C_choice/
    N_narrowing/
    R_relight/
  03_selects/
  04_audio/
    dialogue/
    visitor_dynamic/
    ambience/
    music/
    telephone/
  05_graphics/
  06_resolve/
  07_exports/
    review/
    master/
    playback/
    captions/
  08_approvals/
```

## Picture pipeline

- Timeline: 1920×1080, **exactly 24.000 fps**, progressive, 16:9 working canvas.
- Final projected media length: **2880 frames**. Do not export at 23.976 fps.
- Color management: DaVinci Wide Gamut / Intermediate working space, output Rec.709 Gamma 2.4 unless projector calibration requires a documented output transform.
- Archive/mezzanine master: ProRes 422 HQ, 24 fps, embedded PCM audio.
- Review exports: H.264, 1080p, exactly 24.000 fps.
- Playback export: choose only after soak testing inside the actual Electron/Chromium player and projector chain. Start with H.264 High Profile, `yuv420p`, 35–50 Mb/s target bitrate and 25 Mb/s minimum. Test VP9 as fallback. ProRes remains an archive/mezzanine format, not an assumed playback codec; do not prescribe HAP without verified support.
- Add a restrained fine dither/grain layer to M01, M05 bloom, R04, R05, and other slow black gradients to reduce visible 8-bit H.264 banding. Confirm it does not lift projection black perceptibly.
- For finished 5-second walking shots derived from 5-second generations, test a 92% speed retime as the standard starting point to create editorial headroom. Approve cadence and interpolation shot-by-shot; never use retiming to conceal structural drift.
- No frame interpolation on the projector. Disable motion smoothing.

## Projection geometry and black handoff

- Measure the final projection surface before typography lock: physical width, height, aspect ratio, throw, viewing distance, and keystone/corner-pin crop.
- Until measurement, keep all critical text inside 10% horizontal and 12% vertical safe margins.
- Projector “black” alone is not accepted as the physical-darkness solution.
- Select and test a physical dowser/shutter, source blanking method, or verified light-blocking solution before approving R05.
- Confirm that the screen disappears perceptually when the real telephone light activates.
- Record the tested method, trigger latency, and failure behavior in the exhibition setup guide.

## Thai typography

- Typeface: LINE Seed Sans TH.
- At 1920×1080, provisional minimum critical text size is 64 px; primary statements should target 80 px or larger.
- Minimum line height: 1.35× font size.
- Maximum two lines per statement and two simultaneous text layers.
- Minimum readable dwell: 1.2 s for a single short word and 1.8 s for a phrase. N02, N06, and N08 must be checked against this floor on the real projection.
- Never crop Thai tone marks or vowels; inspect rendered top and bottom bounds at 100% scale.
- Use deterministic Resolve graphics, not generated typography.
- Final sizes must be validated on the actual projection surface from the visitor seat.

## Captions and accessibility

- Create a fully timed Thai `.srt` master for all intelligible dialogue and narration.
- Produce a captioned review export and an exhibition-caption option.
- Because projection is intentionally black during the telephone epilogue, provide the telephone transcript in an accessible physical format near the exit or through an approved secondary accessibility method.
- Caption wording must match `RELight_Copy_Lock_v3.md` exactly.

## Audio pipeline

- Master audio: 48 kHz, 24-bit PCM.
- Anchor dialogue and narration on short-term loudness, provisionally around −18 to −16 LUFS-S, with true peak no higher than −1 dBTP. Report integrated LUFS but do not normalize to it because long silence would make active passages artificially loud.
- Telephone narration must remain intelligible without a loudness jump. Calibrate handset and fallback speaker separately.
- Measure the handset at the earpiece with an appropriate coupler/meter. Use **75 dBA equivalent level as the conservative child/sensitive-listener ceiling**, with the volume control locked after calibration; record the measurement method and result.
- Mark 01:37.7 as true digital silence: no reverb tail, ambience, music, or automatic crossfade.
- At 01:51 projected audio remains silent while the real telephone owns the room.
- Document the relationship between film, visitor voice, handset, and fallback-speaker levels after calibration.

## Telephone cue and fallback

- At 01:51: projection reaches black, controlled room light activates, and telephone cue begins.
- Preferred path: visitor lifts the handset; off-hook detection begins the locked telephone message.
- If off-hook is not detected within 4 seconds, the system plays the same message through the designated room speaker.
- Once fallback playback begins, a late handset pickup must not restart, duplicate, or layer the message. The room-speaker stream continues from its current playhead and the handset remains muted for that cycle.
- The projection remains black for either path.
- Do not disconnect at 02:00. End only after `CL-PHONE-03` and its final pause.
- Reset begins only after the telephone/fallback message is complete and visitor exit is safe.

## Attract and trigger behavior

- The two-minute film is never used as a lobby loop.
- `IDLE` presents a clearly alive attract state through controlled physical light/telephone presence or a separate approved screen state.
- The active film starts only after the intended visitor trigger/recording gate.
- Opening black is therefore read as intentional silence, not a broken projector.
- Define operator override and timeout behavior in the exhibition setup guide.

## Mid-experience abandonment

- Presence loss alone must not instantly reset while a visitor merely shifts position. Use an operator-confirmed abort or a tested sustained-absence threshold.
- On confirmed abandonment: fade/cut to safe black, stop all media and physical cues, delete the visitor recording, verify cleanup, and return to `IDLE` only after the room is clear.
- If recording deletion or state reset fails, lock out the next start and show an operator-visible fault. Never expose the previous visitor's voice to the next visitor.

## Visitor recording and privacy

- Display `CL-PRIVACY-SHORT-01` before recording with equally available `CL-CONSENT-YES-01` and `CL-CONSENT-NO-01` controls.
- Decline, silence, inaudible audio, microphone failure, missing authorization, or unavailable minor-consent handling routes to `CL-DYNAMIC-DREAM-00` without reducing the rest of the experience.
- Fill the controller name and contact fields in `CL-PRIVACY-FULL-01`; record the approved legal basis and venue process before public use.
- The named data controller and PDPA/legal reviewer must approve guardian/minor handling. If no operationally approved process exists, disable visitor recording and run the silent variant.
- Recordings remain local, are never uploaded or transmitted, and are deleted after the experience/reset. Startup cleanup must remove orphaned temporary recordings before accepting a visitor.

## Health, legal, and depiction review

- Health adviser approves every item marked “Health review required” in the copy lock.
- Legal/compliance or the competition authority reviews the educational depiction of the device, inhale, exhale, and vapor before C03–C07 are finalised.
- “Generic/unbranded” is a creative constraint, not proof of legal clearance.
- Pre-clearance C04 geometry tests use a neutral marker-sized object, not a rendered vape or imitation device.
- No shot may resemble product advertising, glamorize device design, or use a recognizable brand/livery.
- Physical exit signage must include `CL-QUITLINE-01` and the currently verified service-detail line `CL-QUITLINE-02`; reconfirm operating details and partner attribution immediately before print.

## Scene acceptance checklist

Every scene must pass:

- story purpose is legible without explanatory notes;
- first-person POV and camera height are consistent;
- hands, sleeve, device, friends, architecture, and light match the continuity bible;
- no alcohol or prohibited branding appears;
- exact text matches the copy-lock ID;
- Thai typography survives projector viewing;
- sound transition is intentional and no temporary audio remains;
- health and depiction approvals are recorded where applicable;
- selected Seedance equivalents and remaining budget are logged.
- privacy/recording path is valid, including the silent variant.

## Approval record

| Area | Owner / role | Name | Date | Status / notes |
|---|---|---|---|---|
| Creative/story | Creative lead |  |  |  |
| Health copy | Health/academic adviser |  |  |  |
| Device depiction | Legal/compliance or competition authority |  |  |  |
| Voice recording/privacy | Named data controller + PDPA/legal reviewer + venue |  |  |  |
| Edit/color/captions | Post-production lead |  |  |  |
| Projection/audio/telephone | Technical lead |  |  |  |
| Final exhibition acceptance | Creative + health + technical |  |  |  |

## Required verification before public exhibition

1. Validate the final content pack through the RE:Light engine.
2. Play the full experience from `IDLE` through reset at least three consecutive times.
3. Verify `r_frame_rate=24/1`, `nb_frames=2880`, and duration exactly 120.000 seconds with `ffprobe`; reject 23.976 exports.
4. Test on-time handset pickup, no-pickup fallback, and late pickup after fallback has begun.
5. Inspect projection top, middle, bottom, corners, Thai marks, and text safe areas from the visitor seat.
6. Confirm real-black handoff and physical-light timing.
7. Measure dropped frames, audio routing, and sync.
8. Test consent, decline, silence, inaudible input, microphone failure, minor/authorization handling, normal deletion, reset-failure lockout, and startup orphan cleanup.
9. Measure and record handset earpiece level; confirm it does not exceed the approved child/sensitive-listener ceiling.
10. Confirm exit quitline signage is installed, readable, and freshly verified.
11. Store the signed approvals beside the final content pack.

## Primary compliance and safety references

- [Thailand PDPC/GPPC — privacy notice example](https://gppc.pdpc.or.th/wp-content/uploads/GPPC-PDPC_Register_Privacy-Notice-%E0%B8%89%E0%B8%9A%E0%B8%B1%E0%B8%9A%E0%B8%A2%E0%B9%88%E0%B8%AD_05062024.pdf)
- [Thai Department of Disease Control — tobacco-control law resources](https://ddc.moph.go.th/law.php?law=2)
- [WHO–ITU safe-listening standard](https://www.who.int/publications/i/item/9789241515276)
- [National Thailand Quitline 1600 — official service page](https://www.thailandquitline.or.th/site/about/service)

These links support review; they do not replace advice from the named Thai legal/privacy reviewer or the competition authority.
