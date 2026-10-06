import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";
import { createRequire } from "node:module";
import type { DatabaseSync } from "node:sqlite";
import { answerKey, normalizeAnswer, type PromptId, type WallData } from "../../wall/prompts";

const schema = `CREATE TABLE IF NOT EXISTS wall_answers (
  participant TEXT NOT NULL,
  prompt TEXT NOT NULL,
  text TEXT NOT NULL,
  normalized TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (participant, prompt)
);
CREATE TABLE IF NOT EXISTS wall_limits (
  fingerprint TEXT PRIMARY KEY,
  minute BIGINT NOT NULL,
  count INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS wall_hidden (
  prompt TEXT NOT NULL,
  normalized TEXT NOT NULL,
  PRIMARY KEY (prompt, normalized)
);
CREATE INDEX IF NOT EXISTS wall_prompt_text ON wall_answers (prompt, normalized);`;

let pool: Pool | undefined;
let ready: Promise<void> | undefined;
let sqlite: DatabaseSync | undefined;

function localDb() {
  if (process.env.VERCEL || process.env.NODE_ENV === "production" && !process.env.WALL_LOCAL_DB) {
    throw new Error("WALL_DATABASE_REQUIRED");
  }
  if (!sqlite) {
    const folder = process.env.WALL_LOCAL_DB || join(process.cwd(), ".wall-data");
    mkdirSync(folder, { recursive: true });
    const { DatabaseSync: LocalDatabase } = createRequire(join(process.cwd(), "package.json"))("node:sqlite") as typeof import("node:sqlite");
    sqlite = new LocalDatabase(join(folder, "wall.sqlite"));
    sqlite.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
    sqlite.exec(schema);
  }
  return sqlite;
}

export async function postgres() {
  if (!pool) {
    const connection = new URL(process.env.DATABASE_URL!);
    connection.searchParams.set("sslmode", "verify-full");
    pool = new Pool({ connectionString: connection.toString(), max: 3, connectionTimeoutMillis: 8000 });
  }
  if (!ready) ready = pool.query(schema).then(() => undefined).catch((error) => { ready = undefined; throw error; });
  await ready;
  return pool;
}

export async function readWall(prompt: PromptId): Promise<WallData> {
  const query = `SELECT MIN(text) AS text, COUNT(*) AS count FROM wall_answers a WHERE prompt = $1 AND hidden = 0 AND NOT EXISTS (SELECT 1 FROM wall_hidden h WHERE h.prompt = a.prompt AND h.normalized = a.normalized) GROUP BY normalized ORDER BY count DESC, normalized ASC`;
  const groups = process.env.DATABASE_URL
    ? (await (await postgres()).query(query, [prompt])).rows
    : localDb().prepare(query.replace(/\$\d+/g, "?")).all(prompt);
  const normalized = groups.map((group) => ({ text: String(group.text), count: Number(group.count) }));
  return { groups: normalized, total: normalized.reduce((sum, group) => sum + group.count, 0), updatedAt: new Date().toISOString() };
}

export async function writeWall(prompt: PromptId, text: string, participant: string, fingerprint: string) {
  const minute = Math.floor(Date.now() / 60000);
  const clean = normalizeAnswer(text);
  const key = answerKey(text);
  const rate = `INSERT INTO wall_limits (fingerprint, minute, count) VALUES ($1, $2, 1)
    ON CONFLICT (fingerprint) DO UPDATE SET minute = excluded.minute,
    count = CASE WHEN wall_limits.minute = excluded.minute THEN wall_limits.count + 1 ELSE 1 END RETURNING count`;
  const insert = `INSERT INTO wall_answers (participant, prompt, text, normalized) VALUES ($1, $2, $3, $4)
    ON CONFLICT (participant, prompt) DO UPDATE SET text = excluded.text, normalized = excluded.normalized, hidden = 0`;
  // Same participant + prompt updates their contribution instead of inflating the poll on retries.
  if (process.env.DATABASE_URL) {
    const client = await (await postgres()).connect();
    try {
      await client.query("BEGIN");
      const limited = await client.query(rate, [fingerprint, minute]);
      if (Number(limited.rows[0].count) > 120) throw new Error("RATE_LIMIT");
      await client.query(insert, [participant, prompt, clean, key]);
      await client.query("DELETE FROM wall_limits WHERE minute < $1", [minute - 2]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  } else {
    const db = localDb();
    db.exec("BEGIN IMMEDIATE");
    try {
      const limited = db.prepare(rate.replace(/\$\d+/g, "?")).get(fingerprint, minute);
      if (Number(limited?.count) > 120) throw new Error("RATE_LIMIT");
      db.prepare(insert.replace(/\$\d+/g, "?")).run(participant, prompt, clean, key);
      db.prepare("DELETE FROM wall_limits WHERE minute < ?").run(minute - 2);
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  }
}

export function fingerprint(request: Request, participant: string) {
  // Store a short-lived salted hash, never the raw address.
  const ip = process.env.VERCEL ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0] : undefined;
  return createHash("sha256").update(`${process.env.WALL_ADMIN_TOKEN || "local"}:${new Date().toISOString().slice(0, 10)}:${ip || participant}`).digest("hex");
}

export async function hideAnswer(prompt: PromptId, text: string) {
  const query = "INSERT INTO wall_hidden (prompt, normalized) VALUES ($1, $2) ON CONFLICT (prompt, normalized) DO NOTHING";
  if (process.env.DATABASE_URL) await (await postgres()).query(query, [prompt, answerKey(text)]);
  else localDb().prepare(query.replace(/\$\d+/g, "?")).run(prompt, answerKey(text));
}

export async function clearWall(prompt: PromptId, restore = false) {
  // Clearing archives contributions; moderation remains enforced by wall_hidden.
  const query = "UPDATE wall_answers SET hidden = $1 WHERE prompt = $2";
  if (process.env.DATABASE_URL) await (await postgres()).query(query, [restore ? 0 : 1, prompt]);
  else localDb().prepare(query.replace(/\$\d+/g, "?")).run(restore ? 0 : 1, prompt);
}
