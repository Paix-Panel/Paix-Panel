import "server-only";
import { getSetting, setSetting } from "./settings";

export type AccessMode = "ip" | "noip";
export type NoIpProvider =
  | "noip"
  | "cloudflare_ddns"
  | "cloudflare_tunnel"
  | "custom_webhook";

export type LiveAccessConfig = {
  mode: AccessMode;
  provider: NoIpProvider;
  hostname: string;
  username: string;
  password: string;
  cfZoneId: string;
  cfApiToken: string;
  cfProxied: boolean;
  cfTunnelToken: string;
  webhookUrl: string;
  intervalMinutes: number;
  autoSync: boolean;
};

export type LiveAccessStatus = {
  lastIp: string | null;
  lastSyncAt: string | null;
  lastSyncResult: "ok" | "updated" | "noop" | "error" | "idle";
  lastMessage: string;
};

export type LiveAccessPublicState = {
  mode: AccessMode;
  provider: NoIpProvider;
  hostname: string;
  username: string;
  hasPassword: boolean;
  cfZoneId: string;
  hasCfApiToken: boolean;
  cfProxied: boolean;
  hasCfTunnelToken: boolean;
  hasWebhookUrl: boolean;
  webhookPreview: string;
  intervalMinutes: number;
  autoSync: boolean;
  source: "database" | "env" | "default";
  status: LiveAccessStatus;
};

const CONFIG_KEY = "network.live_access";
const STATUS_KEY = "network.live_status";

const VALID_PROVIDERS: readonly NoIpProvider[] = [
  "noip",
  "cloudflare_ddns",
  "cloudflare_tunnel",
  "custom_webhook",
];

function normalizeProvider(raw: unknown): NoIpProvider {
  if (typeof raw === "string") {
    const cleaned = raw.trim().toLowerCase().replace(/-/g, "_");
    if ((VALID_PROVIDERS as readonly string[]).includes(cleaned)) {
      return cleaned as NoIpProvider;
    }
  }
  return "noip";
}

function clampInterval(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 2;
  return Math.min(60, Math.max(1, Math.round(n)));
}

function defaultConfigFromEnv(): { cfg: LiveAccessConfig; source: "env" | "default" } {
  const rawMode = (process.env.NETWORK_ACCESS_MODE ?? "").trim().toLowerCase();
  const mode: AccessMode = rawMode === "noip" ? "noip" : "ip";
  const provider = normalizeProvider(process.env.NOIP_PROVIDER);
  const hostname = (process.env.NOIP_HOSTNAME ?? "").trim().toLowerCase();
  const username = (process.env.NOIP_USERNAME ?? "").trim();
  const password = (process.env.NOIP_PASSWORD ?? "").trim();
  const cfZoneId = (process.env.CF_ZONE_ID ?? "").trim();
  const cfApiToken = (process.env.CF_API_TOKEN ?? "").trim();
  const cfProxied = (process.env.CF_PROXIED ?? "false").trim().toLowerCase() === "true";
  const cfTunnelToken = (process.env.CF_TUNNEL_TOKEN ?? "").trim();
  const webhookUrl = (process.env.DDNS_WEBHOOK_URL ?? "").trim();
  const intervalMinutes = clampInterval(process.env.LIVE_SYNC_INTERVAL_MINUTES ?? 2);
  const autoSync = (process.env.LIVE_SYNC_AUTO ?? "1").trim() !== "0";

  const hasEnv = Boolean(
    rawMode ||
      hostname ||
      username ||
      password ||
      cfZoneId ||
      cfApiToken ||
      cfTunnelToken ||
      webhookUrl,
  );

  return {
    cfg: {
      mode,
      provider,
      hostname,
      username,
      password,
      cfZoneId,
      cfApiToken,
      cfProxied,
      cfTunnelToken,
      webhookUrl,
      intervalMinutes,
      autoSync,
    },
    source: hasEnv ? "env" : "default",
  };
}

export function getLiveAccessConfig(): {
  cfg: LiveAccessConfig;
  source: "database" | "env" | "default";
} {
  const raw = getSetting(CONFIG_KEY, "");
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<LiveAccessConfig>;
      const envFallback = defaultConfigFromEnv().cfg;
      return {
        cfg: {
          mode: parsed.mode === "noip" ? "noip" : "ip",
          provider: normalizeProvider(parsed.provider ?? envFallback.provider),
          hostname:
            typeof parsed.hostname === "string"
              ? parsed.hostname.trim().toLowerCase()
              : envFallback.hostname,
          username:
            typeof parsed.username === "string"
              ? parsed.username.trim()
              : envFallback.username,
          password:
            typeof parsed.password === "string"
              ? parsed.password
              : envFallback.password,
          cfZoneId:
            typeof parsed.cfZoneId === "string"
              ? parsed.cfZoneId.trim()
              : envFallback.cfZoneId,
          cfApiToken:
            typeof parsed.cfApiToken === "string"
              ? parsed.cfApiToken.trim()
              : envFallback.cfApiToken,
          cfProxied:
            typeof parsed.cfProxied === "boolean"
              ? parsed.cfProxied
              : envFallback.cfProxied,
          cfTunnelToken:
            typeof parsed.cfTunnelToken === "string"
              ? parsed.cfTunnelToken.trim()
              : envFallback.cfTunnelToken,
          webhookUrl:
            typeof parsed.webhookUrl === "string"
              ? parsed.webhookUrl.trim()
              : envFallback.webhookUrl,
          intervalMinutes: clampInterval(
            parsed.intervalMinutes ?? envFallback.intervalMinutes,
          ),
          autoSync:
            typeof parsed.autoSync === "boolean"
              ? parsed.autoSync
              : envFallback.autoSync,
        },
        source: "database",
      };
    } catch {
      // fall through to env/default
    }
  }
  return defaultConfigFromEnv();
}

export function saveLiveAccessConfig(cfg: LiveAccessConfig): void {
  setSetting(CONFIG_KEY, JSON.stringify(cfg));
}

export function getLiveAccessStatus(): LiveAccessStatus {
  const raw = getSetting(STATUS_KEY, "");
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<LiveAccessStatus>;
      return {
        lastIp: typeof parsed.lastIp === "string" && parsed.lastIp ? parsed.lastIp : null,
        lastSyncAt:
          typeof parsed.lastSyncAt === "string" && parsed.lastSyncAt
            ? parsed.lastSyncAt
            : null,
        lastSyncResult:
          parsed.lastSyncResult === "ok" ||
          parsed.lastSyncResult === "updated" ||
          parsed.lastSyncResult === "noop" ||
          parsed.lastSyncResult === "error"
            ? parsed.lastSyncResult
            : "idle",
        lastMessage:
          typeof parsed.lastMessage === "string" ? parsed.lastMessage : "",
      };
    } catch {
      // ignore malformed
    }
  }
  return {
    lastIp: process.env.PUBLIC_IP?.trim() || null,
    lastSyncAt: null,
    lastSyncResult: "idle",
    lastMessage: "Not synced yet.",
  };
}

export function saveLiveAccessStatus(status: LiveAccessStatus): void {
  setSetting(STATUS_KEY, JSON.stringify(status));
}

function maskWebhookUrl(url: string): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return "(configured)";
  }
}

export function getLiveAccessPublicState(): LiveAccessPublicState {
  const { cfg, source } = getLiveAccessConfig();
  const status = getLiveAccessStatus();
  return {
    mode: cfg.mode,
    provider: cfg.provider,
    hostname: cfg.hostname,
    username: cfg.username,
    hasPassword: cfg.password.length > 0,
    cfZoneId: cfg.cfZoneId,
    hasCfApiToken: cfg.cfApiToken.length > 0,
    cfProxied: cfg.cfProxied,
    hasCfTunnelToken: cfg.cfTunnelToken.length > 0,
    hasWebhookUrl: cfg.webhookUrl.length > 0,
    webhookPreview: maskWebhookUrl(cfg.webhookUrl),
    intervalMinutes: cfg.intervalMinutes,
    autoSync: cfg.autoSync,
    source,
    status,
  };
}

export function validateLiveHostname(raw: string): string | null {
  const host = raw.trim().toLowerCase();
  if (!host) return "Hostname is required for No-IP / Dynamic Live mode.";
  if (host.length > 253) return "Hostname is too long.";
  if (!host.includes(".")) return "Hostname must include a dot (e.g. myserver.ddns.net).";
  if (/^[0-9.]+$/.test(host)) return "Hostname cannot be an IP address.";
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(host)) {
    return "Hostname contains invalid characters.";
  }
  return null;
}

export function validateWebhookUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "Webhook URL is required.";
  let u: URL;
  try {
    u = new URL(trimmed.replace(/\{ip\}/g, "1.1.1.1").replace(/\{host\}/g, "example.com"));
  } catch {
    return "Invalid webhook URL.";
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    return "Webhook URL must start with https:// or http://.";
  }
  const h = u.hostname.toLowerCase();
  if (
    h === "localhost" ||
    h.endsWith(".local") ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    h === "::1"
  ) {
    return "Webhook URL cannot point to loopback or private network addresses.";
  }
  return null;
}

function isIpv4OrV6(ip: string): boolean {
  return (
    /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) ||
    (/^[0-9a-fA-F:]+$/.test(ip) && ip.includes(":"))
  );
}

let cachedIp: { value: string; expiresAt: number } | null = null;

export async function detectPublicIp(force = false): Promise<string | null> {
  const now = Date.now();
  if (!force && cachedIp && cachedIp.expiresAt > now) {
    return cachedIp.value;
  }
  const endpoints = [
    "https://api.ipify.org",
    "https://icanhazip.com",
    "https://ifconfig.me/ip",
  ];
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(3500),
        cache: "no-store",
        headers: { "User-Agent": "PaixPanel-LiveSync/1.0" },
      });
      if (!res.ok) continue;
      const text = (await res.text()).trim();
      if (isIpv4OrV6(text)) {
        cachedIp = { value: text, expiresAt: now + 30_000 };
        return text;
      }
    } catch {
      // try next IP probe
    }
  }
  return process.env.PUBLIC_IP?.trim() || null;
}

export async function runLiveAccessSync(opts?: {
  force?: boolean;
}): Promise<{ ok: boolean; status: LiveAccessStatus }> {
  const { cfg } = getLiveAccessConfig();
  const prev = getLiveAccessStatus();
  const nowIso = new Date().toISOString();
  const detectedIp = await detectPublicIp(Boolean(opts?.force));

  if (cfg.mode === "ip") {
    const status: LiveAccessStatus = {
      lastIp: detectedIp ?? prev.lastIp,
      lastSyncAt: nowIso,
      lastSyncResult: "ok",
      lastMessage: detectedIp
        ? `IP mode active. Current public IP: ${detectedIp}.`
        : "IP mode active (direct server IP).",
    };
    saveLiveAccessStatus(status);
    return { ok: true, status };
  }

  if (cfg.provider === "cloudflare_tunnel") {
    const status: LiveAccessStatus = {
      lastIp: detectedIp ?? prev.lastIp,
      lastSyncAt: nowIso,
      lastSyncResult: cfg.cfTunnelToken ? "ok" : "error",
      lastMessage: cfg.cfTunnelToken
        ? `Cloudflare Tunnel active for ${cfg.hostname || "panel"} (works behind hotspot/CGNAT even when IP ${detectedIp ?? "unknown"} changes).`
        : "Cloudflare Tunnel token is missing.",
    };
    saveLiveAccessStatus(status);
    return { ok: Boolean(cfg.cfTunnelToken), status };
  }

  if (!detectedIp) {
    const status: LiveAccessStatus = {
      lastIp: prev.lastIp,
      lastSyncAt: nowIso,
      lastSyncResult: "error",
      lastMessage: "Could not detect the server's current public IP address.",
    };
    saveLiveAccessStatus(status);
    return { ok: false, status };
  }

  if (!opts?.force && prev.lastIp === detectedIp && (prev.lastSyncResult === "ok" || prev.lastSyncResult === "updated" || prev.lastSyncResult === "noop")) {
    const status: LiveAccessStatus = {
      lastIp: detectedIp,
      lastSyncAt: nowIso,
      lastSyncResult: "noop",
      lastMessage: `IP unchanged (${detectedIp}) — ${cfg.hostname || "server"} is live.`,
    };
    saveLiveAccessStatus(status);
    return { ok: true, status };
  }

  try {
    if (cfg.provider === "noip") {
      if (!cfg.hostname || !cfg.username || !cfg.password) {
        throw new Error("No-IP hostname, username/key, and password are required.");
      }
      const url = new URL("https://dynupdate.no-ip.com/nic/update");
      url.searchParams.set("hostname", cfg.hostname);
      url.searchParams.set("myip", detectedIp);
      const auth = Buffer.from(`${cfg.username}:${cfg.password}`).toString("base64");
      const res = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Basic ${auth}`,
          "User-Agent": "PaixPanel-LiveSync/1.0 support@paixpanel.local",
        },
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
      const body = (await res.text()).trim();
      if (!res.ok) {
        throw new Error(`No-IP HTTP ${res.status}: ${body || res.statusText}`);
      }
      if (body.startsWith("good")) {
        const status: LiveAccessStatus = {
          lastIp: detectedIp,
          lastSyncAt: nowIso,
          lastSyncResult: "updated",
          lastMessage: `No-IP updated ${cfg.hostname} → ${detectedIp}.`,
        };
        saveLiveAccessStatus(status);
        return { ok: true, status };
      }
      if (body.startsWith("nochg")) {
        const status: LiveAccessStatus = {
          lastIp: detectedIp,
          lastSyncAt: nowIso,
          lastSyncResult: "noop",
          lastMessage: `No-IP confirmed ${cfg.hostname} is already at ${detectedIp}.`,
        };
        saveLiveAccessStatus(status);
        return { ok: true, status };
      }
      throw new Error(`No-IP returned "${body}"`);
    }

    if (cfg.provider === "cloudflare_ddns") {
      if (!cfg.hostname || !cfg.cfZoneId || !cfg.cfApiToken) {
        throw new Error("Cloudflare Zone ID, API Token, and Hostname are required.");
      }
      const recordType = detectedIp.includes(":") ? "AAAA" : "A";
      const listUrl = new URL(
        `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(cfg.cfZoneId)}/dns_records`,
      );
      listUrl.searchParams.set("type", recordType);
      listUrl.searchParams.set("name", cfg.hostname);

      const listRes = await fetch(listUrl.toString(), {
        headers: {
          Authorization: `Bearer ${cfg.cfApiToken}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
      const listJson = (await listRes.json()) as {
        success?: boolean;
        errors?: Array<{ message?: string }>;
        result?: Array<{ id: string; content: string; proxied?: boolean }>;
      };
      if (!listRes.ok || !listJson.success) {
        const msg = listJson.errors?.[0]?.message ?? listRes.statusText;
        throw new Error(`Cloudflare lookup failed: ${msg}`);
      }

      const existing = listJson.result?.[0];
      if (existing && existing.content === detectedIp && Boolean(existing.proxied) === cfg.cfProxied) {
        const status: LiveAccessStatus = {
          lastIp: detectedIp,
          lastSyncAt: nowIso,
          lastSyncResult: "noop",
          lastMessage: `Cloudflare ${recordType} record for ${cfg.hostname} already points to ${detectedIp}.`,
        };
        saveLiveAccessStatus(status);
        return { ok: true, status };
      }

      const targetUrl = existing
        ? `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(cfg.cfZoneId)}/dns_records/${encodeURIComponent(existing.id)}`
        : `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(cfg.cfZoneId)}/dns_records`;

      const writeRes = await fetch(targetUrl, {
        method: existing ? "PUT" : "POST",
        headers: {
          Authorization: `Bearer ${cfg.cfApiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: recordType,
          name: cfg.hostname,
          content: detectedIp,
          ttl: 120,
          proxied: cfg.cfProxied,
        }),
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
      const writeJson = (await writeRes.json()) as {
        success?: boolean;
        errors?: Array<{ message?: string }>;
      };
      if (!writeRes.ok || !writeJson.success) {
        const msg = writeJson.errors?.[0]?.message ?? writeRes.statusText;
        throw new Error(`Cloudflare update failed: ${msg}`);
      }

      const status: LiveAccessStatus = {
        lastIp: detectedIp,
        lastSyncAt: nowIso,
        lastSyncResult: "updated",
        lastMessage: `Cloudflare ${existing ? "updated" : "created"} ${cfg.hostname} (${recordType}) → ${detectedIp}.`,
      };
      saveLiveAccessStatus(status);
      return { ok: true, status };
    }

    if (cfg.provider === "custom_webhook") {
      const urlErr = validateWebhookUrl(cfg.webhookUrl);
      if (urlErr) throw new Error(urlErr);
      const target = cfg.webhookUrl
        .replace(/\{ip\}/g, encodeURIComponent(detectedIp))
        .replace(/\{host\}/g, encodeURIComponent(cfg.hostname));
      const res = await fetch(target, {
        method: "GET",
        headers: { "User-Agent": "PaixPanel-LiveSync/1.0" },
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
      const body = (await res.text()).trim().slice(0, 140);
      if (!res.ok) {
        throw new Error(`Webhook HTTP ${res.status}: ${body || res.statusText}`);
      }
      const status: LiveAccessStatus = {
        lastIp: detectedIp,
        lastSyncAt: nowIso,
        lastSyncResult: "updated",
        lastMessage: `DDNS webhook synced ${detectedIp}${body ? ` (${body})` : ""}.`,
      };
      saveLiveAccessStatus(status);
      return { ok: true, status };
    }

    throw new Error(`Unsupported provider: ${cfg.provider}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status: LiveAccessStatus = {
      lastIp: detectedIp,
      lastSyncAt: nowIso,
      lastSyncResult: "error",
      lastMessage: msg,
    };
    saveLiveAccessStatus(status);
    return { ok: false, status };
  }
}

const g = globalThis as unknown as {
  __paixLiveSyncTimer?: ReturnType<typeof setInterval> | null;
};

export function refreshLiveSyncScheduler(): void {
  if (g.__paixLiveSyncTimer) {
    clearInterval(g.__paixLiveSyncTimer);
    g.__paixLiveSyncTimer = null;
  }

  let cfg: LiveAccessConfig;
  try {
    cfg = getLiveAccessConfig().cfg;
  } catch {
    return;
  }

  if (cfg.mode !== "noip" || !cfg.autoSync || cfg.provider === "cloudflare_tunnel") {
    return;
  }

  const ms = clampInterval(cfg.intervalMinutes) * 60_000;
  g.__paixLiveSyncTimer = setInterval(() => {
    void runLiveAccessSync({ force: false }).catch(() => {
      // background sync errors are persisted into network.live_status
    });
  }, ms);
  if (typeof g.__paixLiveSyncTimer === "object" && "unref" in g.__paixLiveSyncTimer) {
    g.__paixLiveSyncTimer.unref();
  }
}

export function startLiveSyncScheduler(): void {
  refreshLiveSyncScheduler();
}
