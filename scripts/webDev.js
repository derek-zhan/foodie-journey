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
const { spawn } = require("child_process");

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
