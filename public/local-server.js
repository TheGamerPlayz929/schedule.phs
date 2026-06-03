// Simple static file server for the PHS schedule site.
// Run: node local-server.js
// Then open: http://localhost:8080

const http = require("http");
const https = require("https");
const fs   = require("fs");
const path = require("path");
const crypto = require("crypto");

// Crash safety: a local dev server should never die on an unexpected throw.
// Without these, any uncaught error (sync handler throw, rejected promise) exits
// the process and the user has to manually restart `node local-server.js`.
process.on("uncaughtException", (err) => {
  console.error("[server] uncaughtException (kept alive):", err && err.stack || err);
});
process.on("unhandledRejection", (err) => {
  console.error("[server] unhandledRejection (kept alive):", err && err.stack || err);
});

const PORT = parseInt(process.env.PORT, 10) || 8080;
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = __dirname;
const LOCAL_GRASS_ROOT = path.join(ROOT, "local-grass");
const FRONTEND_SETTINGS = path.join(ROOT, "site-settings.json");
const PUBLIC_SETTINGS = path.join(ROOT, "public", "site-settings.json");
const LOCAL_DRAFT_SETTINGS = path.join(ROOT, "data", "local-admin-draft.json");
const LOCAL_AUDIT_LOG = path.join(ROOT, "data", "local-admin-audit.json");
const LOCAL_ANALYTICS = path.join(ROOT, "data", "local-analytics.json");
const LOCAL_SCHEDULED_JOBS = path.join(ROOT, "data", "local-scheduled-jobs.json");
const LOCAL_BACKUP_DIR = path.join(ROOT, "backups", "local-admin");
const LEGACY_BACKEND_DATA = path.join(ROOT, "..", "phs-grades-backend-main", "data", "site-settings.json");
const LUNCH_WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=39.1459&longitude=-77.4169&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day&minutely_15=precipitation,precipitation_probability,weather_code&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America%2FNew_York&forecast_days=2";
const LUNCH_WEATHER_PROXY_TTL_MS = 10 * 60 * 1000;
const LUNCH_WEATHER_PROXY_TIMEOUT_MS = 6500;
let lunchWeatherCache = null;
const LOCAL_ADMIN_TOKEN = crypto.randomBytes(24).toString("hex");

const PUBLIC_SETTINGS_KEYS = [
  "version",
  "branding",
  "nav",
  "hero",
  "countdown",
  "footer",
  "grades",
  "theme",
  "appearance",
  "announcements",
  "privacy",
  "themePresets",
  "bellSchedules",
  "scheduleRules",
  "gradeMelon",
  "siteStatus",
  "scheduleOverride",
  "updatedAt"
];

const PRIVATE_SETTINGS_KEYS = new Set([
  "actor",
  "audit",
  "auditlog",
  "authorization",
  "cookie",
  "cookies",
  "email",
  "ip",
  "ips",
  "login",
  "password",
  "passwordhash",
  "secret",
  "secrets",
  "session",
  "sessions",
  "token",
  "tokens"
]);

const BLOCKED_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

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

function serverOrigin() {
  return `http://${HOST}:${PORT}`;
}

function isAllowedOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const url = new URL(origin);
    const port = url.port || (url.protocol === "https:" ? "443" : "80");
    return url.origin === serverOrigin() || (["127.0.0.1", "localhost"].includes(url.hostname) && port === String(PORT));
  } catch {
    return false;
  }
}

function corsHeaders(req) {
  const origin = req?.headers?.origin;
  return origin && isAllowedOrigin(req)
    ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin", "Access-Control-Allow-Credentials": "true" }
    : {};
}

function sendJson(res, status, payload, req = null) {
  const corsReq = req || res._phsRequest || null;
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...corsHeaders(corsReq),
  });
  res.end(JSON.stringify(payload));
}

function isApiPath(urlPath) {
  // Match an API prefix EXACTLY or as a path segment (prefix + "/..."), so that
  // the public static file "/site-settings.json" is NOT mistaken for the
  // "/site-settings" API (which would wrongly block cross-origin fetches of it).
  return ["/admin/", "/site-settings", "/schedule-override", "/weather/lunch", "/analytics/event", "/local-grade-melon-status"]
    .some(prefix => prefix.endsWith("/")
      ? urlPath.startsWith(prefix)
      : (urlPath === prefix || urlPath.startsWith(prefix + "/")));
}

function rejectCrossOrigin(req, res) {
  if (isAllowedOrigin(req)) return false;
  res.writeHead(403, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify({ error: "Cross-origin local admin request blocked" }));
  return true;
}

function assertNoBlockedObjectKeys(value, trail = []) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoBlockedObjectKeys(item, trail.concat(String(index))));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (BLOCKED_OBJECT_KEYS.has(String(key).toLowerCase())) {
      throw new Error(`Refusing unsafe object key: ${trail.concat(key).join(".")}`);
    }
    assertNoBlockedObjectKeys(child, trail.concat(key));
  }
}

function assertNoPrivateKeys(value, trail = []) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPrivateKeys(item, trail.concat(String(index))));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (BLOCKED_OBJECT_KEYS.has(String(key).toLowerCase())) {
      throw new Error(`Refusing unsafe settings key: ${trail.concat(key).join(".")}`);
    }
    const isThemePresetTokenBundle = trail[0] === "themePresets" && trail.length === 2 && key === "tokens";
    if (!isThemePresetTokenBundle && PRIVATE_SETTINGS_KEYS.has(String(key).toLowerCase())) {
      throw new Error(`Refusing private settings key: ${trail.concat(key).join(".")}`);
    }
    assertNoPrivateKeys(child, trail.concat(key));
  }
}

function publicSnapshot(settings) {
  assertNoPrivateKeys(settings);
  const out = {};
  for (const key of PUBLIC_SETTINGS_KEYS) {
    if (settings?.[key] !== undefined) out[key] = settings[key];
  }
  return out;
}

function fetchLunchWeather() {
  return new Promise((resolve, reject) => {
    const req = https.get(LUNCH_WEATHER_URL, {
      headers: { "Accept": "application/json", "User-Agent": "phs-schedule-local-weather" },
      timeout: LUNCH_WEATHER_PROXY_TIMEOUT_MS,
    }, (apiRes) => {
      let body = "";
      let tooBig = false;
      apiRes.setEncoding("utf8");
      apiRes.on("data", chunk => {
        if (tooBig) return;
        body += chunk;
        if (body.length > 2 * 1024 * 1024) { tooBig = true; apiRes.destroy(); }
      });
      apiRes.on("end", () => {
        if (tooBig) { reject(new Error("Weather response too large")); return; }
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
  for (const file of [LOCAL_DRAFT_SETTINGS, FRONTEND_SETTINGS, LEGACY_BACKEND_DATA]) {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {}
  }
  return defaultSiteSettings();
}

function readLiveSiteSettings() {
  for (const file of [FRONTEND_SETTINGS, LEGACY_BACKEND_DATA]) {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {}
  }
  return defaultSiteSettings();
}

function defaultSiteSettings() {
  return {
    version: 1,
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
    bellSchedules: { _dateOverrides: {} },
    scheduleRules: [],
    themePresets: [],
    automations: [],
    announcements: { items: [] },
    siteStatus: {
      mode: "live",
      title: "Site paused for maintenance",
      message: "Poolesville Schedule is temporarily unavailable while we make an update. Please check back soon."
    },
    scheduleOverride: null,
  };
}

function writeJsonAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function applySettingsPatchLocal(current, patch) {
  const next = deepClone(current || {});
  for (const [key, value] of Object.entries(patch || {})) {
    if (key === "updatedAt") continue;
    if (value === null || Array.isArray(value) || typeof value !== "object") {
      next[key] = deepClone(value);
      continue;
    }
    next[key] = Object.assign({}, next[key] || {}, value);
    for (const [nestedKey, nestedValue] of Object.entries(value)) {
      if (Array.isArray(nestedValue) || nestedValue === null || typeof nestedValue !== "object") {
        next[key][nestedKey] = deepClone(nestedValue);
      }
    }
  }
  next.updatedAt = Date.now();
  return next;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let aborted = false;
    req.setEncoding("utf8");
    req.on("data", chunk => {
      if (aborted) return;
      body += chunk;
      if (body.length > 5 * 1024 * 1024) {
        aborted = true;
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => { if (!aborted) resolve(body); });
    req.on("error", reject);
  });
}

async function readJsonBody(req) {
  const body = await readBody(req);
  if (!body.trim()) return {};
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    const error = new Error("Invalid JSON body");
    error.statusCode = 400;
    throw error;
  }
  assertNoBlockedObjectKeys(parsed);
  return parsed;
}

function auditEntries() {
  try {
    const entries = JSON.parse(fs.readFileSync(LOCAL_AUDIT_LOG, "utf8"));
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

function appendAudit(action, extra = {}) {
  const entries = auditEntries();
  entries.unshift({
    action,
    timestamp: new Date().toISOString(),
    actor: { email: "local-admin@poolesville.test", name: "Local Admin" },
    ...extra
  });
  writeJsonAtomic(LOCAL_AUDIT_LOG, entries.slice(0, 200));
}

function createSettingsBackup(settings, source = "local", meta = {}) {
  fs.mkdirSync(LOCAL_BACKUP_DIR, { recursive: true });
  const id = `local-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const backup = {
    id,
    source,
    createdAt: new Date().toISOString(),
    label: String(meta.label || "").trim(),
    settings
  };
  writeJsonAtomic(path.join(LOCAL_BACKUP_DIR, `${id}.json`), backup);
  return { id, createdAt: backup.createdAt, source, label: backup.label };
}

function localBackupPath(id) {
  if (!/^[\w.-]+$/.test(String(id || ""))) throw new Error("Invalid backup id");
  const filePath = path.resolve(LOCAL_BACKUP_DIR, `${id}.json`);
  const rel = path.relative(LOCAL_BACKUP_DIR, filePath);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("Invalid backup id");
  return filePath;
}

function readBackup(id) {
  const backup = JSON.parse(fs.readFileSync(localBackupPath(id), "utf8"));
  if (!backup.settings) throw new Error("Backup has no settings");
  return backup;
}

function listLocalBackups(limit = 50) {
  try {
    return fs.readdirSync(LOCAL_BACKUP_DIR)
      .filter(name => name.endsWith(".json"))
      .map(name => {
        try {
          return JSON.parse(fs.readFileSync(path.join(LOCAL_BACKUP_DIR, name), "utf8"));
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .slice(0, limit)
      .map(entry => ({
        id: entry.id,
        createdAt: entry.createdAt,
        timestamp: entry.createdAt,
        source: entry.source || "local",
        label: entry.label || ""
      }));
  } catch {
    return [];
  }
}

function readAnalyticsStore() {
  try {
    const data = JSON.parse(fs.readFileSync(LOCAL_ANALYTICS, "utf8"));
    return data && typeof data === "object" ? data : { days: {} };
  } catch {
    return { days: {} };
  }
}

function writeAnalyticsStore(store) {
  const days = Object.fromEntries(Object.entries(store.days || {}).sort().slice(-60));
  writeJsonAtomic(LOCAL_ANALYTICS, { days, updatedAt: new Date().toISOString() });
}

function analyticsDayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeAnalyticsPage(value) {
  const raw = String(value || "schedule").toLowerCase();
  if (raw.includes("announcement")) return "announcements";
  if (raw.includes("grade")) return "grades";
  if (raw.includes("privacy")) return "privacy";
  return "schedule";
}

function normalizeAnalyticsDevice(value) {
  const device = String(value || "").toLowerCase();
  if (device === "mobile" || device === "tablet" || device === "desktop") return device;
  return "desktop";
}

function recordAnalyticsEvent(body = {}) {
  const store = readAnalyticsStore();
  const now = new Date();
  const dayKey = analyticsDayKey(now);
  const day = store.days[dayKey] ||= { totals: { pageviews: 0, durationSeconds: 0 }, pages: {}, devices: {}, hours: {} };
  const page = normalizeAnalyticsPage(body.page || body.path);
  const device = normalizeAnalyticsDevice(body.device);
  const hour = String(now.getHours()).padStart(2, "0");
  const eventType = String(body.type || "view");
  const durationSeconds = Math.max(0, Math.min(3600, Number(body.durationSeconds) || 0));
  day.pages[page] ||= { pageviews: 0, durationSeconds: 0 };
  day.devices[device] ||= { pageviews: 0, durationSeconds: 0 };
  day.hours[hour] ||= { pageviews: 0, durationSeconds: 0 };
  if (eventType === "duration") {
    day.totals.durationSeconds += durationSeconds;
    day.pages[page].durationSeconds += durationSeconds;
    day.devices[device].durationSeconds += durationSeconds;
    day.hours[hour].durationSeconds += durationSeconds;
  } else {
    day.totals.pageviews += 1;
    day.pages[page].pageviews += 1;
    day.devices[device].pageviews += 1;
    day.hours[hour].pageviews += 1;
  }
  writeAnalyticsStore(store);
}

function buildAnalyticsSummary() {
  const store = readAnalyticsStore();
  const days = store.days || {};
  const totals = { pageviews: 0, durationSeconds: 0 };
  const pages = {};
  const devices = {};
  const hours = {};
  for (const day of Object.values(days)) {
    totals.pageviews += day?.totals?.pageviews || 0;
    totals.durationSeconds += day?.totals?.durationSeconds || 0;
    for (const [page, metrics] of Object.entries(day?.pages || {})) {
      pages[page] ||= { pageviews: 0, durationSeconds: 0 };
      pages[page].pageviews += metrics.pageviews || 0;
      pages[page].durationSeconds += metrics.durationSeconds || 0;
    }
    for (const [device, metrics] of Object.entries(day?.devices || {})) {
      devices[device] ||= { pageviews: 0, durationSeconds: 0 };
      devices[device].pageviews += metrics.pageviews || 0;
      devices[device].durationSeconds += metrics.durationSeconds || 0;
    }
    for (const [hour, metrics] of Object.entries(day?.hours || {})) {
      hours[hour] ||= { pageviews: 0, durationSeconds: 0 };
      hours[hour].pageviews += metrics.pageviews || 0;
      hours[hour].durationSeconds += metrics.durationSeconds || 0;
    }
  }
  return {
    ok: true,
    local: true,
    days,
    totals,
    pages: Object.entries(pages).map(([path, metrics]) => ({ path, ...metrics })),
    devices: Object.entries(devices).map(([device, metrics]) => ({ device, ...metrics })),
    hours: Object.entries(hours).map(([hour, metrics]) => ({ hour, ...metrics })),
    googleAnalytics: { configured: false, pages: [], totals: {}, note: "GA4 is not connected in local preview." },
    privacy: {
      storesPersonalData: false,
      storesIpAddresses: false,
      storesUserAgents: false,
      usesCookies: false
    }
  };
}

function readScheduledJobs() {
  try {
    const jobs = JSON.parse(fs.readFileSync(LOCAL_SCHEDULED_JOBS, "utf8"));
    return Array.isArray(jobs) ? jobs : [];
  } catch {
    return [];
  }
}

function writeScheduledJobs(jobs) {
  writeJsonAtomic(LOCAL_SCHEDULED_JOBS, jobs.slice(0, 200));
}

function localDateKey(date = new Date()) {
  return analyticsDayKey(date);
}

function cleanScheduledDate(value, fallback = localDateKey(new Date())) {
  const raw = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : fallback;
}

function cleanScheduledTime(value, fallback = "08:00") {
  const raw = String(value || "").trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(raw) ? raw : fallback;
}

function validateScheduledTrigger(trigger = {}) {
  const type = trigger.type === "weekday" ? "weekday" : "dateTime";
  if (type === "weekday") {
    const weekdays = Array.isArray(trigger.weekdays)
      ? [...new Set(trigger.weekdays.map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6))]
      : [];
    if (!weekdays.length) throw new Error("Weekday automations need at least one weekday");
    return { type, weekdays, time: cleanScheduledTime(trigger.time) };
  }
  const next = { type, date: cleanScheduledDate(trigger.date), time: cleanScheduledTime(trigger.time) };
  return next;
}

function validateScheduledAction(action = {}) {
  const type = String(action.type || "publishDraft");
  if (type === "sequence") {
    const actions = Array.isArray(action.actions) ? action.actions.map(validateScheduledAction) : [];
    if (!actions.length) throw new Error("Automation sequences need at least one action");
    return { type, actions };
  }
  if (type === "setSchedule") {
    return {
      type,
      scheduleType: String(action.scheduleType || "Normal Schedule").trim().slice(0, 80) || "Normal Schedule",
      date: cleanScheduledDate(action.date),
      publishAfter: action.publishAfter === true
    };
  }
  if (type === "setMaintenance") {
    return {
      type,
      mode: action.mode === "live" ? "live" : "maintenance",
      title: String(action.title || "").slice(0, 160),
      message: String(action.message || "").slice(0, 800),
      publishAfter: action.publishAfter === true
    };
  }
  if (type === "announcementWindow") {
    const mode = ["show", "expire", "clear"].includes(action.mode) ? action.mode : "show";
    return {
      type,
      index: Math.max(0, Number(action.index) || 0),
      mode,
      date: cleanScheduledDate(action.date),
      publishAfter: action.publishAfter === true
    };
  }
  if (type === "publishDraft") return { type };
  throw new Error(`Unsupported scheduled action: ${type}`);
}

function flattenScheduledActions(action = {}) {
  if (action.type === "sequence") return (Array.isArray(action.actions) ? action.actions : []).flatMap(flattenScheduledActions);
  return [action];
}

function scheduledActionAuditType(action = {}) {
  if (action.type !== "sequence") return action.type || "unknown";
  return `sequence:${flattenScheduledActions(action).map(step => step.type).join(">")}`;
}

function jobRunAt(job) {
  if (job?.trigger?.type === "dateTime") {
    const runAt = job.trigger.runAt || `${job.trigger.date || ""}T${job.trigger.time || "00:00"}`;
    const date = new Date(runAt);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  return null;
}

function isJobDue(job, now = new Date()) {
  if (!job || job.enabled === false || job.status === "applied" || job.status === "failed") return false;
  if (job.trigger?.type === "weekday") {
    const weekdays = Array.isArray(job.trigger.weekdays) ? job.trigger.weekdays.map(Number) : [];
    const today = now.getDay();
    const todayKey = localDateKey(now);
    if (!weekdays.includes(today) || job.lastAppliedDate === todayKey) return false;
    const [h, m] = String(job.trigger.time || "00:00").split(":").map(Number);
    return now.getHours() * 60 + now.getMinutes() >= (Number(h) || 0) * 60 + (Number(m) || 0);
  }
  const runAt = jobRunAt(job);
  return runAt ? runAt.getTime() <= now.getTime() : false;
}

function applyScheduledActionToDraft(draftAfter, action, today) {
  if (action.type === "setSchedule") {
    const date = action.date || today;
    const type = action.scheduleType || "Normal Schedule";
    draftAfter.bellSchedules ||= {};
    draftAfter.bellSchedules._dateOverrides ||= {};
    draftAfter.bellSchedules._dateOverrides[date] = type;
    return { mutated: true, publish: action.publishAfter === true };
  }
  if (action.type === "setMaintenance") {
    draftAfter.siteStatus = {
      ...(draftAfter.siteStatus || {}),
      mode: action.mode === "maintenance" ? "maintenance" : "live",
      title: action.title || draftAfter.siteStatus?.title || "Site paused for maintenance",
      message: action.message || draftAfter.siteStatus?.message || "Poolesville Schedule is temporarily unavailable while we make an update. Please check back soon."
    };
    return { mutated: true, publish: action.publishAfter === true };
  }
  if (action.type === "announcementWindow") {
    const index = Math.max(0, Number(action.index) || 0);
    draftAfter.announcements ||= { items: [] };
    draftAfter.announcements.items ||= [];
    const item = draftAfter.announcements.items[index];
    if (!item) throw new Error("Announcement target not found");
    if (action.mode === "show") item.showFrom = action.date || today;
    if (action.mode === "expire") item.expiresOn = action.date || today;
    if (action.mode === "clear") {
      item.showFrom = "";
      item.expiresOn = "";
    }
    return { mutated: true, publish: action.publishAfter === true };
  }
  if (action.type === "publishDraft") return { mutated: false, publish: true };
  throw new Error("Unsupported scheduled action");
}

function applyScheduledJob(job, source = "manual") {
  const draftBefore = readSiteSettings();
  let draftAfter = deepClone(draftBefore);
  const action = validateScheduledAction(job.action || {});
  const actions = flattenScheduledActions(action);
  const today = localDateKey(new Date());
  let mutated = false;
  let shouldPublish = false;
  for (const step of actions) {
    const result = applyScheduledActionToDraft(draftAfter, step, today);
    mutated = mutated || result.mutated;
    shouldPublish = shouldPublish || result.publish;
  }
  if (mutated) {
    draftAfter.updatedAt = Date.now();
    writeJsonAtomic(LOCAL_DRAFT_SETTINGS, draftAfter);
  }
  if (shouldPublish) {
    const beforeLive = readLiveSiteSettings();
    const backup = createSettingsBackup(beforeLive, "scheduled-publish", { label: job.name || "" });
    const settings = publicSnapshot(mutated ? draftAfter : readSiteSettings());
    writeJsonAtomic(FRONTEND_SETTINGS, settings);
    writeJsonAtomic(PUBLIC_SETTINGS, settings);
    try { fs.unlinkSync(LOCAL_DRAFT_SETTINGS); } catch {}
    appendAudit("scheduled_publish", { job: job.id, name: job.name || "", source, backup: backup.id, scheduledAction: scheduledActionAuditType(action), steps: actions.length });
  } else {
    appendAudit("scheduled_apply", { job: job.id, name: job.name || "", source, scheduledAction: scheduledActionAuditType(action), steps: actions.length });
  }
}

function applyDueScheduledJobs(source = "server") {
  const jobs = readScheduledJobs();
  const now = new Date();
  const applied = [];
  const failed = [];
  for (const job of jobs) {
    if (!isJobDue(job, now)) continue;
    try {
      applyScheduledJob(job, source);
      job.status = job.trigger?.type === "weekday" ? "scheduled" : "applied";
      job.lastAppliedAt = now.toISOString();
      job.lastAppliedDate = localDateKey(now);
      job.error = "";
      applied.push(job);
    } catch (error) {
      job.status = "failed";
      job.error = error.message || "Scheduled job failed";
      failed.push(job);
      appendAudit("scheduled_failed", { job: job.id, name: job.name || "", source, error: job.error });
    }
  }
  if (applied.length || failed.length) writeScheduledJobs(jobs);
  return { applied, failed, jobs };
}

function localOpsSummary() {
  const backups = listLocalBackups(50);
  const audit = auditEntries();
  return {
    checkedAt: new Date().toISOString(),
    actor: { email: "local-admin@poolesville.test", name: "Local Admin" },
    storage: {
      settings: { type: "local-json", durable: true },
      audit: { type: "local-json", durable: true },
      backups: { type: "local-json", durable: true }
    },
    publicSync: {
      configured: true,
      paths: ["site-settings.json", "public/site-settings.json"]
    },
    backups: {
      count: backups.length,
      latest: backups[0] || null,
      entries: backups
    },
    audit: {
      latest: audit[0] || null,
      entries: audit.slice(0, 20)
    },
    analytics: {
      privacy: {
        storesPersonalData: false,
        storesIpAddresses: false,
        storesUserAgents: false,
        usesCookies: false,
        note: "Local analytics are stubbed for preview."
      }
    },
    security: {
      adminAuth: "local-dev",
      rateLimits: { active: true, controls: ["local"], note: "Local dev shim is active." },
      upload: false,
      publicSnapshotKeys: Object.keys(readLiveSiteSettings()),
      privateKeyGuard: ["token", "password", "session", "ip", "actor"]
    },
    environment: { local: true },
    failures: []
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
  const blockedRoots = new Set(["OneDrive", "backups", "data", "notes", "node_modules", "scripts", "output", "test-results"]);
  const blockedFiles = new Set(["AGENTS.md", "package.json", "package-lock.json", "firebase.json", "server.js", "local-server.js"]);
  if (blockedRoots.has(parts[0]) || blockedFiles.has(rel) || blockedFiles.has(parts[parts.length - 1])) return true;
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

function shouldInjectLocalSwitcher(urlPath, rawUrl = "") {
  // Never inject the dev view-switcher into preview/studio iframes — it clutters
  // the Theme Studio canvas and the live preview overlay with a floating pill.
  if (/[?&](_preview|_studio)=/.test(String(rawUrl))) return false;
  return !(
    urlPath === "/admin.html" ||
    urlPath.startsWith("/admin/") ||
    urlPath.startsWith("/public/admin")
  );
}

function sendFile(res, filePath, urlPath, currentView, rawUrl = "") {
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

    // Local dev: never cache static assets so CSS/JS edits show on reload.
    const noCache = { "Cache-Control": "no-store, max-age=0", "Pragma": "no-cache" };

    if (ext === ".html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", ...noCache });
      const html = data.toString("utf8");
      res.end(shouldInjectLocalSwitcher(urlPath, rawUrl) ? injectLocalSwitcher(html, currentView) : html);
      return;
    }

    res.writeHead(200, { "Content-Type": mime, ...noCache });
    res.end(data);
  });
}

function handleRequest(req, res) {
  res._phsRequest = req;
  const urlPath = getUrlPath(req.url);
  if (!urlPath) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Bad Request");
    return;
  }

  if (isApiPath(urlPath) && rejectCrossOrigin(req, res)) return;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      ...corsHeaders(req),
      "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.end();
    return;
  }

  if (urlPath === "/admin/auth-config") {
    sendJson(res, 200, {
      localBypassEnabled: true,
      googleClientId: null,
      publicSiteUrl: `http://${HOST}:${PORT}`
    });
    return;
  }

  if (urlPath === "/admin/whoami") {
    sendJson(res, 200, {
      ok: true,
      method: "local-dev",
      devControlsEnabled: true,
      identity: { name: "Local Admin", email: "local-admin@poolesville.test" }
    });
    return;
  }

  if (urlPath === "/admin/logout" && req.method === "POST") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (urlPath === "/admin/google-login" && req.method === "POST") {
    sendJson(res, 200, {
      ok: true,
      token: LOCAL_ADMIN_TOKEN,
      identity: { name: "Local Admin", email: "local-admin@poolesville.test" }
    });
    return;
  }

  if (urlPath === "/site-settings/defaults") {
    sendJson(res, 200, readLiveSiteSettings());
    return;
  }

  if ((urlPath === "/site-settings" || urlPath === "/admin/site-settings") && req.method === "GET") {
    sendJson(res, 200, readSiteSettings());
    return;
  }

  if (urlPath === "/site-settings" && req.method === "PUT") {
    readJsonBody(req)
      .then(body => {
        const patch = body.patch;
        if (!patch || typeof patch !== "object") {
          sendJson(res, 400, { error: "Missing patch" });
          return;
        }
        const before = readSiteSettings();
        if (body.source === "discard-draft") {
          try { fs.unlinkSync(LOCAL_DRAFT_SETTINGS); } catch {}
          const after = readSiteSettings();
          appendAudit("draft_discard", { source: "discard-draft", patchKeys: Object.keys(patch) });
          sendJson(res, 200, { ok: true, settings: after });
          return;
        }
        const after = applySettingsPatchLocal(before, patch);
        assertNoPrivateKeys(after);
        writeJsonAtomic(LOCAL_DRAFT_SETTINGS, after);
        appendAudit("draft_save", { source: body.source || "local", patchKeys: Object.keys(patch) });
        sendJson(res, 200, { ok: true, settings: after });
      })
      .catch(error => sendJson(res, 400, { error: error.message || "Invalid JSON" }));
    return;
  }

  if (urlPath === "/admin/publish-public-settings" && req.method === "POST") {
    readJsonBody(req)
      .then(body => {
        const before = readLiveSiteSettings();
        const settings = publicSnapshot(readSiteSettings());
        const backup = createSettingsBackup(before, "local-publish", { label: body.label || "" });
        writeJsonAtomic(FRONTEND_SETTINGS, settings);
        writeJsonAtomic(PUBLIC_SETTINGS, settings);
        try { fs.unlinkSync(LOCAL_DRAFT_SETTINGS); } catch {}
        appendAudit("publish", { sections: Object.keys(settings), backup: backup.id, label: body.label || "" });
        sendJson(res, 200, {
          ok: true,
          settings,
          backup,
          publicFrontend: { enabled: true, paths: ["site-settings.json", "public/site-settings.json"] }
        });
      })
      .catch(error => sendJson(res, 400, { error: error.message || "Invalid JSON" }));
    return;
  }

  if (urlPath === "/admin/backups" && req.method === "GET") {
    sendJson(res, 200, { backups: listLocalBackups(50), storage: { type: "local-json", durable: true } });
    return;
  }

  const backupMatch = urlPath.match(/^\/admin\/backups\/([^/]+)$/);
  if (backupMatch && req.method === "GET") {
    try {
      const backup = readBackup(backupMatch[1]);
      sendJson(res, 200, {
        id: backup.id,
        createdAt: backup.createdAt,
        timestamp: backup.createdAt,
        source: backup.source || "local",
        label: backup.label || "",
        settings: backup.settings
      });
    } catch (error) {
      sendJson(res, 404, { error: error.message || "Backup not found" });
    }
    return;
  }

  if (urlPath === "/admin/snapshots" && req.method === "POST") {
    readJsonBody(req)
      .then(body => {
        const backup = createSettingsBackup(readSiteSettings(), "named-snapshot", { label: body.label || "Named snapshot" });
        appendAudit("snapshot_create", { backup: backup.id, label: backup.label });
        sendJson(res, 200, { ok: true, backup });
      })
      .catch(error => sendJson(res, 400, { error: error.message || "Invalid JSON" }));
    return;
  }

  const restoreMatch = urlPath.match(/^\/admin\/backups\/([^/]+)\/restore$/);
  if (restoreMatch && req.method === "POST") {
    const id = restoreMatch[1];
    if (!/^[\w.-]+$/.test(id)) {
      sendJson(res, 400, { error: "Invalid backup id" });
      return;
    }
    try {
      const backup = readBackup(id);
      const restored = publicSnapshot(backup.settings);
      const preRestore = createSettingsBackup(readLiveSiteSettings(), "pre-restore", { label: `Before restore ${id}` });
      writeJsonAtomic(FRONTEND_SETTINGS, restored);
      writeJsonAtomic(PUBLIC_SETTINGS, restored);
      writeJsonAtomic(LOCAL_DRAFT_SETTINGS, restored);
      appendAudit("restore", { backup: id, preRestoreBackup: preRestore.id });
      sendJson(res, 200, { ok: true, settings: restored, backup: { id, createdAt: backup.createdAt }, preRestoreBackup: preRestore });
    } catch (error) {
      sendJson(res, 404, { error: error.message || "Backup not found" });
    }
    return;
  }

  if (urlPath === "/admin/audit-log" && req.method === "GET") {
    sendJson(res, 200, { entries: auditEntries() });
    return;
  }

  if (urlPath === "/admin/analytics" && req.method === "GET") {
    sendJson(res, 200, buildAnalyticsSummary());
    return;
  }

  if (urlPath === "/admin/scheduled-jobs/apply-due" && req.method === "POST") {
    sendJson(res, 200, { ok: true, fallbackMode: true, ...applyDueScheduledJobs("admin-load") });
    return;
  }

  if (urlPath === "/admin/scheduled-jobs" && req.method === "GET") {
    sendJson(res, 200, { ok: true, fallbackMode: true, jobs: readScheduledJobs() });
    return;
  }

  if (urlPath === "/admin/scheduled-jobs" && req.method === "POST") {
    readJsonBody(req)
      .then(body => {
        const jobs = readScheduledJobs();
        const trigger = validateScheduledTrigger(body.trigger || {});
        const action = validateScheduledAction(body.action || {});
        const job = {
          id: `job-${crypto.randomUUID()}`,
          name: String(body.name || "Scheduled job").trim().slice(0, 120),
          enabled: body.enabled !== false,
          trigger,
          action,
          graph: body.graph && typeof body.graph === "object" ? body.graph : null,
          status: "scheduled",
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString()
        };
        jobs.unshift(job);
        writeScheduledJobs(jobs);
        appendAudit("scheduled_create", { job: job.id, name: job.name, action: scheduledActionAuditType(job.action) });
        sendJson(res, 200, { ok: true, job, jobs });
      })
      .catch(error => sendJson(res, 400, { error: error.message || "Invalid JSON" }));
    return;
  }

  const jobApplyMatch = urlPath.match(/^\/admin\/scheduled-jobs\/([^/]+)\/apply$/);
  if (jobApplyMatch && req.method === "POST") {
    const jobs = readScheduledJobs();
    const job = jobs.find(item => item.id === jobApplyMatch[1]);
    if (!job) {
      sendJson(res, 404, { error: "Scheduled job not found" });
      return;
    }
    try {
      applyScheduledJob(job, "manual");
      job.status = job.trigger?.type === "weekday" ? "scheduled" : "applied";
      job.lastAppliedAt = new Date().toISOString();
      job.lastAppliedDate = localDateKey(new Date());
      job.error = "";
      writeScheduledJobs(jobs);
      sendJson(res, 200, { ok: true, job, jobs });
    } catch (error) {
      job.status = "failed";
      job.error = error.message || "Scheduled job failed";
      writeScheduledJobs(jobs);
      sendJson(res, 400, { error: job.error, job });
    }
    return;
  }

  const jobDeleteMatch = urlPath.match(/^\/admin\/scheduled-jobs\/([^/]+)\/delete$/);
  if (jobDeleteMatch && req.method === "POST") {
    const jobs = readScheduledJobs();
    const next = jobs.filter(item => item.id !== jobDeleteMatch[1]);
    if (next.length === jobs.length) {
      sendJson(res, 404, { error: "Scheduled job not found" });
      return;
    }
    writeScheduledJobs(next);
    appendAudit("scheduled_delete", { job: jobDeleteMatch[1] });
    sendJson(res, 200, { ok: true, jobs: next });
    return;
  }

  if (urlPath === "/admin/ops-summary" && req.method === "GET") {
    sendJson(res, 200, localOpsSummary());
    return;
  }

  if (urlPath === "/admin/upload" && req.method === "POST") {
    sendJson(res, 400, { error: "Local upload shim does not store files. Use the deployed backend for upload testing." });
    return;
  }

  if (urlPath === "/admin/ai/jarvis" && req.method === "POST") {
    sendJson(res, 200, {
      ok: false,
      disabled: true,
      patch: {},
      sections: [],
      reply: "Jarvis AI is not configured in this local server. The chat layout is available, but drafting needs the deployed backend."
    });
    return;
  }

  if (urlPath === "/admin/ai/extract-schedule-image" && req.method === "POST") {
    sendJson(res, 200, {
      ok: false,
      disabled: true,
      rows: [],
      error: "Schedule image extraction is not configured in this local server. Use the deployed backend to test AI image extraction."
    });
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
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Analytics events require POST" });
      return;
    }
    if (!String(req.headers["content-type"] || "").toLowerCase().includes("application/json")) {
      sendJson(res, 415, { error: "Analytics events require application/json" });
      return;
    }
    readJsonBody(req)
      .then(body => {
        if (!body || typeof body !== "object" || !["view", "duration"].includes(String(body.type || ""))) {
          sendJson(res, 400, { error: "Invalid analytics event" });
          return;
        }
        recordAnalyticsEvent(body);
        res.writeHead(204, { "Cache-Control": "no-store", ...corsHeaders(req) });
        res.end();
      })
      .catch(error => sendJson(res, 400, { error: error.message || "Invalid JSON" }));
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
        sendFile(res, route.filePath + ".html", urlPath, route.currentView, req.url);
      });
    }
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 Not Found: " + urlPath);
      return;
    }
    sendFile(res, route.filePath, urlPath, route.currentView, req.url);
  });
}

const server = http.createServer((req, res) => {
  try {
    handleRequest(req, res);
  } catch (err) {
    console.error("[server] request handler error:", err && err.stack || err);
    try {
      if (!res.headersSent) sendJson(res, 500, { error: "Internal server error" }, req);
      else res.end();
    } catch {}
  }
});

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error(`\n  Port ${PORT} is already in use — stop the other server or run with PORT=<n>.\n`);
    process.exit(1);
  }
  console.error("[server] listen error:", err && err.stack || err);
});

server.listen(PORT, HOST, () => {
  console.log(`\n  PHS Schedule site → http://${HOST}:${PORT}`);
  console.log(`  Local grass view → http://${HOST}:${PORT}/grass\n`);
});
