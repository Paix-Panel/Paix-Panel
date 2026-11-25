"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe, Radio, RefreshCw, Server, ShieldCheck } from "lucide-react";
import styles from "@/components/page.module.css";
import StatusBadge from "@/components/StatusBadge/StatusBadge";
import type {
  AccessMode,
  LiveAccessPublicState,
  LiveAccessStatus,
  NoIpProvider,
} from "@/lib/liveAccess";
import type {
  LiveAccessActionResult,
  LiveSyncActionResult,
} from "@/server-actions/liveAccess";
import local from "./LiveAccessForm.module.css";

const PROVIDER_OPTIONS: Array<{
  id: NoIpProvider;
  label: string;
  summary: string;
}> = [
  {
    id: "noip",
    label: "No-IP.com DDNS",
    summary:
      "Updates your No-IP hostname (e.g. myserver.ddns.net) automatically whenever your public IP changes.",
  },
  {
    id: "cloudflare_ddns",
    label: "Cloudflare DDNS",
    summary:
      "Updates your Cloudflare DNS A/AAAA record automatically using a Zone:DNS:Edit API Token.",
  },
  {
    id: "cloudflare_tunnel",
    label: "Cloudflare Tunnel",
    summary:
      "Best for mobile hotspot, shared internet, or CGNAT: opens an outbound tunnel to Cloudflare without needing open ports or static IP.",
  },
  {
    id: "custom_webhook",
    label: "Custom DDNS URL",
    summary:
      "Calls any dynamic DNS endpoint (DuckDNS, Dynu, Afraid.org, etc.) using {ip} and {host} placeholders.",
  },
];

export default function LiveAccessForm({
  initial,
  detectedIp,
  panelHost,
  saveAction,
  syncAction,
  variant = "settings",
  onSaved,
}: {
  initial: LiveAccessPublicState;
  detectedIp: string | null;
  panelHost?: string;
  saveAction: (
    prev: LiveAccessActionResult | null,
    fd: FormData,
  ) => Promise<LiveAccessActionResult>;
  syncAction: () => Promise<LiveSyncActionResult>;
  variant?: "settings" | "wizard";
  onSaved?: (state: LiveAccessPublicState) => void;
}) {
  const router = useRouter();
  const [liveState, setLiveState] = useState<LiveAccessPublicState>(initial);
  const [mode, setMode] = useState<AccessMode>(initial.mode);
  const [provider, setProvider] = useState<NoIpProvider>(initial.provider);
  const [status, setStatus] = useState<LiveAccessStatus>(initial.status);
  const [syncNowFlag, setSyncNowFlag] = useState<"0" | "1">("0");
  const [syncPending, startSync] = useTransition();
  const [syncError, setSyncError] = useState<string | null>(null);

  const [formResult, formAction, savePending] = useActionState<
    LiveAccessActionResult | null,
    FormData
  >(saveAction, null);

  useEffect(() => {
    setLiveState(initial);
    setMode(initial.mode);
    setProvider(initial.provider);
    setStatus(initial.status);
  }, [initial]);

  useEffect(() => {
    if (!formResult) return;
    if (formResult.ok) {
      setLiveState(formResult.state);
      setStatus(formResult.state.status);
      setSyncError(null);
      onSaved?.(formResult.state);
      router.refresh();
    }
  }, [formResult, onSaved, router]);

  const handleManualSync = () => {
    setSyncError(null);
    startSync(async () => {
      const r = await syncAction();
      if (r.status) setStatus(r.status);
      if (!r.ok) {
        setSyncError(r.error);
      } else {
        router.refresh();
      }
    });
  };

  const displayIp = status.lastIp ?? detectedIp;
  const activeProviderMeta =
    PROVIDER_OPTIONS.find((p) => p.id === provider) ?? PROVIDER_OPTIONS[0];

  const statusTone: "ok" | "warn" | "danger" | "info" =
    status.lastSyncResult === "error"
      ? "danger"
      : liveState.mode === "noip"
        ? "ok"
        : "info";

  const statusText =
    liveState.mode === "noip"
      ? status.lastSyncResult === "error"
        ? "No-IP Sync Error"
        : "No-IP Live"
      : "Direct IP Mode";

  return (
    <div>
      <div className={local.statusBar}>
        <div className={local.statusMeta}>
          <StatusBadge text={statusText} tone={statusTone} />
          <span>
            Public IP:{" "}
            <strong className={styles.code}>{displayIp ?? "unknown"}</strong>
          </span>
          {(liveState.hostname || panelHost) && (
            <span>
              Host:{" "}
              <strong className={styles.code}>
                {liveState.hostname || panelHost}
              </strong>
            </span>
          )}
          {status.lastSyncAt && (
            <span className={styles.muted}>
              Last check: {new Date(status.lastSyncAt).toLocaleString()}
            </span>
          )}
        </div>
        <button
          type="button"
          className={styles.btnGhost}
          onClick={handleManualSync}
          disabled={syncPending || savePending}
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <RefreshCw size={13} />
          {syncPending ? "Syncing..." : "Check / Sync Live IP"}
        </button>
      </div>

      {status.lastMessage && (
        <div
          className={
            status.lastSyncResult === "error" ? styles.error : styles.muted
          }
          style={{ fontSize: 12, marginBottom: 12 }}
        >
          {status.lastMessage}
        </div>
      )}
      {syncError && (
        <div className={styles.error} style={{ marginBottom: 12 }}>
          {syncError}
        </div>
      )}

      <form action={formAction}>
        <input type="hidden" name="mode" value={mode} />
        <input type="hidden" name="provider" value={provider} />
        <input type="hidden" name="sync_now" value={syncNowFlag} />

        <div className={local.modeGrid} role="radiogroup" aria-label="Server access mode">
          <button
            type="button"
            role="radio"
            aria-checked={mode === "ip"}
            className={`${local.modeCard} ${mode === "ip" ? local.modeCardActive : ""}`}
            onClick={() => setMode("ip")}
          >
            <div className={local.modeTitle}>
              <span className={local.modeTitleLeft}>
                <Server size={15} />
                IP Mode (Static / Direct)
              </span>
              {mode === "ip" && <StatusBadge text="Selected" tone="info" />}
            </div>
            <div className={local.modeDesc}>
              Use the server&apos;s direct IP or a fixed static DNS A-record. Best
              for cloud VPS servers with a permanent public IP.
            </div>
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={mode === "noip"}
            className={`${local.modeCard} ${mode === "noip" ? local.modeCardActive : ""}`}
            onClick={() => setMode("noip")}
          >
            <div className={local.modeTitle}>
              <span className={local.modeTitleLeft}>
                <Radio size={15} />
                No-IP Mode (Dynamic Live 24/7)
              </span>
              {mode === "noip" && <StatusBadge text="Selected" tone="ok" />}
            </div>
            <div className={local.modeDesc}>
              For shared internet, mobile hotspot, or changing ISP IPs.
              Auto-updates No-IP / Cloudflare DDNS or keeps a Cloudflare Tunnel
              online at all times.
            </div>
          </button>
        </div>

        {mode === "ip" && (
          <div className={local.hintBox}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <Globe size={14} />
              <strong>Direct IP Mode</strong>
            </div>
            Automatic DDNS updates are paused. Your saved No-IP / Cloudflare
            credentials remain stored safely so you can switch back to{" "}
            <strong>No-IP Mode</strong> anytime from Settings.
          </div>
        )}

        {mode === "noip" && (
          <div
            style={{
              padding: variant === "wizard" ? 12 : 14,
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
              background: "var(--bg-elev)",
              marginBottom: 12,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
              Choose Keep-Live Provider
            </div>
            <div className={local.providerRow}>
              {PROVIDER_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`${local.providerBtn} ${
                    provider === opt.id ? local.providerBtnActive : ""
                  }`}
                  onClick={() => setProvider(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className={local.hintBox}>{activeProviderMeta.summary}</div>

            {provider === "noip" && (
              <>
                <div className={styles.formRow}>
                  <label className={styles.field}>
                    No-IP Hostname
                    <input
                      name="hostname"
                      className={styles.input}
                      defaultValue={liveState.hostname}
                      placeholder="myserver.ddns.net"
                      required
                    />
                  </label>
                  <label className={styles.field}>
                    No-IP Username / Email / DDNS Key
                    <input
                      name="username"
                      className={styles.input}
                      defaultValue={liveState.username}
                      placeholder="username or ddns-key"
                      autoComplete="off"
                      required
                    />
                  </label>
                </div>
                <div className={styles.formRow}>
                  <label className={styles.field}>
                    No-IP Password / Key Secret{" "}
                    {liveState.hasPassword ? "(leave blank to keep existing)" : ""}
                    <input
                      name="password"
                      type="password"
                      className={styles.input}
                      placeholder={liveState.hasPassword ? "••••••••••••" : "Password or key"}
                      autoComplete="new-password"
                    />
                  </label>
                </div>
              </>
            )}

            {provider === "cloudflare_ddns" && (
              <>
                <div className={styles.formRow}>
                  <label className={styles.field}>
                    Cloudflare Record Hostname
                    <input
                      name="hostname"
                      className={styles.input}
                      defaultValue={liveState.hostname || panelHost || ""}
                      placeholder="panel.example.com"
                      required
                    />
                  </label>
                  <label className={styles.field}>
                    Cloudflare Zone ID
                    <input
                      name="cf_zone_id"
                      className={styles.input}
                      defaultValue={liveState.cfZoneId}
                      placeholder="32-char Cloudflare Zone ID"
                      autoComplete="off"
                      required
                    />
                  </label>
                </div>
                <div className={styles.formRow}>
                  <label className={styles.field}>
                    Cloudflare API Token (Zone:DNS:Edit){" "}
                    {liveState.hasCfApiToken ? "(leave blank to keep existing)" : ""}
                    <input
                      name="cf_api_token"
                      type="password"
                      className={styles.input}
                      placeholder={
                        liveState.hasCfApiToken ? "••••••••••••" : "Cloudflare API Token"
                      }
                      autoComplete="new-password"
                    />
                  </label>
                </div>
                <input type="hidden" name="cf_proxied_present" value="1" />
                <label className={styles.checkbox} style={{ marginBottom: 10 }}>
                  <input
                    type="checkbox"
                    name="cf_proxied"
                    defaultChecked={liveState.cfProxied}
                  />
                  Proxy traffic through Cloudflare (orange cloud)
                </label>
              </>
            )}

            {provider === "cloudflare_tunnel" && (
              <>
                <div className={styles.formRow}>
                  <label className={styles.field}>
                    Tunnel Hostname (on Cloudflare Zero Trust)
                    <input
                      name="hostname"
                      className={styles.input}
                      defaultValue={liveState.hostname || panelHost || ""}
                      placeholder="panel.example.com"
                    />
                  </label>
                  <label className={styles.field}>
                    Cloudflare Tunnel Token{" "}
                    {liveState.hasCfTunnelToken ? "(leave blank to keep existing)" : ""}
                    <input
                      name="cf_tunnel_token"
                      type="password"
                      className={styles.input}
                      placeholder={
                        liveState.hasCfTunnelToken
                          ? "••••••••••••"
                          : "eyJhIjoi..."
                      }
                      autoComplete="new-password"
                    />
                  </label>
                </div>
                <div className={local.hintBox}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <ShieldCheck size={14} />
                    <strong>Recommended for Shared Internet / Hotspot / CGNAT</strong>
                  </div>
                  Point your Cloudflare Tunnel Public Hostname to{" "}
                  <span className={styles.code}>http://127.0.0.1:80</span>. If{" "}
                  <span className={styles.code}>cloudflared</span> is not yet
                  installed on your Ubuntu server, run:{" "}
                  <span className={styles.code}>
                    sudo cloudflared service install &lt;TUNNEL_TOKEN&gt;
                  </span>
                </div>
              </>
            )}

            {provider === "custom_webhook" && (
              <>
                <div className={styles.formRow}>
                  <label className={styles.field}>
                    Hostname (optional, replaces {"{host}"})
                    <input
                      name="hostname"
                      className={styles.input}
                      defaultValue={liveState.hostname}
                      placeholder="myhost.duckdns.org"
                    />
                  </label>
                  <label className={styles.field}>
                    DDNS Update URL{" "}
                    {liveState.hasWebhookUrl
                      ? `(current: ${liveState.webhookPreview} — leave blank to keep)`
                      : ""}
                    <input
                      name="webhook_url"
                      className={styles.input}
                      placeholder="https://www.duckdns.org/update?domains=myhost&token=TOKEN&ip={ip}"
                      autoComplete="off"
                    />
                  </label>
                </div>
              </>
            )}

            {provider !== "cloudflare_tunnel" && (
              <div className={styles.formRow} style={{ alignItems: "center" }}>
                <label className={styles.field}>
                  Check &amp; Sync Interval
                  <select
                    name="interval_minutes"
                    className={styles.select}
                    defaultValue={String(liveState.intervalMinutes)}
                  >
                    <option value="1">Every 1 minute</option>
                    <option value="2">Every 2 minutes (Recommended)</option>
                    <option value="5">Every 5 minutes</option>
                    <option value="10">Every 10 minutes</option>
                    <option value="15">Every 15 minutes</option>
                    <option value="30">Every 30 minutes</option>
                  </select>
                </label>
                <div style={{ paddingTop: 18 }}>
                  <input type="hidden" name="auto_sync_present" value="1" />
                  <label className={styles.checkbox}>
                    <input
                      type="checkbox"
                      name="auto_sync"
                      defaultChecked={liveState.autoSync}
                    />
                    Keep server live automatically in background
                  </label>
                </div>
              </div>
            )}
          </div>
        )}

        {formResult?.ok === false && (
          <div className={styles.error} style={{ marginBottom: 10 }}>
            {formResult.error}
          </div>
        )}
        {formResult?.ok === true && (
          <div className={styles.notice} style={{ marginBottom: 10 }}>
            {formResult.message ?? "Network access mode saved."}
          </div>
        )}

        <div className={local.actions}>
          <button
            type="submit"
            className={styles.btn}
            disabled={savePending || syncPending}
            onClick={() => setSyncNowFlag("0")}
          >
            {savePending && syncNowFlag === "0"
              ? "Saving..."
              : mode === "ip"
                ? "Switch to IP Mode"
                : "Save No-IP Settings"}
          </button>

          {mode === "noip" && (
            <button
              type="submit"
              className={styles.btnGhost}
              disabled={savePending || syncPending}
              onClick={() => setSyncNowFlag("1")}
            >
              {savePending && syncNowFlag === "1"
                ? "Saving & Syncing..."
                : "Save & Sync Live Now"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
