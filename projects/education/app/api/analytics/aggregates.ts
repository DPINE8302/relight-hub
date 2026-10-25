// All output is aggregate data. This function can also run on an explicitly
// read-only connection for production reconciliation without schema setup.
type Queryable = { query(sql: string, parameters?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> };
export type AnalyticsSource = "all" | "education" | "skyfront" | "hub";

export async function statisticsFromPool(pool: Queryable, days: number, source: AnalyticsSource = "all") {
  const start = `(date_trunc('day', NOW() AT TIME ZONE 'Asia/Bangkok') - ($1::int-1)*INTERVAL '1 day') AT TIME ZONE 'Asia/Bangkok'`;
  const scope = `($2::text='all' OR ($2='education' AND page NOT IN ('/skyfront','/hub')) OR ($2='skyfront' AND page='/skyfront') OR ($2='hub' AND page='/hub'))`;
  const selected = `at >= ${start} AND at <= NOW() AND ${scope}`;
  const previous = `at >= (${start}) - $1::int*INTERVAL '1 day' AND at <= NOW() - $1::int*INTERVAL '1 day' AND ${scope}`;
  const parameters = [days, source];
  const summary = (where: string) => `WITH selected AS (SELECT * FROM analytics_events WHERE ${where}) SELECT
    COUNT(*) FILTER (WHERE type='page_view') AS views,
    COUNT(DISTINCT visitor) FILTER (WHERE type='page_view') AS visitors,
    COUNT(DISTINCT session) FILTER (WHERE type='page_view') AS visits,
    COUNT(DISTINCT session) FILTER (WHERE type='game_start') AS starts,
    COUNT(DISTINCT session) FILTER (WHERE type='game_complete') AS completions,
    COUNT(DISTINCT session) FILTER (WHERE type='game_complete' AND EXISTS (SELECT 1 FROM selected s WHERE s.type='game_start' AND s.session=e.session AND s.at<=e.at)) AS finished_starts,
    COUNT(*) FILTER (WHERE type='site_error') AS site_error_events,
    COUNT(DISTINCT session) FILTER (WHERE type='site_error') AS site_error_sessions,
    COUNT(*) FILTER (WHERE type='site_performance') AS load_samples,
    COUNT(*) FILTER (WHERE type='wall_submit') AS wall_submissions,
    COUNT(DISTINCT session) FILTER (WHERE type='puff_start' AND page='/light-trail') AS puff_starts,
    COUNT(DISTINCT session) FILTER (WHERE type='puff_complete' AND page='/light-trail') AS puff_completions,
    COUNT(DISTINCT session) FILTER (WHERE type='puff_start' AND page<>'/light-trail') AS legacy_puff_starts,
    COUNT(DISTINCT session) FILTER (WHERE type='inside_start' AND page='/puff-world') AS inside_starts,
    COUNT(DISTINCT session) FILTER (WHERE type='inside_complete' AND page='/puff-world') AS inside_completions,
    COALESCE(SUM(seconds),0) AS active_seconds FROM selected e`;
  const results = await Promise.all([
    pool.query(summary(selected), parameters),
    pool.query(`SELECT COUNT(DISTINCT e.session) AS returning_visits FROM analytics_events e JOIN analytics_visitors v ON v.id=e.visitor WHERE ${selected} AND e.type='page_view' AND v.first_seen < (SELECT MIN(s.at) FROM analytics_events s WHERE s.session=e.session)`, parameters),
    pool.query(`SELECT (at AT TIME ZONE 'Asia/Bangkok')::date::text AS day, COUNT(*) FILTER (WHERE type='page_view') AS views, COUNT(DISTINCT visitor) FILTER (WHERE type='page_view') AS visitors FROM analytics_events WHERE ${selected} GROUP BY day ORDER BY day`, parameters),
    pool.query(`SELECT page,COUNT(*) FILTER (WHERE type='page_view') AS views, COUNT(DISTINCT visitor) FILTER (WHERE type='page_view') AS visitors, COUNT(DISTINCT session) FILTER (WHERE type='inside_start') AS inside_starts, COUNT(DISTINCT session) FILTER (WHERE type='inside_complete') AS inside_completions, COALESCE(SUM(seconds),0) AS active_seconds FROM analytics_events WHERE ${selected} GROUP BY page ORDER BY views DESC`, parameters),
    pool.query(`SELECT device,COUNT(*) AS views FROM analytics_events WHERE ${selected} AND type='page_view' GROUP BY device ORDER BY views DESC`, parameters),
    pool.query(`SELECT referrer,COUNT(*) AS visits FROM (SELECT DISTINCT ON (session) session,referrer FROM analytics_events WHERE ${selected} AND type='page_view' ORDER BY session,at,id) landings GROUP BY referrer ORDER BY visits DESC LIMIT 12`, parameters),
    pool.query(`SELECT section,COUNT(*) AS interactions FROM analytics_events WHERE ${selected} AND type='education_interaction' GROUP BY section ORDER BY interactions DESC`, parameters),
    pool.query(`SELECT scene,choice,COUNT(DISTINCT session) AS visits FROM (SELECT DISTINCT ON (session,scene) session,scene,choice FROM analytics_events WHERE ${selected} AND type='game_choice' ORDER BY session,scene,at DESC,id DESC) choices GROUP BY scene,choice ORDER BY scene,choice`, parameters),
    pool.query(`SELECT COUNT(DISTINCT visitor) AS active FROM analytics_events WHERE at >= NOW()-INTERVAL '5 minutes' AND at <= NOW() AND ${scope.replaceAll("$2", "$1")}`, [source]),
    pool.query(`SELECT MIN(at) AS first_event FROM analytics_events WHERE ${scope.replaceAll("$2", "$1")}`, [source]),
    pool.query(summary(previous), parameters),
    pool.query(`SELECT ${start} AS start, NOW() AS end, (${start})-$1::int*INTERVAL '1 day' AS previous_start, NOW()-$1::int*INTERVAL '1 day' AS previous_end`, [days]),
    pool.query(`SELECT section AS mode, COUNT(DISTINCT session) FILTER (WHERE type='skyfront_start') AS starts, COUNT(DISTINCT session) FILTER (WHERE type='skyfront_resume') AS resumes, COUNT(DISTINCT session) FILTER (WHERE type='skyfront_tutorial_complete') AS tutorial_completions, COUNT(DISTINCT session) FILTER (WHERE type='skyfront_tutorial_skip') AS tutorial_skips, COUNT(DISTINCT session) FILTER (WHERE type='skyfront_campaign_complete') AS campaign_completions, COUNT(DISTINCT session) FILTER (WHERE type='skyfront_exit') AS observed_exits FROM analytics_events WHERE ${selected} AND page='/skyfront' AND type LIKE 'skyfront_%' AND section IN ('player','watch') GROUP BY section ORDER BY section`, parameters),
    pool.query(`SELECT type, scene, section AS mode, device, COUNT(DISTINCT session) AS sessions FROM analytics_events WHERE ${selected} AND type IN ('skyfront_tutorial_step','skyfront_mission_start','skyfront_mission_complete') GROUP BY type,scene,section,device ORDER BY type,scene,section,device`, parameters),
    pool.query(`SELECT section AS code, device, COUNT(*) AS events,COUNT(DISTINCT session) AS sessions FROM analytics_events WHERE ${selected} AND type='skyfront_error' GROUP BY section,device ORDER BY events DESC`, parameters),
    pool.query(`SELECT MIN(at) AS first_event FROM analytics_events WHERE page='/skyfront' AND type LIKE 'skyfront_%'`),
    pool.query(`SELECT type,section AS destination,COUNT(*) AS clicks,COUNT(DISTINCT session) AS sessions FROM analytics_events WHERE ${selected} AND page='/hub' AND type IN ('hub_launch','hub_download') GROUP BY type,section ORDER BY type,clicks DESC,section`, parameters),
    pool.query(`SELECT MIN(at) AS first_event FROM analytics_events WHERE page='/hub'`),
    pool.query(`SELECT type,section AS code,page,device,COUNT(*) AS events,COUNT(DISTINCT session) AS sessions FROM analytics_events WHERE ${selected} AND type IN ('site_error','site_performance') GROUP BY type,section,page,device ORDER BY type,page,device,section`, parameters),
    pool.query(`SELECT MIN(at) AS first_event, MIN(at) FILTER (WHERE type='site_performance') AS first_performance_event, MIN(at) FILTER (WHERE type='site_error') AS first_error_event FROM analytics_events WHERE type IN ('site_error','site_performance') AND ${scope.replaceAll("$2", "$1")}`, [source]),
  ]);
  const numeric = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).map(([key,value]) => [key,Number(value)]));
  return {
    days, source, timezone:"Asia/Bangkok",
    totals:{...numeric(results[0].rows[0]), returning_visits:Number(results[1].rows[0].returning_visits), active:Number(results[8].rows[0].active)},
    daily:results[2].rows, pages:results[3].rows, devices:results[4].rows, referrers:results[5].rows, interactions:results[6].rows, choices:results[7].rows,
    firstEvent:results[9].rows[0].first_event, previousTotals:numeric(results[10].rows[0]), period:results[11].rows[0],
    skyfront:{funnel:results[12].rows, stages:results[13].rows, errors:results[14].rows, firstEvent:results[15].rows[0].first_event},
    hub:{referrals:results[16].rows, firstEvent:results[17].rows[0].first_event},
    health:{observations:results[18].rows, firstEvent:results[19].rows[0].first_event, performanceFirstEvent:results[19].rows[0].first_performance_event, errorFirstEvent:results[19].rows[0].first_error_event},
    coverage:{ education:"collected", skyfront:results[15].rows[0].first_event ? "collected" : "awaiting-events", hub:results[17].rows[0].first_event ? "collected" : "awaiting-events", registrations:"not-applicable", chatbot:"external-service-unavailable", windows:"not-instrumented", performance:results[19].rows[0].first_performance_event ? "collected" : "awaiting-events" },
    updatedAt:new Date().toISOString(),
  };
}
