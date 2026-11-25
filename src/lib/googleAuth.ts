import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { config } from "./config";
import { db } from "./db";
import { getSetting } from "./settings";

const KEY_ENABLED = "auth.google_enabled";
const KEY_CLIENT_ID = "auth.google_client_id";
const KEY_CLIENT_SECRET = "auth.google_client_secret";

export type GoogleAuthConfig = {
  clientId: string;
  clientSecret: string;
  enabled: boolean;
  source: "database" | "env" | "none";
};

export function getGoogleAuthConfig(): GoogleAuthConfig {
  const dbId = getSetting(KEY_CLIENT_ID, "").trim();
  const dbSecret = getSetting(KEY_CLIENT_SECRET, "").trim();
  const envId = (process.env.GOOGLE_CLIENT_ID ?? "").trim();
  const envSecret = (process.env.GOOGLE_CLIENT_SECRET ?? "").trim();

  const enabledSetting = getSetting(KEY_ENABLED, "true");
  const enabled = enabledSetting !== "false";

  if (dbId && dbSecret) {
    return { clientId: dbId, clientSecret: dbSecret, enabled, source: "database" };
  }
  if (envId && envSecret) {
    return { clientId: envId, clientSecret: envSecret, enabled, source: "env" };
  }
  return { clientId: dbId || envId, clientSecret: "", enabled: false, source: "none" };
}

export function getGoogleAuthPublicStatus() {
  const cfg = getGoogleAuthConfig();
  const configured = Boolean(cfg.clientId && cfg.clientSecret);
  return {
    configured,
    enabled: configured && cfg.enabled,
    source: cfg.source,
    clientId: cfg.clientId,
    hasSecret: Boolean(cfg.clientSecret),
  };
}

export function saveGoogleAuthConfig(opts: {
  clientId: string;
  clientSecret?: string;
  enabled: boolean;
}) {
  const upsert = db().prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  );
  const tx = db().transaction(() => {
    upsert.run(KEY_CLIENT_ID, opts.clientId.trim());
    upsert.run(KEY_ENABLED, opts.enabled ? "true" : "false");
    if (opts.clientSecret && opts.clientSecret.trim().length > 0) {
      upsert.run(KEY_CLIENT_SECRET, opts.clientSecret.trim());
    }
  });
  tx();
}

export function clearGoogleAuthConfig() {
  db()
    .prepare(`DELETE FROM settings WHERE key IN (?, ?, ?)`)
    .run(KEY_ENABLED, KEY_CLIENT_ID, KEY_CLIENT_SECRET);
}

export function resolveRequestOrigin(req: NextRequest): string {
  const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedHost) {
    const proto = forwardedProto || "https";
    return `${proto}://${forwardedHost}`;
  }
  const host = req.headers.get("host")?.split(",")[0]?.trim();
  if (host) {
    const proto = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
    return `${proto}://${host}`;
  }
  const appUrl = (process.env.APP_URL ?? "").trim().replace(/\/+$/, "");
  if (appUrl) return appUrl;
  return req.nextUrl.origin;
}

export type OAuthStatePayload = {
  nonce: string;
  exp: number;
  remember: boolean;
  origin: string;
};

function signStatePayload(encoded: string): string {
  return createHmac("sha256", config.jwtSecret).update(encoded).digest("base64url");
}

export function createSignedOAuthState(opts: {
  remember: boolean;
  origin: string;
}): string {
  const payload: OAuthStatePayload = {
    nonce: randomBytes(16).toString("base64url"),
    exp: Math.floor(Date.now() / 1000) + 600,
    remember: opts.remember,
    origin: opts.origin,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = signStatePayload(encoded);
  return `${encoded}.${sig}`;
}

export function verifySignedOAuthState(state: string | null): OAuthStatePayload | null {
  if (!state) return null;
  const parts = state.split(".");
  if (parts.length !== 2) return null;
  const [encoded, providedSig] = parts;
  if (!encoded || !providedSig) return null;
  const expectedSig = signStatePayload(encoded);
  const a = Buffer.from(providedSig, "utf8");
  const b = Buffer.from(expectedSig, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as OAuthStatePayload;
    if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) return null;
    if (typeof parsed.origin !== "string" || typeof parsed.nonce !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function buildGoogleAuthUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", opts.clientId);
  u.searchParams.set("redirect_uri", opts.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("prompt", "select_account");
  u.searchParams.set("access_type", "online");
  u.searchParams.set("state", opts.state);
  return u.toString();
}

export type GoogleUserInfo = {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
};

export async function exchangeGoogleCode(opts: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<GoogleUserInfo> {
  const body = new URLSearchParams({
    code: opts.code,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    redirect_uri: opts.redirectUri,
    grant_type: "authorization_code",
  });

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text().catch(() => "");
    throw new Error(`Google token exchange failed (${tokenRes.status}): ${errText.slice(0, 180)}`);
  }

  const tokenData = (await tokenRes.json()) as { access_token?: string };
  if (!tokenData.access_token) {
    throw new Error("Google token response did not include access_token");
  }

  const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
    cache: "no-store",
  });
  if (!profileRes.ok) {
    throw new Error(`Google profile lookup failed (${profileRes.status})`);
  }

  const profile = (await profileRes.json()) as Partial<GoogleUserInfo>;
  if (!profile.sub || !profile.email) {
    throw new Error("Google account response did not include an email and subject");
  }
  if (profile.email_verified !== true) {
    throw new Error("Your Google email address must be verified before signing in");
  }

  return {
    sub: profile.sub,
    email: profile.email.trim().toLowerCase(),
    email_verified: true,
    name: profile.name,
    picture: profile.picture,
  };
}
