import { createReadStream } from "node:fs";
import { randomUUID } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { Readable } from "node:stream";
import { protocol } from "electron";
import { logger } from "./logger";
import { mimeTypeFor, resolveExistingContained } from "./safe-path";

const UI_CSP = [
  "default-src 'self'",
  "base-uri 'none'",
  "connect-src 'self'",
  "font-src 'self' relight-ui:",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob:",
  "media-src 'self' relight-media: blob:",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self' blob:",
].join("; ");

const TEST_MEDIA_TTL_MS = 15 * 60 * 1_000;

export function registerPrivilegedSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: "relight-ui",
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
    {
      scheme: "relight-media",
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

interface ByteRange {
  start: number;
  end: number;
}

function parseRange(header: string | null, size: number): ByteRange | null | "invalid" {
  if (header === null) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (match === null) return "invalid";
  const startText = match[1] ?? "";
  const endText = match[2] ?? "";
  if (startText === "" && endText === "") return "invalid";

  if (startText === "") {
    const suffixLength = Number(endText);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return "invalid";
    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }

  const start = Number(startText);
  const requestedEnd = endText === "" ? size - 1 : Number(endText);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0 || start >= size) {
    return "invalid";
  }
  const end = Math.min(requestedEnd, size - 1);
  if (end < start) return "invalid";
  return { start, end };
}

async function fileResponse(
  request: Request,
  root: string,
  path: string,
  extraHeaders: Record<string, string>,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { ...extraHeaders, Allow: "GET, HEAD", "Cache-Control": "no-store" },
    });
  }
  try {
    const filePath = await resolveExistingContained(root, path);
    const file = await stat(filePath);
    const range = parseRange(request.headers.get("range"), file.size);
    if (range === "invalid") {
      return new Response(null, {
        status: 416,
        headers: { ...extraHeaders, "Accept-Ranges": "bytes", "Content-Range": `bytes */${file.size}` },
      });
    }

    const headers = new Headers({
      ...extraHeaders,
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
      "Content-Type": mimeTypeFor(filePath),
      "X-Content-Type-Options": "nosniff",
    });
    let status = 200;
    let body: ReadableStream<Uint8Array> | null = null;

    if (range === null) {
      headers.set("Content-Length", String(file.size));
      if (request.method !== "HEAD") {
        body = Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>;
      }
    } else {
      status = 206;
      headers.set("Content-Length", String(range.end - range.start + 1));
      headers.set("Content-Range", `bytes ${range.start}-${range.end}/${file.size}`);
      if (request.method !== "HEAD") {
        body = Readable.toWeb(createReadStream(filePath, range)) as ReadableStream<Uint8Array>;
      }
    }

    return new Response(body, { status, headers });
  } catch (error) {
    logger.warn("Protocol resource denied or unavailable", {
      path,
      error: error instanceof Error ? error.message : String(error),
    });
    return new Response("Not found", {
      status: 404,
      headers: { ...extraHeaders, "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

export class ProtocolService {
  private contentRoot: string;
  private readonly testMediaTokens = new Map<string, { filePath: string; expiresAt: number }>();

  constructor(
    private readonly rendererRoot: string,
    initialContentRoot: string,
    private readonly fontRoot: string,
    private readonly development: boolean,
  ) {
    this.contentRoot = initialContentRoot;
  }

  setContentRoot(contentRoot: string): void {
    this.contentRoot = contentRoot;
  }

  async install(): Promise<void> {
    await protocol.handle("relight-ui", async (request) => {
      const url = new URL(request.url);
      if (url.username !== "" || url.password !== "" || url.port !== "" || url.search !== "" || url.hash !== "") {
        return new Response("Not found", { status: 404 });
      }
      if (url.hostname === "fonts") {
        return fileResponse(request, this.fontRoot, url.pathname, {
          "Access-Control-Allow-Origin": "*",
          "Cross-Origin-Resource-Policy": "cross-origin",
          "Referrer-Policy": "no-referrer",
        });
      }
      if (url.hostname !== "operator" && url.hostname !== "audience") {
        return new Response("Not found", { status: 404 });
      }
      const requestedPath = url.pathname === "/" ? `${url.hostname}.html` : url.pathname;
      return fileResponse(request, this.rendererRoot, requestedPath, {
        "Content-Security-Policy": UI_CSP,
        "Cross-Origin-Opener-Policy": "same-origin",
        "Referrer-Policy": "no-referrer",
      });
    });

    await protocol.handle("relight-media", async (request) => {
      const url = new URL(request.url);
      if (url.username !== "" || url.password !== "" || url.port !== "" || url.search !== "" || url.hash !== "") {
        return new Response("Not found", { status: 404 });
      }
      if (url.hostname === "content") {
        return fileResponse(request, this.contentRoot, url.pathname, {
          "Access-Control-Allow-Origin": "*",
          "Cross-Origin-Resource-Policy": "cross-origin",
          "Referrer-Policy": "no-referrer",
        });
      }
      if (url.hostname !== "test" || !this.development) return new Response("Not found", { status: 404 });
      const tokenId = basename(url.pathname, extname(url.pathname));
      const token = this.testMediaTokens.get(tokenId);
      if (token === undefined || token.expiresAt < Date.now()) {
        this.testMediaTokens.delete(tokenId);
        return new Response("Not found", { status: 404 });
      }
      return fileResponse(request, dirname(token.filePath), basename(token.filePath), {
        "Access-Control-Allow-Origin": "relight-ui://operator",
        "Cross-Origin-Resource-Policy": "cross-origin",
        "Referrer-Policy": "no-referrer",
      });
    });
    logger.info("Local application protocols installed", {
      uiEntryPattern: join("out", "renderer", "*.html"),
      contentProtocol: "relight-media://content/",
      fontProtocol: "relight-ui://fonts/",
    });
  }

  dispose(): void {
    protocol.unhandle("relight-ui");
    protocol.unhandle("relight-media");
    this.testMediaTokens.clear();
  }

  async issueDevelopmentVideo(filePath: string): Promise<string> {
    if (!this.development) throw new Error("Local scene-test media is disabled outside development");
    if (extname(filePath).toLowerCase() !== ".mp4") throw new Error("Scene-test media must be an MP4 file");
    const resolved = await realpath(filePath);
    const information = await stat(resolved);
    if (!information.isFile() || information.size === 0) throw new Error("Scene-test media is unavailable or empty");
    this.testMediaTokens.clear();
    const token = randomUUID();
    this.testMediaTokens.set(token, { filePath: resolved, expiresAt: Date.now() + TEST_MEDIA_TTL_MS });
    logger.info("Issued an ephemeral local scene-test media token", { expiresInMs: TEST_MEDIA_TTL_MS });
    return `relight-media://test/${token}.mp4`;
  }
}
