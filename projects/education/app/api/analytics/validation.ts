import { metricTypes, type MetricType } from "../../analytics/events";

import { SITE_ERRORS, LOAD_BUCKETS } from "../../analytics/web-health.js";

export type Metric = { id: string; visitor: string; session: string; page: string; type: MetricType; at: string; device: string; referrer: string; seconds: number; scene: number | null; choice: number | null; section: string };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const pages = ["/", "/play", "/after", "/wall", "/puff-world", "/light-trail", "/skyfront", "/hub"];
export const skyfrontErrors = ["webgl-context-lost", "runtime-error", "frame-error", "boot-error", "startup-timeout", "bundle-load", "unhandled-rejection", "page-restored"] as const;
export const skyfrontOrigins = ["https://relight-fighter.vercel.app", "https://dpine8302.github.io"] as const;
const hubLaunches = ["education", "skyfront", "puff", "scenario", "light-trail", "wall", "help"];
const hubDownloads = ["mac", "win-x64", "win-arm64"];
export function externalTelemetryPages(origin: string | null): readonly string[] {
  if (origin === "https://dpine8302.github.io") return ["/skyfront", "/hub"];
  if (origin === "https://relight-fighter.vercel.app") return ["/skyfront"];
  return [];
}

export function parseMetrics(value: unknown): Metric[] {
  if (!value || typeof value !== "object" || !("events" in value) || !Array.isArray(value.events) || value.events.length < 1 || value.events.length > 25) throw new Error("INVALID");
  return value.events.map((event: Record<string, unknown>) => {
    if (!event || typeof event !== "object" || ![event.id, event.visitor, event.session].every(v => typeof v === "string" && uuid.test(v)) || typeof event.page !== "string" || !pages.includes(event.page) || !metricTypes.includes(event.type as MetricType)) throw new Error("INVALID");
    const type = event.type as MetricType;
    const skyfront = type.startsWith("skyfront_");
    const health = ["site_error", "site_performance"].includes(type);
    const hub = type === "hub_launch" || type === "hub_download";
    if (skyfront && event.page !== "/skyfront" || event.page === "/skyfront" && !skyfront && !["page_view", "engagement"].includes(type)) throw new Error("INVALID");
    if (hub && event.page !== "/hub" || event.page === "/hub" && !hub && !health && !["page_view", "engagement"].includes(type)) throw new Error("INVALID");
    const time = typeof event.at === "string" ? Date.parse(event.at) : NaN;
    if (!Number.isFinite(time) || time < Date.now() - 7 * 86400000 || time > Date.now() + 300000) throw new Error("INVALID");
    const seconds = type === "engagement" ? Number(event.seconds) : 0;
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 30) throw new Error("INVALID");
    const choice = ["game_choice", "puff_clue"].includes(type);
    const stage = ["skyfront_tutorial_step", "skyfront_mission_start", "skyfront_mission_complete"].includes(type);
    if (choice && (!Number.isInteger(event.scene) || Number(event.scene) < 1 || Number(event.scene) > 3 || !Number.isInteger(event.choice) || Number(event.choice) < 0 || Number(event.choice) > 2)) throw new Error("INVALID");
    if (stage && (!Number.isInteger(event.scene) || Number(event.scene) < 0 || Number(event.scene) > 20)) throw new Error("INVALID");
    let section = "";
    if (health) {
      const allowed = type === "site_error" ? SITE_ERRORS : LOAD_BUCKETS;
      if (!allowed.includes(String(event.section)) || event.page === "/skyfront" || event.page === "/hub" && String(event.section).startsWith("wall-")) throw new Error("INVALID");
      section = String(event.section);
    }
    if (type === "education_interaction" && ["aerosol", "nicotine", "body", "myths", "marketing"].includes(String(event.section))) section = String(event.section);
    if (hub) {
      if (!(type === "hub_launch" ? hubLaunches : hubDownloads).includes(String(event.section))) throw new Error("INVALID");
      section = String(event.section);
    }
    if (skyfront) {
      if (type === "skyfront_error") {
        if (!skyfrontErrors.includes(event.section as typeof skyfrontErrors[number])) throw new Error("INVALID");
        section = String(event.section);
      } else {
        if (!["player", "watch"].includes(String(event.section))) throw new Error("INVALID");
        section = String(event.section);
      }
    }
    const referrer = typeof event.referrer === "string" && /^[a-z0-9.-]{1,120}$/i.test(event.referrer) ? event.referrer.toLowerCase() : "direct";
    return { id: String(event.id), visitor: String(event.visitor), session: String(event.session), page: event.page, type, at: new Date(time).toISOString(), device: ["mobile", "tablet", "desktop"].includes(String(event.device)) ? String(event.device) : "unknown", referrer, seconds, scene: choice || stage ? Number(event.scene) : null, choice: choice ? Number(event.choice) : null, section };
  });
}
