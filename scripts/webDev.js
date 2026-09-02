#!/usr/bin/env node
// `npm run web` entry point.
//
// expo-sqlite's web backend runs SQLite in a Worker compiled to WASM and
// talks to it synchronously via Atomics.wait on a SharedArrayBuffer - which
// only exists in a "cross-origin isolated" page (Cross-Origin-Opener-Policy:
// same-origin + Cross-Origin-Embedder-Policy: require-corp on every
// response). Expo's own Metro dev server (this SDK version) doesn't send
// those headers on the HTML shell it serves, so the app crashes at import
// time (visitStore.ts's top-level `openDatabaseSync`) and the page renders
// blank. There's no expo/metro config knob for this - see the (verified,
// non-working) attempt via `server.enhanceMiddleware` in git history.
//
// Fix: run Metro as usual on METRO_PORT, then front it with a small proxy
// on PORT that adds the two headers to every response. Open PORT in the
// browser, not METRO_PORT.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const exifr = require("exifr");

// Dev-only stand-in for a device photo library on web (which has none -
// extractPhotoMetadata.ts always throws there on native builds). Reads the
// same gitignored .test/ folder the functional tests use, live via exifr
// (real GPS, nothing hardcoded) each request - no caching, so dropping a
// new photo in and refreshing the Review/Journey screen picks it up
// immediately.
//
// Double-gated against ever reaching a real deployment: this script itself
// (scripts/webDev.js) is only ever invoked by `npm run web` for local
// iteration - it spawns Metro's *dev* server (`expo start --web`), never a
// production export, so it's simply not part of any build/deploy pipeline.
// And the client only ever calls these routes when extractPhotoMetadata.ts
// sees both Platform.OS === "web" AND __DEV__ (false in any production
// bundle) - see the isLocalWebDev comment there.
const TEST_PHOTOS_DIR = path.resolve(__dirname, "../.test");

async function handleTestPhotosList(req, res) {
  res.setHeader("content-type", "application/json");
  if (!fs.existsSync(TEST_PHOTOS_DIR)) {
    res.end("[]");
    return;
  }
  const files = fs
    .readdirSync(TEST_PHOTOS_DIR)
    .filter((f) => /\.(jpe?g|heic)$/i.test(f));

  const photos = [];
  for (const file of files) {
    const gps = await exifr.gps(path.join(TEST_PHOTOS_DIR, file));
    if (gps) photos.push({ id: file, latitude: gps.latitude, longitude: gps.longitude });
  }
  res.end(JSON.stringify(photos));
}

function handleTestPhotoImage(req, res, filename) {
  // Reject anything that isn't a bare filename (no "..", no path
  // separators) before it ever touches the filesystem.
  if (filename !== path.basename(filename) || filename.includes("..")) {
    res.writeHead(400);
    res.end("Invalid filename");
    return;
  }
  const filePath = path.join(TEST_PHOTOS_DIR, filename);
  if (!filePath.startsWith(TEST_PHOTOS_DIR) || !fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  res.setHeader("content-type", "image/jpeg");
  fs.createReadStream(filePath).pipe(res);
}

// Last-resort safety net: a dev proxy dying on a stray socket error is
// worse than logging and carrying on.
process.on("uncaughtException", (err) => {
  console.error("[webDev proxy] uncaught error (ignored):", err.message);
});

const METRO_PORT = 8081;
const PORT = process.env.PORT ? Number(process.env.PORT) : 8082;

const metro = spawn(
  "npx",
  ["expo", "start", "--web", "--port", String(METRO_PORT)],
  { stdio: "inherit" }
);

function waitForMetro(callback) {
  http
    .get(`http://localhost:${METRO_PORT}`, () => callback())
    .on("error", () => setTimeout(() => waitForMetro(callback), 500));
}

// The browser aborting a request/connection mid-flight (page navigation,
// HMR reconnect, closed tab) is normal and frequent - without error
// listeners on every socket involved, Node treats that as an uncaught
// 'error' event and crashes the whole proxy (and takes Metro down with
// it, since it's a child process). Every socket below gets one.
function proxyRequest(req, res) {
  req.on("error", () => {});
  res.on("error", () => {});

  if (req.url === "/__test-photos") {
    handleTestPhotosList(req, res).catch((err) => {
      res.writeHead(500);
      res.end(`Failed to read .test/: ${err.message}`);
    });
    return;
  }
  if (req.url.startsWith("/__test-photo-image/")) {
    handleTestPhotoImage(
      req,
      res,
      decodeURIComponent(req.url.slice("/__test-photo-image/".length))
    );
    return;
  }

  const upstream = http.request(
    {
      host: "localhost",
      port: METRO_PORT,
      path: req.url,
      method: req.method,
      headers: req.headers,
    },
    (upstreamRes) => {
      upstreamRes.on("error", () => {});
      res.writeHead(upstreamRes.statusCode, {
        ...upstreamRes.headers,
        "cross-origin-opener-policy": "same-origin",
        "cross-origin-embedder-policy": "require-corp",
      });
      upstreamRes.pipe(res);
    }
  );
  upstream.on("error", (err) => {
    if (!res.headersSent) res.writeHead(502);
    res.end(`Proxy error reaching Metro: ${err.message}`);
  });
  req.pipe(upstream);
}

function proxyUpgrade(req, socket, head) {
  socket.on("error", () => {});

  // Metro's HMR websocket (/hot, /message) - forwarded as-is so live
  // reload keeps working through the proxy.
  const upstream = http.request({
    host: "localhost",
    port: METRO_PORT,
    path: req.url,
    method: req.method,
    headers: req.headers,
  });
  upstream.on("error", () => socket.destroy());
  upstream.on("upgrade", (upstreamRes, upstreamSocket, upstreamHead) => {
    upstreamSocket.on("error", () => {});
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n` +
        Object.entries(upstreamRes.headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\r\n") +
        "\r\n\r\n"
    );
    upstreamSocket.write(upstreamHead);
    upstreamSocket.pipe(socket);
    socket.pipe(upstreamSocket);
  });
  upstream.end();
}

waitForMetro(() => {
  const server = http.createServer(proxyRequest);
  server.on("upgrade", proxyUpgrade);
  server.listen(PORT, () => {
    console.log(`\nCross-origin-isolated proxy ready: http://localhost:${PORT}`);
    console.log(`(open this, not http://localhost:${METRO_PORT} - see comment in scripts/webDev.js)\n`);
  });
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    metro.kill(sig);
    process.exit();
  });
}
