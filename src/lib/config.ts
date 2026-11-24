import "server-only";
import fs from "node:fs";

const PREVIEW_JWT_FALLBACK = "paix-panel-preview-jwt-secret-key-2026";
const PREVIEW_AGENT_FALLBACK = "paix-panel-preview-agent-token-2026";

function isPreviewRuntime(): boolean {
  if (process.env.PREVIEW_MOCK_AGENT === "1" || process.env.ALLOW_PREVIEW_IFRAME === "1") {
    return true;
  }
  if (process.env.APP_URL && !fs.existsSync(process.env.AGENT_SOCKET ?? "/run/vps-panel/agent.sock")) {
    return true;
  }
  return false;
}

function required(name: string, previewFallback?: string): string {
  const v = process.env[name];
  if (v) return v;
  if (previewFallback && isPreviewRuntime()) return previewFallback;
  throw new Error(`env ${name} is not set`);
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const config = {
  get jwtSecret(): string {
    return required("JWT_SECRET", PREVIEW_JWT_FALLBACK);
  },
  get agentToken(): string {
    return required("AGENT_TOKEN", PREVIEW_AGENT_FALLBACK);
  },
  get agentSocket(): string {
    return optional("AGENT_SOCKET", "/run/vps-panel/agent.sock");
  },
  get panelDbPath(): string {
    if (process.env.PANEL_DB_PATH) return process.env.PANEL_DB_PATH;
    if (isPreviewRuntime()) return "./.data/panel.db";
    return "/var/lib/vps-panel/panel.db";
  },
  // Panel host can be empty in "IP-only" mode (operator hasn't picked a real
  // FQDN yet). Don't throw — let callers decide whether they need a hostname.
  get panelHost(): string {
    return optional("PANEL_HOST", isPreviewRuntime() ? "vps.paixpanel.local" : "");
  },
  get cookieSecure(): boolean {
    return optional("COOKIE_SECURE", "1") !== "0";
  },
  get bootstrapEmail(): string | null {
    return process.env.ADMIN_EMAIL ?? (isPreviewRuntime() ? "admin@paixpanel.local" : null);
  },
  get bootstrapPassword(): string | null {
    return process.env.ADMIN_INITIAL_PASSWORD ?? (isPreviewRuntime() ? "PaixPanelDemo!2026" : null);
  },
  get isPreviewMock(): boolean {
    if (process.env.PREVIEW_MOCK_AGENT === "1") return true;
    return isPreviewRuntime() && !fs.existsSync(this.agentSocket);
  },
  get allowPreviewIframe(): boolean {
    return process.env.ALLOW_PREVIEW_IFRAME === "1" || isPreviewRuntime();
  },
  /**
   * Bearer token external MCP clients (Claude Desktop, Cursor, ChatGPT
   * custom GPTs, …) present at `/api/mcp`. Null when unset → the MCP
   * endpoint returns 503 and the /ai-agent preview UI shows a disabled
   * status pill. Set in `/etc/vps-panel/.env` and restart the panel.
   */
  get mcpToken(): string | null {
    const v = process.env.MCP_TOKEN;
    return v && v.length > 0 ? v : null;
  },
};

export const COOKIE_NAME = "vps_panel_session";
export const REFRESH_COOKIE = "vps_panel_refresh";
export const ACCESS_TTL_SECONDS = 60 * 60;
export const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 7;
