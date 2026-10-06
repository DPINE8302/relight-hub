import { homedir } from "node:os";
import { join } from "node:path";
import log from "electron-log/main";
import type { LogContext } from "./types";

const REDACTED = "[REDACTED]";
const SENSITIVE_KEY = /^(?:audioData|blob|buffer|contentRoot|cookie|credential|.*device(?:Id|Label)|.*(?:file)?path|password|recordingData|requestingUrl|secret|token|url|validatedUrl|voiceData)$/i;
const PERSONAL_PATH = /(?:\$HOME|\/(?:Users|Volumes|private|tmp|var|Applications|Library|System))(?:\/[^\r\n"'<>|]+)*/g;

function sanitizeString(value: string): string {
  const home = homedir();
  let sanitized = home.length > 1 ? value.replaceAll(home, "$HOME") : value;
  sanitized = sanitized.replace(/(?:data|blob):[^\s"']+/gi, REDACTED);
  sanitized = sanitized.replace(
    /\b(?:https?|wss?|ftp|relight-ui|relight-media):\/\/[^\s"'<>]+/gi,
    (match) => {
      try {
        const url = new URL(match);
        return `${url.protocol}//${url.host}/${REDACTED}`;
      } catch {
        return REDACTED;
      }
    },
  );
  // Paths may legally contain spaces. Prefer over-redacting the remainder of a
  // log line to leaking an owner, venue, meeting, or content-pack name.
  sanitized = sanitized.replace(PERSONAL_PATH, "[PATH]");
  sanitized = sanitized.replace(/(?:Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`);
  sanitized = sanitized.replace(
    /([?&](?:access_token|api[_-]?key|credential|password|secret|token)=)[^&#\s]+/gi,
    `$1${REDACTED}`,
  );
  return sanitized.length > 4000 ? `${sanitized.slice(0, 4000)}…` : sanitized;
}

function sanitize(value: unknown, key = "", seen = new WeakSet<object>()): unknown {
  if (SENSITIVE_KEY.test(key)) return REDACTED;
  if (typeof value === "string") return sanitizeString(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) {
    return value;
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeString(value.message),
      stack: value.stack === undefined ? undefined : sanitizeString(value.stack),
    };
  }
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitize(item, key, seen));

  const result: Record<string, unknown> = {};
  for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>).slice(0, 100)) {
    result[entryKey] = sanitize(entryValue, entryKey, seen);
  }
  return result;
}

export class AppLogger {
  private initialized = false;

  initialize(logDirectory: string, development: boolean): void {
    if (this.initialized) return;
    log.initialize();
    log.transports.file.resolvePathFn = () => join(logDirectory, "relight.log");
    log.transports.file.maxSize = 5 * 1024 * 1024;
    log.transports.file.level = "info";
    log.transports.console.level = development ? "debug" : "warn";
    log.transports.file.format = "{y}-{m}-{d}T{h}:{i}:{s}.{ms}{z} [{level}] {text}";
    this.initialized = true;
  }

  debug(message: string, context: LogContext = {}): void {
    log.debug(sanitizeString(message), sanitize(context));
  }

  info(message: string, context: LogContext = {}): void {
    log.info(sanitizeString(message), sanitize(context));
  }

  warn(message: string, context: LogContext = {}): void {
    log.warn(sanitizeString(message), sanitize(context));
  }

  error(message: string, error?: unknown, context: LogContext = {}): void {
    log.error(sanitizeString(message), sanitize(error), sanitize(context));
  }

  getLogPath(): string {
    return log.transports.file.getFile().path;
  }
}

export const logger = new AppLogger();
export { sanitize as redactForDiagnostics };
