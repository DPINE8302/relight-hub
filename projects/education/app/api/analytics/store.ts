import { createHmac } from "node:crypto";
import { postgres, fingerprint } from "../wall/store";
import { metricTypes, type MetricType } from "../../analytics/events";

export type Metric = { id: string; visitor: string; session: string; page: string; type: MetricType; at: string; device: string; referrer: string; seconds: number; scene: number | null; choice: number | null; section: string };
let ready: Promise<void> | undefined;
async function db() {
  const pool = await postgres();
  if (!ready) ready = pool.query(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id UUID PRIMARY KEY, visitor TEXT NOT NULL, session TEXT NOT NULL,
      page TEXT NOT NULL, type TEXT NOT NULL, at TIMESTAMPTZ NOT NULL,
      device TEXT NOT NULL, referrer TEXT NOT NULL, seconds INTEGER NOT NULL DEFAULT 0,
      scene INTEGER, choice INTEGER, section TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS analytics_date ON analytics_events (at);
    CREATE INDEX IF NOT EXISTS analytics_session_type ON analytics_events (session, type, at);
    CREATE TABLE IF NOT EXISTS analytics_visitors (id TEXT PRIMARY KEY, first_seen TIMESTAMPTZ NOT NULL, last_seen TIMESTAMPTZ NOT NULL);
    CREATE TABLE IF NOT EXISTS analytics_limits (id TEXT PRIMARY KEY, minute BIGINT NOT NULL, count INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS analytics_maintenance (id INTEGER PRIMARY KEY, at TIMESTAMPTZ NOT NULL);
  `).then(() => undefined).catch(error => { ready = undefined; throw error; });
  await ready; return pool;
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const pages = ["/", "/play", "/after", "/wall", "/puff-world", "/light-trail"];
export function parseMetrics(value: unknown): Metric[] {
  if (!value || typeof value !== "object" || !("events" in value) || !Array.isArray(value.events) || value.events.length < 1 || value.events.length > 25) throw new Error("INVALID");
  return value.events.map((event: Record<string, unknown>) => {
    if (!event || typeof event !== "object" || ![event.id, event.visitor, event.session].every(v => typeof v === "string" && uuid.test(v)) || typeof event.page !== "string" || !pages.includes(event.page) || !metricTypes.includes(event.type as MetricType)) throw new Error("INVALID");
    const time = typeof event.at === "string" ? Date.parse(event.at) : NaN;
    if (!Number.isFinite(time) || time < Date.now() - 7 * 86400000 || time > Date.now() + 300000) throw new Error("INVALID");
    const seconds = event.type === "engagement" ? Number(event.seconds) : 0;
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 30) throw new Error("INVALID");
    if (["game_choice", "puff_clue"].includes(String(event.type)) && (!Number.isInteger(event.scene) || Number(event.scene) < 1 || Number(event.scene) > 3 || !Number.isInteger(event.choice) || Number(event.choice) < 0 || Number(event.choice) > 2)) throw new Error("INVALID");
    const referrer = typeof event.referrer === "string" && /^[a-z0-9.-]{1,120}$/i.test(event.referrer) ? event.referrer.toLowerCase() : "direct";
    return { id: String(event.id), visitor: String(event.visitor), session: String(event.session), page: event.page, type: event.type as MetricType, at: new Date(time).toISOString(), device: ["mobile", "tablet", "desktop"].includes(String(event.device)) ? String(event.device) : "unknown", referrer, seconds, scene: ["game_choice", "puff_clue"].includes(String(event.type)) ? Number(event.scene) : null, choice: ["game_choice", "puff_clue"].includes(String(event.type)) ? Number(event.choice) : null, section: event.type === "education_interaction" && ["aerosol", "nicotine", "body", "myths", "marketing"].includes(String(event.section)) ? String(event.section) : "" };
  });
}
export function visitorHash(value: string) {
  if (!process.env.WALL_ADMIN_TOKEN) throw new Error("CONFIGURATION_REQUIRED");
  return createHmac("sha256", process.env.WALL_ADMIN_TOKEN).update(`analytics:${value}`).digest("hex");
}
export async function recordMetrics(events: Metric[], request: Request) {
  const client = await (await db()).connect();
  try {
    await client.query("BEGIN");
    const minute = Math.floor(Date.now() / 60000);
    const limit = await client.query(`INSERT INTO analytics_limits (id,minute,count) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET minute=excluded.minute,count=CASE WHEN analytics_limits.minute=excluded.minute THEN analytics_limits.count+excluded.count ELSE excluded.count END RETURNING count`, [fingerprint(request, events[0].visitor), minute, events.length]);
    if (Number(limit.rows[0].count) > 2000) throw new Error("RATE_LIMIT");
    for (const event of events) {
      const visitor = visitorHash(event.visitor), session = visitorHash(event.session);
      const result = await client.query(`INSERT INTO analytics_events (id,visitor,session,page,type,at,device,referrer,seconds,scene,choice,section) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO NOTHING RETURNING id`, [event.id,visitor,session,event.page,event.type,event.at,event.device,event.referrer,event.seconds,event.scene,event.choice,event.section]);
      if (result.rowCount) await client.query(`INSERT INTO analytics_visitors (id,first_seen,last_seen) VALUES ($1,$2,$2) ON CONFLICT (id) DO UPDATE SET first_seen=LEAST(analytics_visitors.first_seen,excluded.first_seen),last_seen=GREATEST(analytics_visitors.last_seen,excluded.last_seen)`, [visitor,event.at]);
    }
    const cleanup = await client.query(`INSERT INTO analytics_maintenance (id,at) VALUES (1,NOW()) ON CONFLICT (id) DO UPDATE SET at=NOW() WHERE analytics_maintenance.at < NOW()-INTERVAL '1 day' RETURNING id`);
    if (cleanup.rowCount) {
      await client.query("DELETE FROM analytics_events WHERE at < NOW()-INTERVAL '90 days'");
      await client.query("DELETE FROM analytics_visitors WHERE last_seen < NOW()-INTERVAL '90 days'");
      await client.query("DELETE FROM analytics_limits WHERE minute < $1", [minute-2]);
    }
    await client.query("COMMIT");
  } catch(error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
export async function statistics(days: number) {
  const pool = await db();
  const start = `(date_trunc('day', NOW() AT TIME ZONE 'Asia/Bangkok') - ($1::int-1)*INTERVAL '1 day') AT TIME ZONE 'Asia/Bangkok'`;
  const selected = `at >= ${start} AND at <= NOW()+INTERVAL '5 minutes'`;
  const results = await Promise.all([
    pool.query(`SELECT COUNT(*) FILTER (WHERE type='page_view') AS views, COUNT(DISTINCT visitor) FILTER (WHERE type='page_view') AS visitors, COUNT(DISTINCT session) FILTER (WHERE type='page_view') AS visits, COUNT(DISTINCT session) FILTER (WHERE type='game_start') AS starts, COUNT(DISTINCT session) FILTER (WHERE type='game_complete') AS completions, COUNT(DISTINCT session) FILTER (WHERE type='game_complete' AND session IN (SELECT session FROM analytics_events WHERE type='game_start' AND ${selected})) AS finished_starts, COUNT(*) FILTER (WHERE type='wall_submit') AS wall_submissions, COUNT(DISTINCT session) FILTER (WHERE type='puff_start') AS puff_starts, COUNT(DISTINCT session) FILTER (WHERE type='puff_complete') AS puff_completions, COUNT(DISTINCT session) FILTER (WHERE type='inside_start') AS inside_starts, COUNT(DISTINCT session) FILTER (WHERE type='inside_complete') AS inside_completions, COALESCE(SUM(seconds),0) AS active_seconds FROM analytics_events WHERE ${selected}`, [days]),
    pool.query(`SELECT COUNT(DISTINCT e.session) AS returning_visits FROM analytics_events e JOIN analytics_visitors v ON v.id=e.visitor WHERE ${selected} AND e.type='page_view' AND v.first_seen < (SELECT MIN(s.at) FROM analytics_events s WHERE s.session=e.session)`, [days]),
    pool.query(`SELECT (at AT TIME ZONE 'Asia/Bangkok')::date::text AS day, COUNT(*) FILTER (WHERE type='page_view') AS views, COUNT(DISTINCT visitor) FILTER (WHERE type='page_view') AS visitors FROM analytics_events WHERE ${selected} GROUP BY day ORDER BY day`, [days]),
    pool.query(`SELECT page,COUNT(*) FILTER (WHERE type='page_view') AS views, COUNT(DISTINCT visitor) FILTER (WHERE type='page_view') AS visitors, COUNT(DISTINCT session) FILTER (WHERE type='inside_start') AS inside_starts, COUNT(DISTINCT session) FILTER (WHERE type='inside_complete') AS inside_completions, COALESCE(SUM(seconds),0) AS active_seconds FROM analytics_events WHERE ${selected} GROUP BY page ORDER BY views DESC`, [days]),
    pool.query(`SELECT device,COUNT(*) AS views FROM analytics_events WHERE ${selected} AND type='page_view' GROUP BY device ORDER BY views DESC`, [days]),
    pool.query(`SELECT referrer,COUNT(*) AS visits FROM (SELECT DISTINCT ON (session) session,referrer FROM analytics_events WHERE ${selected} AND type='page_view' ORDER BY session,at,id) landings GROUP BY referrer ORDER BY visits DESC LIMIT 12`, [days]),
    pool.query(`SELECT section,COUNT(*) AS interactions FROM analytics_events WHERE ${selected} AND type='education_interaction' GROUP BY section ORDER BY interactions DESC`, [days]),
    pool.query(`SELECT scene,choice,COUNT(DISTINCT session) AS visits FROM (SELECT DISTINCT ON (session,scene) session,scene,choice FROM analytics_events WHERE ${selected} AND type='game_choice' ORDER BY session,scene,at DESC,id DESC) choices GROUP BY scene,choice ORDER BY scene,choice`, [days]),
    pool.query(`SELECT COUNT(DISTINCT visitor) AS active FROM analytics_events WHERE at >= NOW()-INTERVAL '5 minutes' AND at <= NOW()`),
    pool.query(`SELECT MIN(at) AS first_event FROM analytics_events`),
  ]);
  const totals = Object.fromEntries(Object.entries(results[0].rows[0]).map(([key,value]) => [key,Number(value)]));
  return { days, timezone:"Asia/Bangkok", totals:{...totals, returning_visits:Number(results[1].rows[0].returning_visits), active:Number(results[8].rows[0].active)}, daily:results[2].rows, pages:results[3].rows, devices:results[4].rows, referrers:results[5].rows, interactions:results[6].rows, choices:results[7].rows, firstEvent:results[9].rows[0].first_event, updatedAt:new Date().toISOString() };
}
