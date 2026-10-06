import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import worker from "../dist/server/index.js";

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const host = getArg("--host", "0.0.0.0");
const port = Number(getArg("--port", "4173"));
const staticRoot = resolve("dist/client");
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mp4", "video/mp4"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
]);

const server = createServer(async (incoming, outgoing) => {
  try {
    const origin = `http://${incoming.headers.host ?? `${host}:${port}`}`;
    const url = new URL(incoming.url ?? "/", origin);

    if (url.pathname === "/__mobile-qa") {
      const requestedWidth = Number(url.searchParams.get("width"));
      const mobileQaWidth = [320, 360, 390, 430].includes(requestedWidth)
        ? requestedWidth
        : 390;
      outgoing.statusCode = 200;
      outgoing.setHeader("content-type", "text/html; charset=utf-8");
      outgoing.end(`<!doctype html>
        <html lang="en">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <title>RE:LIGHT mobile QA</title>
            <style>
              * { box-sizing: border-box; }
              html, body { min-height: 100%; margin: 0; background: #161a22; }
              body { display: grid; place-items: start center; padding: 28px; }
              iframe {
                width: ${mobileQaWidth}px;
                height: 844px;
                border: 0;
                border-radius: 28px;
                background: #030712;
                box-shadow: 0 28px 90px #0009;
              }
            </style>
          </head>
          <body>
            <iframe id="phone" src="/#experience" title="RE:LIGHT mobile preview"></iframe>
            <script>
              const phone = document.querySelector("#phone");
              phone.addEventListener("load", () => {
                setTimeout(() => {
                  const control = phone.contentDocument.querySelector(".story-controls");
                  control?.scrollIntoView({ block: "center" });
                }, 250);
              });
            </script>
          </body>
        </html>`);
      return;
    }

    const decodedPath = decodeURIComponent(url.pathname);
    const staticPath = resolve(staticRoot, `.${decodedPath}`);
    const insideStaticRoot =
      staticPath === staticRoot || staticPath.startsWith(`${staticRoot}${sep}`);

    if (insideStaticRoot) {
      const fileStat = await stat(staticPath).catch(() => null);
      if (fileStat?.isFile()) {
        outgoing.statusCode = 200;
        outgoing.setHeader(
          "content-type",
          contentTypes.get(extname(staticPath).toLowerCase()) ??
            "application/octet-stream",
        );
        createReadStream(staticPath).pipe(outgoing);
        return;
      }
    }

    const pending = [];
    const context = {
      passThroughOnException() {},
      waitUntil(promise) {
        pending.push(Promise.resolve(promise));
      },
    };
    const request = new Request(url, {
      headers: incoming.headers,
      method: incoming.method,
    });
    const response = await worker.fetch(request, {}, context);

    outgoing.statusCode = response.status;
    for (const [name, value] of response.headers) {
      outgoing.setHeader(name, value);
    }
    outgoing.end(Buffer.from(await response.arrayBuffer()));
    Promise.allSettled(pending);
  } catch (error) {
    outgoing.statusCode = 500;
    outgoing.setHeader("content-type", "text/plain; charset=utf-8");
    outgoing.end(error instanceof Error ? error.message : "Preview error");
  }
});

server.listen(port, host, () => {
  console.log(`RE:LIGHT preview ready on ${host}:${port}`);
});
