# Identity and analytics contract — 24 October 2026

## Verified system boundaries

Education, its scenario game, Light Trail, Puff World and the Digital Wall are anonymous public experiences. They do not have visitor accounts. Wall contribution identity is a random browser token, not an authenticated person. Skyfront is also anonymous. The Hub is a static GitHub Pages directory.

The chatbot link opens Thailand Quitline's **external AI QuitBot** at `https://quitbot.thailandquitline.or.th/`. RE;light does not own its account database, login flow or conversation records. No supported identity federation or account migration is present in this repository. Adding a RE;light account would not remove an external provider's account requirement. Do not collect, proxy or copy QuitBot credentials.

The unused historical `app/chatgpt-auth.ts` proxy-header scaffold was removed after verifying no active route imported it. The previous file is backed up in the ecosystem maintenance directory. Untrusted identity headers grant no RE;light permission. The only existing private role is administrator, authorized by the server-only `WALL_ADMIN_TOKEN`.

## One operator sign-in

`/analytics` and `/wall/manage` now share `AdminAccess` and `/api/admin/session`. A successful login clears the entered key from component state and creates a signed, random, host-only, HttpOnly, SameSite=Strict cookie with an eight-hour absolute lifetime. HTTPS uses a `__Host-` cookie and Secure. Local HTTP uses a distinct development cookie name. No password or bearer key is written to localStorage/sessionStorage or returned by the API. Session responses and private aggregates are `no-store`.

The signing scope is versioned and distinct from analytics hashing. Expiry and HMAC are validated with timing-safe comparison. Rotating the existing server key invalidates issued sessions. Cookie-authenticated writes require the same Origin and reject cross-site fetches. Sign-in/sign-out always require same Origin. Browser pages recheck on focus and use BroadcastChannel to update other tabs after sign-in/out. Logout removes the browser cookie. Sessions are stateless: revoking a copied session before its expiry requires rotating the server key; there is no per-operator identity or server-side session registry.

Bearer authorization remains supported for existing operational scripts. A provided invalid bearer key never falls back to a valid cookie. Ordinary visitors cannot fetch aggregate data or mutate wall moderation. Private pages are excluded from collection and offline caching; moderation and analytics have noindex metadata.

Login has a small per-instance failed-attempt brake (eight failures per fifteen minutes). This is not a distributed rate limiter. Keep the existing operator key high entropy. There is no new database, account table, provider, migration, or user-data transformation.

## Read and write separation

`GET /api/analytics?days=1|7|30|90&source=all|education|skyfront|hub` authenticates on the server and runs SELECT-only aggregation. Reading a dashboard does not initialize schema, run retention, migrate or mutate wall data. A missing/unavailable database returns an explicit 503, never invented zero totals.

The ingestion path retains the existing append/deduplication and maintenance behavior. A batch contains 1–25 events, UUIDv4 event/visitor/session IDs, timestamps within seven days in the past/five minutes in the future, an allowlisted route/type and bounded coarse fields. Only engagement may retain 0–30 visible seconds. Unknown free-form fields are discarded. Future-clock events are accepted within tolerance but excluded from reports until their timestamp arrives. Event IDs deduplicate retries; visitor/session IDs are HMAC-hashed before storage. Existing 90-day retention is unchanged.

## Skyfront event contract

Page is `/skyfront`. Events are:

- `page_view`, `engagement`;
- `skyfront_start`, `skyfront_resume`, `skyfront_tutorial_step`, `skyfront_tutorial_complete`, `skyfront_tutorial_skip`;
- `skyfront_mission_start`, `skyfront_mission_complete`, `skyfront_campaign_complete`;
- `skyfront_exit`, `skyfront_error`.

All Skyfront-specific non-error events use `section: player|watch`. Tutorial-step reports **reaching** a step, not passing it. Tutorial skip is distinct from completion; restoring a checkpoint is distinct from a fresh start. Tutorial/mission/exit events describe the main campaign, excluding unrelated side-mode practice. Tutorial-step and mission-start/complete events carry integer `scene: 0..20`; the dashboard presents these as 1-based step numbers. Error/recovery `section` is exactly one of `webgl-context-lost`, `runtime-error`, `frame-error`, `boot-error`, `startup-timeout`, `bundle-load`, `unhandled-rejection`, `page-restored`. No exception message, stack, URL query, device fingerprint, input stream, chat or wall text is accepted.

Cross-origin ingestion permits only `https://relight-fighter.vercel.app` (only `/skyfront`) and `https://dpine8302.github.io` (`/skyfront` and `/hub`). The GitHub origin can batch both sources; the game origin cannot submit Hub events. Preflight permits POST/OPTIONS and Content-Type; no credentials are allowed or required. Private GET responses do not expose CORS access. Same-origin Education collection continues to work. Public event ingestion is observational telemetry, not an authenticated security audit log.

Public storage is scoped to origin. Hub and the GitHub Pages Skyfront build share their random browser/session IDs and privacy preference on `https://dpine8302.github.io`; Education and the Vercel-hosted Skyfront have independent storage. The same privacy-key convention does not synchronize opt-out across different origins. Education's `/privacy`, the Hub switch and Skyfront Settings control their own origin. All honor DNT/GPC. This is anonymous browser continuity, not account federation or verified cross-site unique people. No historical Skyfront or Hub data is invented.

## Definitions and dashboard behavior

- Views are `page_view` events; browser and session totals count distinct hashed IDs among page views.
- Sessions restart after thirty minutes inactivity. Counts are approximate, not verified visitors or participants.
- Visible time is bounded heartbeat time, not a performance benchmark or proof of attention.
- Periods start at Bangkok midnight on the first selected day and end now. The comparison is shifted by the same number of calendar days and ends at the matching elapsed time. Exact start/end timestamps appear in the UI and CSV. Percent changes are suppressed when the retained event history does not cover the comparison start, or the previous denominator is zero.
- The earliest event is the earliest **retained** record, not guaranteed installation time. Retention and opt-out limit coverage.
- Scenario completion rate counts sessions with a start at/before a completion, both inside the selected range. A zero start denominator displays unavailable rather than a fabricated 0% rate.
- Starts/completions for other games and Skyfront tables are separate session counts; they are not automatically the same cohort. Repeated plays inside one session do not create another session.
- Light Trail totals now require `/light-trail`. Older `puff_start` events at `/puff-world` remain in storage and are reported separately as legacy events, preventing historical conflation with Light Trail.
- Skyfront player and watch-assisted runs remain separate. The run is marked watch-assisted once autoplay has been used and keeps that provenance on restore; a session can appear in both mode groups across plays. Starts, resumes, skips and completions are independent session counts and no Skyfront completion rate is inferred. Steps/missions and bounded errors can be drilled down by viewport class. Viewport class is not a verified physical device or browser family.
- Observed exits are best-effort. A killed process may never report an exit or error; missing reports do not prove stability or completion.
- No registrations, chatbot conversation counts, Windows usage or performance measurements are fabricated. Their unavailable/uninstrumented states are explicit. Hub traffic/referral collection is supported and displays awaiting-events until its first recorded event; clicks never become fabricated destination sessions or application installs.

## Release and rollback

Deploy the Education API/dashboard before the instrumented Hub and Skyfront builds. Confirm preflight from the two exact production origins and verify a controlled consented event after deployment. No production event was created by this implementation's QA. Existing source/data can be retained as-is. Reverting these source changes restores the bearer-only admin UI; existing public wall/analytics tables and records remain compatible. Rotating `WALL_ADMIN_TOKEN` also changes future analytics hashes, so do not rotate it as a routine deploy step.

## Verification receipt

- Twelve auth/validation unit tests pass, covering signature tampering/expiry/key rotation, secure cookie flags, forged headers, CSRF, Next's localhost authority behavior, shared session responses/logout, retry limits, event bounds, field stripping and compatibility.
- Actual local HTTP checks passed for private endpoints, shared cookie authorization, rejected foreign-origin moderation, exact CORS origins, DNT and cross-site payload scope.
- Existing clear/restore regression passed against a fresh, dedicated disposable SQLite database. That integration test assumes a fresh database; reusing its prior fixtures invalidates its exact-count assertions.
- Real PostgreSQL aggregates reconciled independently inside `REPEATABLE READ READ ONLY` for all/Education/Skyfront seven-day filters and a thirty-day legacy-game check. No production schema or data writes, backups of user records, or migrations were performed.
- Chromium desktop, Chromium mobile emulation and Playwright WebKit mobile emulation passed shared login/navigation/logout, cross-tab logout, honest database-unavailable rendering and overflow/page-error checks. These do not constitute physical iPhone or Android testing.
- Detailed QA evidence is outside the publishable repository in `maintenance/ecosystem-2026-10-24/qa/backend/` at the ecosystem root.


## Hub event contract

Page `/hub` accepts `page_view`, `engagement`, `hub_launch` and `hub_download`. Launch section is exactly one of `education`, `skyfront`, `puff`, `scenario`, `light-trail`, `wall`, `help`; download section is exactly `mac`, `win-x64` or `win-arm64`. Launch cannot use a download destination, and download cannot use a launch destination. Unknown fields and arbitrary URL strings are not retained. Hub events cannot be submitted under an Education or Skyfront page.

The Hub source filter excludes Education/Skyfront records. Education excludes both Hub and Skyfront. All includes all supported sources and deduplicates shared hashed visitor/session IDs when supplied by the same origin; it does not join independent origins into people. The referrals table reports **event clicks** and **distinct sessions with a click**, separated by destination/action. A launch click does not establish a successful load or game start; a download click does not establish download completion, installation or application use. QuitBot help referral clicks are not conversations. No cross-origin conversion or attribution rate is inferred.

Hub aggregation and source isolation were checked with the actual generated PostgreSQL SQL against literal CTE fixtures under READ ONLY. Duplicate clicks remain separate actions while distinct session counts deduplicate. The shared-origin visitor/session case deduplicates across Hub and GitHub Skyfront in All. No fixture or historical data was inserted.
