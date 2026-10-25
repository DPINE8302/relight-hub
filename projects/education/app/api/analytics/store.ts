import { createHmac } from "node:crypto";
import { postgres, fingerprint } from "../wall/store";
import type { Metric } from "./validation";
import { statisticsFromPool, type AnalyticsSource } from "./aggregates";
export { parseMetrics } from "./validation";

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
export async function statistics(days: number, source: AnalyticsSource = "all") {
  // Reading a dashboard must not create schema, migrate, or run retention jobs.
  return statisticsFromPool(await postgres(false), days, source);
}
