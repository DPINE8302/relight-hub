# Operational measurements

Counts describe observed anonymous browser events, not verified people. DNT, GPC and the statistics toggle disable collection. A first-party browser identifier lasts up to 90 days; sessions expire after 30 minutes without recorded activity. Education and GitHub Pages have separate origins and cannot guarantee one person across domains. Hub and its Skyfront share their origin's identity. Retention is 90 days. Dashboards require the shared signed operator session.

Source and Bangkok-time period filters apply in SQL. The previous period uses the same elapsed duration; today is incomplete. Missing history is not backfilled. Viewport categories describe CSS width, not device models or operating systems. Downloads are clicks, not installs; external chatbot activity and registrations are unavailable, not zero. Public education and wall participation need no account.

## Website health

Education and Hub observe generic runtime exceptions, unhandled promise rejections and resource failures. Education also observes wall request failures/timeouts. Only allowlisted codes are retained, capped at five observations per code per page opening. No error messages, stacks, resource URLs, wall answers or exact timing samples enter analytics. Errors that occur before the collector starts or when a browser terminates may not be observed. Counts are observations rather than crash rates.

`site_performance` samples completed document navigation once per document when collection is enabled. It sends only one bucket: below 1 second, 1–<3 seconds, 3–<6 seconds, or 6 seconds and above. These operational buckets are project choices, not performance scoring thresholds. Measurement is `PerformanceNavigationTiming.duration`, navigation start to `loadEventEnd`, as defined by [W3C Navigation Timing Level 2](https://www.w3.org/TR/navigation-timing-2/#relation-to-the-performanceentry-interface). Client-side route changes, time to game readiness, frame rate and Core Web Vitals are not inferred from it.

Health tables group page, code and viewport. Performance coverage uses the first performance event independently of errors. An empty filtered timing cohort displays no distribution; it never substitutes four measured zeroes. Bucket totals are collected samples, not the number of all visits. Error sessions are distinct within a row and must not be summed across rows as globally unique sessions.

## Skyfront

Fresh starts, checkpoint resumes, practice skips and practice completions remain separate. Player and Watch modes remain separate. Phase completion events report authored progression, not educational effectiveness. Reported exits cannot count every tab/OS termination. Recovery/error codes are bounded and contain no exception text. Watch mode does not earn personal records or medals.

No database migration, account import or production fixture is required for the new health event types: the existing event table has text types and sections. Validation accepts only the explicit new enums. QA uses local HTTP fixtures and read-only PostgreSQL/transaction-local CTEs; it does not write synthetic production telemetry.
