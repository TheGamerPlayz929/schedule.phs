// Simple static file server for the PHS schedule site.
// Run: node local-server.js
// Then open: http://localhost:8080

const http = require("http");
const fs   = require("fs");
const path = require("path");

const PORT = parseInt(process.env.PORT, 10) || 8080;
const ROOT = __dirname;
const BACKEND_DATA = path.join(ROOT, "..", "phs-grades-backend-main", "data", "site-settings.json");

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

function readSiteSettings() {
  try {
    return JSON.parse(fs.readFileSync(BACKEND_DATA, "utf8"));
  } catch {
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

http.createServer((req, res) => {
  let urlPath = req.url.split("?")[0]; // strip query strings
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

  if (urlPath === "/") urlPath = "/index.html";

  const filePath = path.join(ROOT, urlPath);

  fs.readFile(filePath, (err, data) => {
    if (err && !path.extname(filePath)) {
      // Try appending .html for extensionless routes (e.g. /grademelon → grademelon.html)
      return fs.readFile(filePath + ".html", (err2, data2) => {
        if (err2) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("404 Not Found: " + urlPath);
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(data2);
      });
    }
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 Not Found: " + urlPath);
      return;
    }
    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`\n  PHS Schedule site → http://localhost:${PORT}\n`);
});
