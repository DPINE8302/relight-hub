import { realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";

const MIME_TYPES: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".ogg": "audio/ogg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".wav": "audio/wav",
  ".webm": "video/webm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export function mimeTypeFor(path: string): string {
  return MIME_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
}

export function resolveContained(root: string, unsafePath: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(unsafePath);
  } catch {
    throw new Error("Malformed encoded path");
  }

  if (decoded.includes("\0")) {
    throw new Error("NUL bytes are not allowed in paths");
  }

  const normalized = decoded.replaceAll("\\", "/").replace(/^\/+/, "");
  if (isAbsolute(normalized)) {
    throw new Error("Absolute paths are not allowed");
  }

  const candidate = resolve(root, normalized);
  const child = relative(resolve(root), candidate);
  if (child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child)) {
    throw new Error("Path escapes the allowed root");
  }
  return candidate;
}

export async function resolveExistingContained(root: string, unsafePath: string): Promise<string> {
  const rootPath = await realpath(root);
  const candidate = resolveContained(rootPath, unsafePath);
  const candidatePath = await realpath(candidate);
  const child = relative(rootPath, candidatePath);
  if (child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child)) {
    throw new Error("Symlink escapes the allowed root");
  }
  const info = await stat(candidatePath);
  if (!info.isFile()) {
    throw new Error("Requested resource is not a file");
  }
  return candidatePath;
}
