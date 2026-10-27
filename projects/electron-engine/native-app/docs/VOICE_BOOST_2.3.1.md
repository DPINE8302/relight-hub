# Dream recording boost — Mac 2.3.1

Film 02 now defaults to a **400× maximum** gain for its dream voice cue. This is a sample amplitude gain limit, not a promise of 400 times perceived loudness. The existing author-selected voice level is preserved.

Quiet takes receive up to the selected gain; stronger takes receive less so PCM peaks stay at or below 0.9 before the existing creative effects and output dynamics processor. One constant gain preserves dynamics and matches across repeats and pause/resume. Film audio, Ainsley narration and speaker test tone are unaffected.

**Edit → Voice & effects → Dream boost limit** adjusts 1–400×. The optional project field `gainBoost` defaults to 1× for legacy projects and rejects invalid/nonfinite/out-of-range values. The capture acceptance floor accounts for cues that can use the current take, ending at the next capture; test capture uses its selected audition cue. Digital silence and nonfinite capture data still fail.

Regression and offline audio checks demonstrate exact 400× scaling for a quiet synthetic take, linear peak-limited scaling for a strong take, sample-continuous resume, identical repeats, boosted capture acceptance with silence rejection, effect-chain output bounds and selection of the applicable capture gain. Existing device, capture, import, playback and project tests remain covered.

Three context-isolated, trace-unverified review cycles were performed. The final narrow finding about an interrupted earlier cue was fixed by excluding earlier/already-fired cues from capture acceptance, with regression checks and direct source inspection afterward. No fourth review was requested.

Recording remains at 01:00:18:20 and dream playback at 01:04:25:20. Participant voice is temporary and is not included in project files, public downloads or source. Movie and narrator media are unchanged.
