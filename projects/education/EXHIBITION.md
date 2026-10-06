# RE;light learning website

The website is a standalone education resource: usable in classrooms, at home, or at the exhibition. Room attendance is optional.

## Distinct activities

- Physical cloth/Post-it wall: one future question, **มีอะไรในอนาคตที่คุณอยากรักษาไว้ให้ตัวเอง?** This is an exhibition activity and personal reflection.
- Website: existing sourced education, a three-situation game, and a shared response wall asking **ถ้าเพื่อนชวนสูบบุหรี่ไฟฟ้า คุณจะตอบว่าอะไร?** This is learning, practice, and community responses from anywhere.
- The website does not instruct visitors to repeat their online response on the physical wall.

## Routes

- `/#community`: shared response section on the main website;
- `/`: education and shared response section; inclusive homepage invitation.
- `/play`: standalone three-situation game.
- `/after`: optional after-film introduction to the same game.
- `/wall`: shared responses, suitable for individual use or display.
- `/wall/manage`: moderator UI; hiding, clearing, and restoring require the server secret.
- `/qr/education.png` and `.svg`: QR for `/play`.
- `/qr/after-film.png` and `.svg`: QR for `/after`.
- `/qr/responses.png` and `.svg`: QR for `/wall`.

QR files target `https://relight-web-two.vercel.app`. The routes are published at that address. The film controller's physical exit display is a separate integration and has not been changed by this website work.

## Offline behavior

On a successful first online visit, the production service worker downloads the education page, game, after-film entry, wall shell, fonts, and relevant application assets. The readiness message confirms installation; an initial visit without network cannot install the site. Service workers require HTTPS or localhost.

Once prepared, the content, game interactions, full-page navigation, and reloads work offline. External source/help websites and shared-wall refresh/submission require network. A draft is saved on the device and survives a reload; it is sent only when the visitor clicks submit online. Last wall data is labelled as cached when disconnected. No automatic publication of draft text.

Normal and after-film entry use the same learning content; the difference is the introduction. No account, personal name, vaping history, or timer is required.

## Shared wall

Postgres is the production source of truth; the UI refreshes every 15 seconds while visible and when a connection returns. Duplicate answers are normalized for Unicode, case, whitespace, and leading/trailing spaces. Meaning-equivalent but differently worded answers remain separate. The wall displays plain words without sticky-note cards or visible per-word badges. Font size grows logarithmically with contribution count, from 20px to a maximum of 64px. Exact counts remain available to assistive technology and in moderation.

One anonymous device token + question identifies a contribution. Retrying updates that contribution instead of adding a new vote. This is a contribution count, not verified unique-person or learning measurement. Clearing browser storage/new browsers can create additional identifiers; do not present this as a representative scientific poll.

The typed text appears as escaped React text, not HTML. The API validates length/input, rejects foreign-origin writes, uses parameterized SQL, enforces a submission limit, and offers protected moderator hiding. Hidden normalized text stays hidden on later submissions. Clearing the wall archives contributions using the hidden flag; restoring makes cleared contributions visible again while moderation blocks remain in force. A new submission from an existing participant becomes visible after a clear. The bulk-clear UI requires confirmation. Bulk moderation integration checks in tests/wall-clear-api.test.mjs run only against a disposable localhost wall without DATABASE_URL. No model-generated answers or invented participation are seeded.

## Configuration and development

- `DATABASE_URL`: dedicated Postgres connection, server-only.
- `WALL_ADMIN_TOKEN`: moderator secret, server-only. Set on Vercel and in local `.env.local`; never commit or publish it.
- `WALL_LOCAL_DB`: optional local persistent SQLite folder for production-mode development without a cloud database. This fallback is disabled on Vercel so missing cloud configuration cannot silently create ephemeral data.

The dedicated Neon resource is `relight-community-wall`, selected on the Free plan, Singapore region. It is connected to the existing `relight-web` Vercel project. No paid plan was selected.

Run `npx next dev`, `npm run lint`, `npx tsc --noEmit`, `npm run build:vercel`, then `npx next start`. `npm test` verifies server rendering through the same Next.js runtime used on Vercel. `node --test tests/wall-api.test.mjs` exercises a running server; `WALL_TEST_URL` selects another origin and `WALL_ADMIN_TOKEN` enables the authenticated moderation assertion. Test messages are clearly marked `QA <uuid>` and must be removed after verification.

`npm run qr` regenerates QR artifacts. The deployment build derives the service-worker cache version from application source, allowing cache updates after later edits.

## Private usage statistics

`/analytics` is the admin dashboard; `/api/analytics` returns statistics only with the existing `WALL_ADMIN_TOKEN` as a bearer key. Use the same moderator key stored in ignored `.env.local` and the Vercel server environment. The key stays in memory while viewing the dashboard; it is not saved in the browser. The public navigation does not link to the dashboard.

Statistics start when this feature is deployed. They include page views, approximate unique browser identifiers, 30-minute inactivity sessions, returning sessions, recently active browsers, visible-page time, pages, screen categories, referring domains, game starts/completions, last fictional game choices per scene/session, education interactions, and successful wall submission actions. Game completion rate uses sessions that both started and completed within the selected reporting period; it is not a measurement of learning improvement. Wall submission actions include edits and are different from the wall's contribution count.

The dashboard offers today/7/30/90-day ranges, uses Asia/Bangkok dates, and exports aggregate CSV. Its daily chart switches between page views and approximate browser identifiers, with pointer and keyboard date inspection and an exact-value table. Sparse periods use columns; longer periods use a line. Days before the first recorded event are excluded, and missing days within the recorded period display zero. Additional charts show page rankings, separate starts/completions for each game, screen-size composition, referring domains, and learning interactions. Detailed metrics remain expandable. Daily unique totals must not be added together to infer period-wide unique people. Anonymous browser identifiers and session identifiers are HMAC-hashed on the server; event UUIDs prevent retries from being counted twice. Changing the moderator secret also changes identifier hashes. Names, raw visitor IP addresses, full referrer URLs, typed wall answers, and precise locations are not stored in analytics. Screen category describes viewport size, not a verified physical device.

Raw event data and inactive visitor hashes are removed after 90 days by maintenance on a subsequent event ingestion. Visible-page time is approximate, capped heartbeat intervals exclude background tabs, and detected bots are ignored. Browser blocking, multiple devices, cleared storage, or undetected automation can affect counts. Admin/moderation/privacy pages are excluded. This is descriptive usage telemetry, not verified unique people or representative research sampling.

Analytics never block the learning activities. Up to 200 pending events are retained locally for at most seven days and retried online. The server validates them and rejects implausible timestamps, unknown routes, oversized batches, and invalid durations. Storage loss or prolonged offline use can lose statistics. Visitors can disable collection at `/privacy`, and both the collector and server respect Do Not Track/Global Privacy Control. The public site has a small privacy link; there is no public statistics counter.

Verify the running API using `node --env-file=.env.local --test tests/analytics-api.test.mjs`. `ANALYTICS_TEST_URL` selects production. Tests remove their own identifiable QA fixtures afterward.

## Health content

The new game uses [WHO e-cigarette facts](https://www.who.int/news-room/questions-and-answers/item/tobacco-e-cigarettes) for the aerosol scene and [official Thai Quitline services](https://www.thailandquitline.or.th/site/about/service) for help access. Checked 4 October 2026. The fictional situations are educational prompts, not official assessment questions or medical predictions. Existing education/legal copy is retained; this change does not represent a full re-audit of every older claim.
