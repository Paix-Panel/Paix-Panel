import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { redirect } from "next/navigation";
import {
  ACCESS_TTL_SECONDS,
  COOKIE_NAME,
  REFRESH_COOKIE,
  REFRESH_TTL_SECONDS,
  config,
} from "./config";
import { db } from "./db";
import { getSettingNumber } from "./settings";
import { randomUUID } from "node:crypto";
import {
  emptyPermissions,
  hasPermission,
  isAdminRole,
  isSuperAdmin,
  normalizeRole,
  parsePermissions,
  type PermissionKey,
  type UserPermissions,
  type UserRole,
} from "./permissions";

export { isAdminRole, isSuperAdmin, hasPermission } from "./permissions";

export type Session = {
  userId: number;
  email: string;
  displayName: string;
  role: UserRole;
  permissions: UserPermissions;
  jti: string;
  needsTotp: boolean;
  /** True when the operator ticked "Remember me" at login. Carried through
   *  the access/refresh JWTs so the TOTP re-issuance + future refresh
   *  cycles keep using the 30-day TTL instead of the configured default. */
  remember: boolean;
  /** jti of the refresh token issued with this access token, so logout can
   *  revoke it too. Absent on tokens issued before this claim existed. */
  refreshJti?: string;
};

export type IssuedSession = {
  access: string;
  refresh: string;
  accessSeconds: number;
  refreshSeconds: number;
};

const SESSION_TTL_KEY = "panel.session_ttl_minutes";
const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 30 * 24 * 60 * 60;
export const REMEMBER_TTL_SECONDS = MAX_TTL_SECONDS;

const secret = () => new TextEncoder().encode(config.jwtSecret);

export function resolveSessionTtl(): { accessSeconds: number; refreshSeconds: number } {
  const fallbackMinutes = ACCESS_TTL_SECONDS / 60;
  const minutes = getSettingNumber(SESSION_TTL_KEY, fallbackMinutes);
  let seconds = Math.floor(minutes * 60);
  if (!Number.isFinite(seconds) || seconds < MIN_TTL_SECONDS) seconds = MIN_TTL_SECONDS;
  if (seconds > MAX_TTL_SECONDS) seconds = MAX_TTL_SECONDS;
  return { accessSeconds: seconds, refreshSeconds: seconds };
}

function sqliteTimestamp(secondsAhead: number): string {
  const d = new Date(Date.now() + secondsAhead * 1000);
  return d.toISOString().replace("T", " ").slice(0, 19);
}

export async function issueSession(
  userId: number,
  email: string,
  role: string,
  needsTotp: boolean,
  remember: boolean = false,
): Promise<IssuedSession> {
  const accessJti = randomUUID();
  const refreshJti = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const { accessSeconds, refreshSeconds } = remember
    ? { accessSeconds: REMEMBER_TTL_SECONDS, refreshSeconds: REMEMBER_TTL_SECONDS }
    : resolveSessionTtl();

  const access = await new SignJWT({
    sub: String(userId),
    email,
    role: normalizeRole(role),
    needsTotp,
    remember,
    rjti: refreshJti,
    typ: "access",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(accessJti)
    .setIssuedAt(now)
    .setExpirationTime(now + accessSeconds)
    .sign(secret());

  const refresh = await new SignJWT({ sub: String(userId), typ: "refresh", needsTotp, remember })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(refreshJti)
    .setIssuedAt(now)
    .setExpirationTime(now + refreshSeconds)
    .sign(secret());

  db()
    .prepare(`INSERT INTO sessions (jti, user_id, expires_at, revoked) VALUES (?, ?, ?, 0)`)
    .run(accessJti, userId, sqliteTimestamp(accessSeconds));
  db()
    .prepare(`INSERT INTO sessions (jti, user_id, expires_at, revoked) VALUES (?, ?, ?, 0)`)
    .run(refreshJti, userId, sqliteTimestamp(refreshSeconds));

  return { access, refresh, accessSeconds, refreshSeconds };
}

export async function setAuthCookies(
  access: string,
  refresh: string,
  accessSeconds: number = ACCESS_TTL_SECONDS,
  refreshSeconds: number = REFRESH_TTL_SECONDS,
) {
  const jar = await cookies();
  const isIframePreview = config.allowPreviewIframe;
  const sameSite: "strict" | "none" = isIframePreview ? "none" : "strict";
  const secure = isIframePreview ? true : config.cookieSecure;
  jar.set(COOKIE_NAME, access, {
    httpOnly: true,
    secure,
    sameSite,
    path: "/",
    maxAge: accessSeconds,
  });
  jar.set(REFRESH_COOKIE, refresh, {
    httpOnly: true,
    secure,
    sameSite,
    path: "/api/auth/refresh",
    maxAge: refreshSeconds,
  });
}

export async function clearAuthCookies() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
  jar.delete({ name: REFRESH_COOKIE, path: "/api/auth/refresh" });
}

type DbUserSessionRow = {
  id: number;
  email: string;
  display_name: string;
  role: string;
  permissions_json: string;
  is_active: number;
};

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) {
    if (config.isPreviewMock && !jar.get("vps_panel_preview_signed_out")?.value) {
      await syncAdminFromEnv();
      const admin = db()
        .prepare(
          `SELECT id, email, display_name, role, permissions_json, is_active
             FROM users
            WHERE is_active = 1 AND role IN ('super_admin', 'admin')
            ORDER BY CASE role WHEN 'super_admin' THEN 0 ELSE 1 END, id ASC
            LIMIT 1`,
        )
        .get() as DbUserSessionRow | undefined;
      if (admin) {
        const role = normalizeRole(admin.role);
        return {
          userId: admin.id,
          email: admin.email,
          displayName: admin.display_name ?? "",
          role,
          permissions: isAdminRole(role)
            ? emptyPermissions()
            : parsePermissions(admin.permissions_json),
          jti: "preview-session",
          needsTotp: false,
          remember: true,
        };
      }
    }
    return null;
  }
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.typ !== "access") return null;
    const jti = payload.jti as string;
    const row = db()
      .prepare(`SELECT revoked FROM sessions WHERE jti = ?`)
      .get(jti) as { revoked: number } | undefined;
    if (!row || row.revoked) return null;

    const userId = Number(payload.sub);
    const userRow = db()
      .prepare(
        `SELECT id, email, display_name, role, permissions_json, is_active
           FROM users WHERE id = ?`,
      )
      .get(userId) as DbUserSessionRow | undefined;
    if (!userRow || !userRow.is_active) return null;

    const role = normalizeRole(userRow.role);
    return {
      userId: userRow.id,
      email: userRow.email,
      displayName: userRow.display_name ?? "",
      role,
      permissions: isAdminRole(role)
        ? emptyPermissions()
        : parsePermissions(userRow.permissions_json),
      jti,
      needsTotp: Boolean(payload.needsTotp),
      remember: Boolean(payload.remember),
      refreshJti: typeof payload.rjti === "string" ? payload.rjti : undefined,
    };
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.needsTotp) redirect("/totp");
  return s;
}

/**
 * Requires `super_admin` or `admin` role. Both admin tiers have full
 * server operations power; super_admin additionally manages admins and
 * panel-wide SSO / high-privilege security.
 */
export async function requireAdmin(): Promise<Session> {
  const s = await requireSession();
  if (!isAdminRole(s.role)) {
    throw new Error("forbidden: admin role required");
  }
  return s;
}

/**
 * Requires `super_admin` role (e.g. creating/demoting admins or managing
 * panel-level OAuth credentials).
 */
export async function requireSuperAdmin(): Promise<Session> {
  const s = await requireSession();
  if (!isSuperAdmin(s.role)) {
    throw new Error("forbidden: super_admin role required");
  }
  return s;
}

/**
 * Requires either an admin role (`super_admin` / `admin`) OR explicit module
 * permission granted on a `user` account.
 */
export async function requirePermission(perm: PermissionKey): Promise<Session> {
  const s = await requireSession();
  if (!hasPermission(s, perm)) {
    throw new Error(`forbidden: ${perm} permission required`);
  }
  return s;
}

export async function revokeSession(jti: string) {
  db().prepare(`UPDATE sessions SET revoked = 1 WHERE jti = ?`).run(jti);
}

export async function syncAdminFromEnv(): Promise<void> {
  if (!config.bootstrapEmail || !config.bootstrapPassword) return;

  const existing = db()
    .prepare(`SELECT COUNT(*) as c FROM users WHERE role IN ('super_admin', 'admin')`)
    .get() as { c: number };
  if (existing.c > 0) return;

  const email = config.bootstrapEmail.trim().toLowerCase();
  const envPassword = config.bootstrapPassword;
  const { hashPassword } = await import("./crypto");
  const hash = await hashPassword(envPassword);
  db()
    .prepare(
      `INSERT INTO users (email, display_name, password_hash, role, google_enabled, is_active)
       VALUES (?, 'Super Admin', ?, 'super_admin', 1, 1)`,
    )
    .run(email, hash);
}
