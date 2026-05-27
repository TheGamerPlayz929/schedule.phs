// Simple static file server for the PHS schedule site.
// Run: node local-server.js
// Then open: http://localhost:8080

const http = require("http");
const https = require("https");
const fs   = require("fs");
const path = require("path");

const PORT = parseInt(process.env.PORT, 10) || 8080;
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = __dirname;
const LOCAL_GRASS_ROOT = path.join(ROOT, "local-grass");
const FRONTEND_SETTINGS = path.join(ROOT, "site-settings.json");
const LEGACY_BACKEND_DATA = path.join(ROOT, "..", "phs-grades-backend-main", "data", "site-settings.json");
const LUNCH_WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=39.1459&longitude=-77.4169&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day&minutely_15=precipitation,precipitation_probability,weather_code&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America%2FNew_York&forecast_days=2";
const LUNCH_WEATHER_PROXY_TTL_MS = 10 * 60 * 1000;
const LUNCH_WEATHER_PROXY_TIMEOUT_MS = 6500;
let lunchWeatherCache = null;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css",
  ".js":   "application/javascript",
  ".json": "application/json",
  ".ico":  "image/x-icon",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg":  "image/svg+xml",
  ".webp": "image/webp",
  ".ttf":  "font/ttf",
  ".otf":  "font/otf",
  ".woff": "font/woff",
  ".woff2":"font/woff2",
};

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(payload));
}

function fetchLunchWeather() {
  return new Promise((resolve, reject) => {
    const req = https.get(LUNCH_WEATHER_URL, {
      headers: { "Accept": "application/json", "User-Agent": "phs-schedule-local-weather" },
      timeout: LUNCH_WEATHER_PROXY_TIMEOUT_MS,
    }, (apiRes) => {
      let body = "";
      apiRes.setEncoding("utf8");
      apiRes.on("data", chunk => { body += chunk; });
      apiRes.on("end", () => {
        if (apiRes.statusCode < 200 || apiRes.statusCode >= 300) {
          reject(new Error(`Weather HTTP ${apiRes.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error("Weather JSON parse failed"));
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error("Weather request timed out")));
    req.on("error", reject);
  });
}

function readSiteSettings() {
  for (const file of [FRONTEND_SETTINGS, LEGACY_BACKEND_DATA]) {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {}
  }
  return {
    nav: {
      items: [
        { label: "Announcements", href: "announcements.html" },
        { label: "Schedule", href: "index.html" },
        { label: "Grades", href: "gradeviewer.html" },
      ],
    },
    footer: {
      supportEmail: "For all inquiries, support, or removal requests, please contact us at emirbakir523@gmail.com or thegamerp929@gmail.com",
    },
    bellSchedules: {},
    scheduleOverride: null,
  };
}

function checkGradeMelon(res) {
  const probe = http.request({
    hostname: "localhost",
    port: 3001,
    path: "/login",
    method: "HEAD",
    timeout: 600,
  }, (probeRes) => {
    probeRes.resume();
    sendJson(res, 200, { available: probeRes.statusCode < 500 });
  });
  probe.on("timeout", () => {
    probe.destroy();
    sendJson(res, 200, { available: false });
  });
  probe.on("error", () => sendJson(res, 200, { available: false }));
  probe.end();
}

function getUrlPath(reqUrl) {
  try {
    return decodeURIComponent((reqUrl || "/").split("?")[0] || "/");
  } catch {
    return null;
  }
}

function safeResolve(baseDir, urlPath) {
  const relativePath = urlPath.replace(/^[/\\]+/, "");
  const resolvedPath = path.resolve(baseDir, relativePath);
  if (resolvedPath !== baseDir && !resolvedPath.startsWith(baseDir + path.sep)) {
    return null;
  }
  return resolvedPath;
}

function isBlockedStaticFile(filePath) {
  const rel = path.relative(ROOT, filePath);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return true;
  const parts = rel.split(path.sep);
  if (parts.some(part => part.startsWith("."))) return true;
  const blockedRoots = new Set(["OneDrive", "data", "notes", "node_modules", "scripts", "output", "test-results"]);
  const blockedFiles = new Set(["AGENTS.md", "package.json", "package-lock.json", "firebase.json", "server.js", "local-server.js"]);
  if (blockedRoots.has(parts[0]) || blockedFiles.has(rel)) return true;
  return rel.endsWith(".log") || rel.endsWith(".md") || rel.endsWith(".zip");
}

function getLocalRoute(urlPath) {
  if (urlPath === "/" || urlPath === "/schedule" || urlPath === "/schedule/") {
    return {
      filePath: path.join(ROOT, "index.html"),
      currentView: "schedule",
    };
  }

  if (urlPath === "/grass" || urlPath === "/grass/") {
    return {
      filePath: path.join(LOCAL_GRASS_ROOT, "index.html"),
      currentView: "grass",
    };
  }

  if (urlPath === "/grademelon" || urlPath === "/grademelon/" || urlPath === "/grademelon.html") {
    return {
      filePath: path.join(ROOT, "gradeviewer.html"),
      currentView: "schedule",
    };
  }

  let staticPath = urlPath;
  if (staticPath.endsWith("/")) staticPath += "index.html";

  return {
    filePath: safeResolve(ROOT, staticPath),
    currentView: staticPath.startsWith("/local-grass/") ? "grass" : "schedule",
  };
}

function injectLocalSwitcher(html, currentView) {
  const scheduleActive = currentView === "schedule" ? " is-active" : "";
  const grassActive = currentView === "grass" ? " is-active" : "";
  const switcher = `
  <style>
    .local-view-switcher {
      position: fixed;
      left: 14px;
      bottom: max(14px, env(safe-area-inset-bottom));
      z-index: 2147483647;
      display: inline-flex;
      gap: 4px;
      padding: 4px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 999px;
      background: rgba(8, 12, 24, 0.72);
      -webkit-backdrop-filter: blur(14px);
      backdrop-filter: blur(14px);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.24);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .local-view-switcher a {
      display: inline-flex;
      align-items: center;
      min-height: 30px;
      padding: 0 12px;
      border-radius: 999px;
      color: rgba(255, 255, 255, 0.72);
      font-size: 12px;
      font-weight: 650;
      line-height: 1;
      text-decoration: none;
      border: 0;
      white-space: nowrap;
    }

    .local-view-switcher a:hover,
    .local-view-switcher a.is-active {
      color: #fff;
      background: rgba(255, 255, 255, 0.14);
    }

    body.appearance-open .local-view-switcher {
      opacity: 0;
      pointer-events: none;
      transform: translateY(8px);
    }

    @media (max-width: 640px) {
      .local-view-switcher {
        bottom: max(58px, env(safe-area-inset-bottom));
      }
    }
  </style>
  <nav class="local-view-switcher" aria-label="Local view switcher">
    <a class="${scheduleActive}" href="/">Schedule</a>
    <a class="${grassActive}" href="/grass">Grass</a>
  </nav>`;

  if (html.includes("</body>")) {
    return html.replace("</body>", `${switcher}\n</body>`);
  }

  return `${html}\n${switcher}`;
}

function sendFile(res, filePath, urlPath, currentView) {
  if (!filePath || isBlockedStaticFile(filePath)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 Not Found: " + urlPath);
      return;
    }

    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || "application/octet-stream";

    if (ext === ".html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(injectLocalSwitcher(data.toString("utf8"), currentView));
      return;
    }

    res.writeHead(200, { "Content-Type": mime });
    res.end(data);
  });
}

http.createServer((req, res) => {
  const urlPath = getUrlPath(req.url);
  if (!urlPath) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Bad Request");
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  if (urlPath === "/site-settings") {
    sendJson(res, 200, readSiteSettings());
    return;
  }

  if (urlPath === "/schedule-override") {
    const settings = readSiteSettings();
    sendJson(res, 200, { override: settings.scheduleOverride || null });
    return;
  }

  if (urlPath === "/weather/lunch") {
    if (lunchWeatherCache && Date.now() - lunchWeatherCache.ts < LUNCH_WEATHER_PROXY_TTL_MS) {
      sendJson(res, 200, { ok: true, cached: true, api: lunchWeatherCache.api });
      return;
    }
    fetchLunchWeather()
      .then(api => {
        lunchWeatherCache = { ts: Date.now(), api };
        sendJson(res, 200, { ok: true, cached: false, api });
      })
      .catch(error => {
        if (lunchWeatherCache) {
          sendJson(res, 200, { ok: true, cached: true, stale: true, api: lunchWeatherCache.api });
          return;
        }
        sendJson(res, 502, { ok: false, error: error.message || "Weather unavailable" });
      });
    return;
  }

  if (urlPath === "/analytics/event") {
    res.writeHead(204, {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    });
    res.end();
    return;
  }

  if (urlPath === "/local-grade-melon-status") {
    checkGradeMelon(res);
    return;
  }

  const route = getLocalRoute(urlPath);
  if (!route.filePath) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  fs.readFile(route.filePath, (err) => {
    if (err && !path.extname(route.filePath)) {
      // Try appending .html for extensionless routes (e.g. /grademelon → grademelon.html)
      return fs.readFile(route.filePath + ".html", (err2) => {
        if (err2) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("404 Not Found: " + urlPath);
          return;
        }
        sendFile(res, route.filePath + ".html", urlPath, route.currentView);
      });
    }
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 Not Found: " + urlPath);
      return;
    }
    sendFile(res, route.filePath, urlPath, route.currentView);
  });
}).listen(PORT, HOST, () => {
  console.log(`\n  PHS Schedule site → http://${HOST}:${PORT}`);
  console.log(`  Local grass view → http://${HOST}:${PORT}/grass\n`);
});
