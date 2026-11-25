#!/usr/bin/env node
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function loadEnvFile(path) {
  if (!fs.existsSync(path)) return;
  const lines = fs.readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  }
}

loadEnvFile("/etc/vps-panel/.env");

const DB_PATH = process.env.PANEL_DB_PATH || "/var/lib/vps-panel/panel.db";

function openDb() {
  if (!fs.existsSync(DB_PATH)) return null;
  try {
    const Database = require("/opt/vps-panel/app/node_modules/better-sqlite3");
    const db = new Database(DB_PATH);
    db.pragma("busy_timeout = 5000");
    return db;
  } catch {
    return null;
  }
}

function readConfig(db) {
  const fromEnv = {
    mode: (process.env.NETWORK_ACCESS_MODE || "ip").trim().toLowerCase() === "noip" ? "noip" : "ip",
    provider: (process.env.NOIP_PROVIDER || "noip").trim().toLowerCase().replace(/-/g, "_"),
    hostname: (process.env.NOIP_HOSTNAME || "").trim().toLowerCase(),
    username: (process.env.NOIP_USERNAME || "").trim(),
    password: (process.env.NOIP_PASSWORD || "").trim(),
    cfZoneId: (process.env.CF_ZONE_ID || "").trim(),
    cfApiToken: (process.env.CF_API_TOKEN || "").trim(),
    cfProxied: (process.env.CF_PROXIED || "false").trim().toLowerCase() === "true",
    cfTunnelToken: (process.env.CF_TUNNEL_TOKEN || "").trim(),
    webhookUrl: (process.env.DDNS_WEBHOOK_URL || "").trim(),
    autoSync: (process.env.LIVE_SYNC_AUTO || "1").trim() !== "0",
  };
  if (!db) return fromEnv;
  try {
    const row = db
      .prepare(`SELECT value FROM settings WHERE key = 'network.live_access'`)
      .get();
    if (!row?.value) return fromEnv;
    const parsed = JSON.parse(row.value);
    return { ...fromEnv, ...parsed };
  } catch {
    return fromEnv;
  }
}

function readPrevStatus(db) {
  if (!db) return {};
  try {
    const row = db
      .prepare(`SELECT value FROM settings WHERE key = 'network.live_status'`)
      .get();
    return row?.value ? JSON.parse(row.value) : {};
  } catch {
    return {};
  }
}

function saveStatus(db, status) {
  if (!db) return;
  try {
    db.prepare(
      `INSERT INTO settings (key, value) VALUES ('network.live_status', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(JSON.stringify(status));
  } catch {
    // ignore
  }
}

async function detectIp() {
  for (const url of [
    "https://api.ipify.org",
    "https://icanhazip.com",
    "https://ifconfig.me/ip",
  ]) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(3500),
        headers: { "User-Agent": "PaixPanel-LiveSync/1.0" },
      });
      if (!res.ok) continue;
      const ip = (await res.text()).trim();
      if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip) || (ip.includes(":") && /^[0-9a-fA-F:]+$/.test(ip))) {
        return ip;
      }
    } catch {
      // try next probe
    }
  }
  return null;
}

async function main() {
  const db = openDb();
  const cfg = readConfig(db);
  if (cfg.mode !== "noip" || !cfg.autoSync || cfg.provider === "cloudflare_tunnel") {
    db?.close();
    return;
  }

  const prev = readPrevStatus(db);
  const ip = await detectIp();
  const nowIso = new Date().toISOString();
  if (!ip) {
    saveStatus(db, {
      lastIp: prev.lastIp ?? null,
      lastSyncAt: nowIso,
      lastSyncResult: "error",
      lastMessage: "Background sync could not detect public IP.",
    });
    db?.close();
    return;
  }

  if (prev.lastIp === ip && (prev.lastSyncResult === "ok" || prev.lastSyncResult === "updated" || prev.lastSyncResult === "noop")) {
    db?.close();
    return;
  }

  try {
    if (cfg.provider === "noip" && cfg.hostname && cfg.username && cfg.password) {
      const url = new URL("https://dynupdate.no-ip.com/nic/update");
      url.searchParams.set("hostname", cfg.hostname);
      url.searchParams.set("myip", ip);
      const auth = Buffer.from(`${cfg.username}:${cfg.password}`).toString("base64");
      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Basic ${auth}`,
          "User-Agent": "PaixPanel-LiveSync/1.0 support@paixpanel.local",
        },
        signal: AbortSignal.timeout(8000),
      });
      const body = (await res.text()).trim();
      if (!res.ok || (!body.startsWith("good") && !body.startsWith("nochg"))) {
        throw new Error(`No-IP sync failed: ${body || res.status}`);
      }
      saveStatus(db, {
        lastIp: ip,
        lastSyncAt: nowIso,
        lastSyncResult: body.startsWith("good") ? "updated" : "noop",
        lastMessage: `No-IP synced ${cfg.hostname} → ${ip}.`,
      });
    } else if (cfg.provider === "cloudflare_ddns" && cfg.hostname && cfg.cfZoneId && cfg.cfApiToken) {
      const type = ip.includes(":") ? "AAAA" : "A";
      const listUrl = `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(cfg.cfZoneId)}/dns_records?type=${type}&name=${encodeURIComponent(cfg.hostname)}`;
      const listRes = await fetch(listUrl, {
        headers: { Authorization: `Bearer ${cfg.cfApiToken}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      const listJson = await listRes.json();
      if (!listRes.ok || !listJson.success) {
        throw new Error(listJson.errors?.[0]?.message || "Cloudflare lookup failed");
      }
      const existing = listJson.result?.[0];
      const targetUrl = existing
        ? `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(cfg.cfZoneId)}/dns_records/${encodeURIComponent(existing.id)}`
        : `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(cfg.cfZoneId)}/dns_records`;
      const writeRes = await fetch(targetUrl, {
        method: existing ? "PUT" : "POST",
        headers: { Authorization: `Bearer ${cfg.cfApiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          name: cfg.hostname,
          content: ip,
          ttl: 120,
          proxied: Boolean(cfg.cfProxied),
        }),
        signal: AbortSignal.timeout(8000),
      });
      const writeJson = await writeRes.json();
      if (!writeRes.ok || !writeJson.success) {
        throw new Error(writeJson.errors?.[0]?.message || "Cloudflare update failed");
      }
      saveStatus(db, {
        lastIp: ip,
        lastSyncAt: nowIso,
        lastSyncResult: "updated",
        lastMessage: `Cloudflare updated ${cfg.hostname} → ${ip}.`,
      });
    } else if (cfg.provider === "custom_webhook" && cfg.webhookUrl) {
      const target = cfg.webhookUrl
        .replace(/\{ip\}/g, encodeURIComponent(ip))
        .replace(/\{host\}/g, encodeURIComponent(cfg.hostname || ""));
      const res = await fetch(target, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`Webhook HTTP ${res.status}`);
      saveStatus(db, {
        lastIp: ip,
        lastSyncAt: nowIso,
        lastSyncResult: "updated",
        lastMessage: `DDNS webhook synced ${ip}.`,
      });
    }
  } catch (err) {
    saveStatus(db, {
      lastIp: ip,
      lastSyncAt: nowIso,
      lastSyncResult: "error",
      lastMessage: err instanceof Error ? err.message : String(err),
    });
  } finally {
    db?.close();
  }
}

void main();
