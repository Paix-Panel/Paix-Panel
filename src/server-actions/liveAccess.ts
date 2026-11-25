"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import {
  getLiveAccessConfig,
  getLiveAccessPublicState,
  refreshLiveSyncScheduler,
  runLiveAccessSync,
  saveLiveAccessConfig,
  validateLiveHostname,
  validateWebhookUrl,
  type AccessMode,
  type LiveAccessPublicState,
  type LiveAccessStatus,
  type NoIpProvider,
} from "@/lib/liveAccess";

export type LiveAccessActionResult =
  | {
      ok: true;
      state: LiveAccessPublicState;
      message?: string;
    }
  | {
      ok: false;
      error: string;
    };

export type LiveSyncActionResult =
  | {
      ok: true;
      status: LiveAccessStatus;
    }
  | {
      ok: false;
      error: string;
      status?: LiveAccessStatus;
    };

const VALID_PROVIDERS: readonly NoIpProvider[] = [
  "noip",
  "cloudflare_ddns",
  "cloudflare_tunnel",
  "custom_webhook",
];

export async function saveLiveAccessAction(
  _prev: LiveAccessActionResult | null,
  fd: FormData,
): Promise<LiveAccessActionResult> {
  const s = await requirePermission("settings");
  const current = getLiveAccessConfig().cfg;

  const rawMode = String(fd.get("mode") ?? "ip").trim().toLowerCase();
  const mode: AccessMode = rawMode === "noip" ? "noip" : "ip";

  const rawProvider = String(fd.get("provider") ?? current.provider)
    .trim()
    .toLowerCase();
  const provider: NoIpProvider = (VALID_PROVIDERS as readonly string[]).includes(
    rawProvider,
  )
    ? (rawProvider as NoIpProvider)
    : current.provider;

  const hostnameInput = fd.get("hostname");
  const hostname =
    hostnameInput !== null
      ? String(hostnameInput).trim().toLowerCase()
      : current.hostname;

  const usernameInput = fd.get("username");
  const username =
    usernameInput !== null ? String(usernameInput).trim() : current.username;

  const passwordInput = String(fd.get("password") ?? "").trim();
  const password = passwordInput || current.password;

  const cfZoneInput = fd.get("cf_zone_id");
  const cfZoneId =
    cfZoneInput !== null ? String(cfZoneInput).trim() : current.cfZoneId;

  const cfTokenInput = String(fd.get("cf_api_token") ?? "").trim();
  const cfApiToken = cfTokenInput || current.cfApiToken;

  const cfProxied =
    fd.has("cf_proxied_present")
      ? fd.get("cf_proxied") === "on"
      : current.cfProxied;

  const cfTunnelInput = String(fd.get("cf_tunnel_token") ?? "").trim();
  const cfTunnelToken = cfTunnelInput || current.cfTunnelToken;

  const webhookInput = String(fd.get("webhook_url") ?? "").trim();
  const webhookUrl = webhookInput || current.webhookUrl;

  const intervalRaw = Number(fd.get("interval_minutes") ?? current.intervalMinutes);
  const intervalMinutes = Number.isFinite(intervalRaw)
    ? Math.min(60, Math.max(1, Math.round(intervalRaw)))
    : current.intervalMinutes;

  const autoSync = fd.has("auto_sync_present")
    ? fd.get("auto_sync") === "on"
    : current.autoSync;

  const syncNow = fd.get("sync_now") === "1";

  if (mode === "noip") {
    if (provider === "noip") {
      const hostErr = validateLiveHostname(hostname);
      if (hostErr) return { ok: false, error: hostErr };
      if (!username) {
        return { ok: false, error: "No-IP username, email, or DDNS key is required." };
      }
      if (!password) {
        return { ok: false, error: "No-IP password or DDNS key secret is required." };
      }
    } else if (provider === "cloudflare_ddns") {
      const hostErr = validateLiveHostname(hostname);
      if (hostErr) return { ok: false, error: hostErr };
      if (!cfZoneId) {
        return { ok: false, error: "Cloudflare Zone ID is required." };
      }
      if (!cfApiToken) {
        return { ok: false, error: "Cloudflare API Token (Zone:DNS:Edit) is required." };
      }
    } else if (provider === "cloudflare_tunnel") {
      if (hostname) {
        const hostErr = validateLiveHostname(hostname);
        if (hostErr) return { ok: false, error: hostErr };
      }
      if (!cfTunnelToken) {
        return { ok: false, error: "Cloudflare Tunnel Token is required." };
      }
    } else if (provider === "custom_webhook") {
      const urlErr = validateWebhookUrl(webhookUrl);
      if (urlErr) return { ok: false, error: urlErr };
      if (hostname) {
        const hostErr = validateLiveHostname(hostname);
        if (hostErr) return { ok: false, error: hostErr };
      }
    }
  }

  saveLiveAccessConfig({
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
  });

  refreshLiveSyncScheduler();

  let message =
    mode === "ip"
      ? "Switched to Direct IP mode."
      : `Saved No-IP Live mode (${provider.replace(/_/g, " ")}).`;

  if (syncNow) {
    const syncRes = await runLiveAccessSync({ force: true });
    message = syncRes.status.lastMessage || message;
    if (!syncRes.ok) {
      writeAudit({
        actorId: s.userId,
        action: "settings.live_access.save",
        target: `${mode}:${provider}`,
        result: "error",
        message: syncRes.status.lastMessage,
      });
      revalidatePath("/settings");
      revalidatePath("/setup");
      revalidatePath("/dashboard");
      return {
        ok: false,
        error: `Settings saved, but live sync failed: ${syncRes.status.lastMessage}`,
      };
    }
  } else {
    // Update IP status snapshot when switching to IP mode
    if (mode === "ip") {
      await runLiveAccessSync({ force: false }).catch(() => {});
    }
  }

  writeAudit({
    actorId: s.userId,
    action: "settings.live_access.save",
    target: `${mode}:${provider}${hostname ? `:${hostname}` : ""}`,
    result: "ok",
    message,
  });

  revalidatePath("/settings");
  revalidatePath("/setup");
  revalidatePath("/dashboard");

  return {
    ok: true,
    state: getLiveAccessPublicState(),
    message,
  };
}

export async function syncLiveAccessNowAction(): Promise<LiveSyncActionResult> {
  const s = await requirePermission("settings");
  const res = await runLiveAccessSync({ force: true });
  writeAudit({
    actorId: s.userId,
    action: "settings.live_access.sync",
    result: res.ok ? "ok" : "error",
    message: res.status.lastMessage,
  });
  revalidatePath("/settings");
  revalidatePath("/setup");
  revalidatePath("/dashboard");
  if (!res.ok) {
    return { ok: false, error: res.status.lastMessage, status: res.status };
  }
  return { ok: true, status: res.status };
}
