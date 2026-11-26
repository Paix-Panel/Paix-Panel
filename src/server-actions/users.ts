"use server";

import { revalidatePath } from "next/cache";
import { agent, type SystemUserRow } from "@/lib/agent";
import { isAdminRole, isSuperAdmin, requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/crypto";
import {
  emptyPermissions,
  normalizeRole,
  PERMISSION_KEYS,
  serializePermissions,
  USER_ROLES,
  type PermissionKey,
  type UserRole,
} from "@/lib/permissions";

export type ActionResult = { ok: true } | { ok: false; error: string };

const UNIX_NAME_RE = /^[a-z_][a-z0-9_-]{0,31}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type PanelUserRow = {
  id: number;
  email: string;
  display_name: string;
  role: string;
  permissions_json: string;
  google_enabled: number;
  is_active: number;
  totp_enabled: number;
  last_login_at: string | null;
  created_at: string;
};

export type AssignableResources = {
  apps: string[];
  domains: string[];
  databases: string[];
};

function parseFormPermissions(fd: FormData): string {
  const validModuleSet = new Set<string>(PERMISSION_KEYS);
  const modules = fd
    .getAll("modules")
    .map((v) => String(v).trim())
    .filter((m): m is PermissionKey => validModuleSet.has(m));

  const readScopeField = (field: string): string[] | undefined => {
    const picked = fd
      .getAll(field)
      .flatMap((v) => String(v).split(","))
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    return picked.length > 0 ? Array.from(new Set(picked)) : undefined;
  };

  const apps = readScopeField("scope_apps");
  const domains = readScopeField("scope_domains");
  const databases = readScopeField("scope_databases");

  return serializePermissions({
    modules,
    scopes: {
      ...(apps ? { apps } : {}),
      ...(domains ? { domains } : {}),
      ...(databases ? { databases } : {}),
    },
  });
}

export async function listPanelUsers(): Promise<PanelUserRow[]> {
  const s = await requireSession();
  if (!isAdminRole(s.role)) {
    throw new Error("forbidden: admin role required");
  }
  return db()
    .prepare(
      `SELECT id, email, display_name, role, permissions_json,
              google_enabled, is_active, totp_enabled, last_login_at, created_at
         FROM users ORDER BY
           CASE role
             WHEN 'super_admin' THEN 0
             WHEN 'admin' THEN 1
             WHEN 'vps_admin' THEN 2
             WHEN 'hosting_admin' THEN 3
             ELSE 4
           END,
           id ASC`,
    )
    .all() as PanelUserRow[];
}

export async function listAssignableResources(): Promise<AssignableResources> {
  const s = await requireSession();
  if (!isAdminRole(s.role)) {
    return { apps: [], domains: [], databases: [] };
  }
  const appRows = db()
    .prepare(`SELECT name FROM apps ORDER BY name ASC`)
    .all() as { name: string }[];
  const domainRows = db()
    .prepare(
      `SELECT name FROM domains
       UNION
       SELECT domain AS name FROM sites
       ORDER BY name ASC`,
    )
    .all() as { name: string }[];

  const [mariaDbs, pgDbs] = await Promise.all([
    agent.databases.listDatabases().catch(() => []),
    agent.postgres.listDatabases().catch(() => []),
  ]);
  const dbSet = new Set<string>([
    ...mariaDbs.map((d) => d.name),
    ...pgDbs.map((d) => d.name),
  ]);

  return {
    apps: appRows.map((r) => r.name),
    domains: domainRows.map((r) => r.name),
    databases: Array.from(dbSet).sort(),
  };
}

export async function createPanelUserAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const s = await requireSession();
  if (!isAdminRole(s.role)) {
    return { ok: false, error: "admin role required" };
  }
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const displayName = String(fd.get("display_name") ?? "").trim().slice(0, 80);
  const password = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  const googleEnabled = fd.get("google_enabled") === "on" ? 1 : 0;
  const roleRaw = String(fd.get("role") ?? "user").trim().toLowerCase();

  if (!email) return { ok: false, error: "email required" };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "invalid email" };
  if (email.length > 254) return { ok: false, error: "email too long" };

  if (!(USER_ROLES as readonly string[]).includes(roleRaw)) {
    return { ok: false, error: "invalid role" };
  }
  const role = roleRaw as UserRole;

  if ((role === "admin" || role === "super_admin") && !isSuperAdmin(s.role)) {
    return { ok: false, error: "only a Super Admin can create Admin or Super Admin accounts" };
  }

  // Either password or Google SSO must be enabled
  if (!password && !googleEnabled) {
    return {
      ok: false,
      error: "provide a password (min 12 chars) or enable Google Sign-In for this user",
    };
  }
  if (password) {
    if (password.length < 12) {
      return { ok: false, error: "password must be at least 12 characters" };
    }
    if (password !== confirm) {
      return { ok: false, error: "passwords do not match" };
    }
    if (/[\r\n]/.test(password)) {
      return { ok: false, error: "password must not contain newlines" };
    }
  }

  const existing = db()
    .prepare(`SELECT id FROM users WHERE LOWER(email) = ?`)
    .get(email) as { id: number } | undefined;
  if (existing) {
    return { ok: false, error: "a user with that email already exists" };
  }

  const permissionsJson =
    role === "super_admin" || role === "admin"
      ? serializePermissions(emptyPermissions())
      : parseFormPermissions(fd);

  try {
    const hash = password ? await hashPassword(password) : "!google-oauth-only!";
    db()
      .prepare(
        `INSERT INTO users
          (email, display_name, password_hash, role, permissions_json, google_enabled, is_active)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
      )
      .run(email, displayName, hash, role, permissionsJson, googleEnabled);
    writeAudit({
      actorId: s.userId,
      action: "users.panel.create",
      target: email,
      result: "ok",
      message: `role=${role} google=${googleEnabled}`,
    });
    revalidatePath("/users");
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    writeAudit({
      actorId: s.userId,
      action: "users.panel.create",
      target: email,
      result: "error",
      message: msg,
    });
    return { ok: false, error: msg };
  }
}

export async function updatePanelUserPermissionsAction(
  userId: number,
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const s = await requireSession();
  if (!isAdminRole(s.role)) {
    return { ok: false, error: "admin role required" };
  }
  if (userId === s.userId) {
    return { ok: false, error: "cannot modify your own role or permissions here" };
  }

  const target = db()
    .prepare(`SELECT id, email, role, is_active FROM users WHERE id = ?`)
    .get(userId) as
    | { id: number; email: string; role: string; is_active: number }
    | undefined;
  if (!target) return { ok: false, error: "user not found" };

  const targetRole = normalizeRole(target.role);
  if ((targetRole === "super_admin" || targetRole === "admin") && !isSuperAdmin(s.role)) {
    return {
      ok: false,
      error: "only a Super Admin can modify an Admin or Super Admin account",
    };
  }

  const nextRoleRaw = String(fd.get("role") ?? targetRole).trim().toLowerCase();
  if (!(USER_ROLES as readonly string[]).includes(nextRoleRaw)) {
    return { ok: false, error: "invalid role" };
  }
  const nextRole = nextRoleRaw as UserRole;
  if (nextRole !== targetRole && !isSuperAdmin(s.role)) {
    return { ok: false, error: "only a Super Admin can change a user's role" };
  }

  const displayName = String(fd.get("display_name") ?? "").trim().slice(0, 80);
  const googleEnabled = fd.get("google_enabled") === "on" ? 1 : 0;
  const isActive = fd.get("is_active") === "on" ? 1 : 0;

  if (targetRole === "super_admin" && (nextRole !== "super_admin" || isActive === 0)) {
    const otherSupers = db()
      .prepare(
        `SELECT COUNT(*) AS c FROM users
          WHERE role = 'super_admin' AND is_active = 1 AND id != ?`,
      )
      .get(userId) as { c: number };
    if (otherSupers.c === 0) {
      return { ok: false, error: "cannot demote or suspend the last active Super Admin" };
    }
  }

  const permissionsJson =
    nextRole === "super_admin" || nextRole === "admin"
      ? serializePermissions(emptyPermissions())
      : parseFormPermissions(fd);

  db()
    .prepare(
      `UPDATE users
          SET display_name = ?,
              role = ?,
              permissions_json = ?,
              google_enabled = ?,
              is_active = ?
        WHERE id = ?`,
    )
    .run(displayName, nextRole, permissionsJson, googleEnabled, isActive, userId);

  if (!isActive) {
    db()
      .prepare(`UPDATE sessions SET revoked = 1 WHERE user_id = ? AND revoked = 0`)
      .run(userId);
  }

  writeAudit({
    actorId: s.userId,
    action: "users.panel.permissions",
    target: target.email,
    result: "ok",
    message: `role=${nextRole} active=${isActive} google=${googleEnabled}`,
  });
  revalidatePath("/users");
  return { ok: true };
}

export async function resetPanelUserPasswordAction(
  userId: number,
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const s = await requireSession();
  if (!isAdminRole(s.role)) {
    return { ok: false, error: "admin role required" };
  }
  if (userId === s.userId) {
    return {
      ok: false,
      error: "use /settings to change your own password (requires current pw)",
    };
  }
  const password = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  if (password.length < 12) {
    return { ok: false, error: "password must be at least 12 characters" };
  }
  if (password !== confirm) {
    return { ok: false, error: "passwords do not match" };
  }
  if (/[\r\n]/.test(password)) {
    return { ok: false, error: "password must not contain newlines" };
  }

  const target = db()
    .prepare(`SELECT email, role FROM users WHERE id = ?`)
    .get(userId) as { email: string; role: string } | undefined;
  if (!target) return { ok: false, error: "user not found" };

  if (isAdminRole(target.role) && !isSuperAdmin(s.role)) {
    return { ok: false, error: "only a Super Admin can reset another Admin's password" };
  }

  try {
    const hash = await hashPassword(password);
    db().prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(hash, userId);
    db()
      .prepare(`UPDATE sessions SET revoked = 1 WHERE user_id = ? AND revoked = 0`)
      .run(userId);
    writeAudit({
      actorId: s.userId,
      action: "users.panel.reset_password",
      target: target.email,
      result: "ok",
    });
    revalidatePath("/users");
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    writeAudit({
      actorId: s.userId,
      action: "users.panel.reset_password",
      target: target.email,
      result: "error",
      message: msg,
    });
    return { ok: false, error: msg };
  }
}

export async function deletePanelUserAction(userId: number): Promise<ActionResult> {
  const s = await requireSession();
  if (!isAdminRole(s.role)) return { ok: false, error: "admin role required" };
  if (userId === s.userId) return { ok: false, error: "cannot delete yourself" };

  const target = db()
    .prepare(`SELECT email, role FROM users WHERE id = ?`)
    .get(userId) as { email: string; role: string } | undefined;
  if (!target) return { ok: false, error: "user not found" };

  if (isAdminRole(target.role) && !isSuperAdmin(s.role)) {
    return { ok: false, error: "only a Super Admin can delete Admin or Super Admin accounts" };
  }

  if (isSuperAdmin(target.role)) {
    const others = db()
      .prepare(`SELECT COUNT(*) AS c FROM users WHERE role = 'super_admin' AND id != ?`)
      .get(userId) as { c: number };
    if (others.c === 0) {
      return { ok: false, error: "cannot delete the last Super Admin" };
    }
  } else if (target.role === "admin") {
    const others = db()
      .prepare(
        `SELECT COUNT(*) AS c FROM users WHERE role IN ('super_admin', 'admin') AND id != ?`,
      )
      .get(userId) as { c: number };
    if (others.c === 0) {
      return { ok: false, error: "cannot delete the last admin" };
    }
  }

  db().prepare(`UPDATE sessions SET revoked = 1 WHERE user_id = ?`).run(userId);
  db().prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId);
  db().prepare(`DELETE FROM users WHERE id = ?`).run(userId);

  writeAudit({
    actorId: s.userId,
    action: "users.panel.delete",
    target: target.email,
    result: "ok",
    message: `role=${target.role}`,
  });
  revalidatePath("/users");
  return { ok: true };
}

export async function setRootPasswordAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const s = await requireSession();
  if (!isAdminRole(s.role)) {
    return { ok: false, error: "forbidden: admin role required" };
  }
  const password = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");

  if (password.length < 12) {
    return { ok: false, error: "password must be at least 12 characters" };
  }
  if (password !== confirm) {
    return { ok: false, error: "passwords do not match" };
  }
  if (/[\r\n]/.test(password)) {
    return { ok: false, error: "password must not contain newlines" };
  }

  try {
    await agent.system.setRootPassword(password);
    writeAudit({
      actorId: s.userId,
      action: "users.root_password_reset",
      target: "root",
      result: "ok",
    });
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    writeAudit({
      actorId: s.userId,
      action: "users.root_password_reset",
      target: "root",
      result: "error",
      message: msg,
    });
    return { ok: false, error: msg };
  }
}

export async function listSystemUsers(): Promise<SystemUserRow[]> {
  const s = await requireSession();
  if (!isAdminRole(s.role)) return [];
  try {
    return await agent.system.users();
  } catch {
    return [];
  }
}

export async function createSystemUserAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const s = await requireSession();
  if (!isAdminRole(s.role)) {
    return { ok: false, error: "admin role required" };
  }

  const name = String(fd.get("name") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  const sudo = String(fd.get("sudo") ?? "") === "on";
  const shellRaw = String(fd.get("shell") ?? "").trim();
  const shell = shellRaw === "" ? "/bin/bash" : shellRaw;

  if (!name) return { ok: false, error: "username required" };
  if (!UNIX_NAME_RE.test(name)) {
    return {
      ok: false,
      error:
        "username must start with a-z or _, contain only a-z, 0-9, _ or -, max 32 chars",
    };
  }
  if (password.length < 12) {
    return { ok: false, error: "password must be at least 12 characters" };
  }
  if (password !== confirm) {
    return { ok: false, error: "passwords do not match" };
  }
  if (/[\r\n:]/.test(password)) {
    return {
      ok: false,
      error: "password must not contain newlines or colons",
    };
  }

  try {
    await agent.system.createUser({ name, password, sudo, shell });
    writeAudit({
      actorId: s.userId,
      action: "users.linux.create",
      target: name,
      result: "ok",
      message: `sudo=${sudo} shell=${shell}`,
    });
    revalidatePath("/users");
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    writeAudit({
      actorId: s.userId,
      action: "users.linux.create",
      target: name,
      result: "error",
      message: msg,
    });
    return { ok: false, error: msg };
  }
}

export async function setSystemUserPasswordAction(
  name: string,
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const s = await requireSession();
  if (!isAdminRole(s.role)) {
    return { ok: false, error: "admin role required" };
  }
  const target = name.trim().toLowerCase();
  if (!UNIX_NAME_RE.test(target)) {
    return { ok: false, error: "invalid username" };
  }
  if (target === "root") {
    return {
      ok: false,
      error: "use the Root password section to change root's password",
    };
  }
  const password = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  if (password.length < 12) {
    return { ok: false, error: "password must be at least 12 characters" };
  }
  if (password !== confirm) {
    return { ok: false, error: "passwords do not match" };
  }
  if (/[\r\n:]/.test(password)) {
    return {
      ok: false,
      error: "password must not contain newlines or colons",
    };
  }

  try {
    await agent.system.setUserPassword(target, password);
    writeAudit({
      actorId: s.userId,
      action: "users.linux.reset_password",
      target,
      result: "ok",
    });
    revalidatePath("/users");
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    writeAudit({
      actorId: s.userId,
      action: "users.linux.reset_password",
      target,
      result: "error",
      message: msg,
    });
    return { ok: false, error: msg };
  }
}

export async function deleteSystemUserAction(
  name: string,
  removeHome: boolean,
): Promise<ActionResult> {
  const s = await requireSession();
  if (!isAdminRole(s.role)) return { ok: false, error: "admin role required" };
  const target = name.trim().toLowerCase();
  if (!UNIX_NAME_RE.test(target)) return { ok: false, error: "invalid username" };
  if (target === "root") return { ok: false, error: "cannot delete root" };

  try {
    await agent.system.deleteUser(target, { removeHome });
    writeAudit({
      actorId: s.userId,
      action: "users.linux.delete",
      target,
      result: "ok",
      message: `remove_home=${removeHome}`,
    });
    revalidatePath("/users");
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    writeAudit({
      actorId: s.userId,
      action: "users.linux.delete",
      target,
      result: "error",
      message: msg,
    });
    return { ok: false, error: msg };
  }
}
