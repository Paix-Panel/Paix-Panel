"use server";

import { revalidatePath } from "next/cache";
import { agent } from "@/lib/agent";
import { writeAudit } from "@/lib/audit";
import { isSuperAdmin, requireSession } from "@/lib/auth";
import { hashPassword } from "@/lib/crypto";
import { db } from "@/lib/db";
import {
  defaultHostingAdminModules,
  normalizeRole,
  serializePermissions,
} from "@/lib/permissions";
import {
  checkCapacityFits,
  getHostCapacity,
  getPackageById,
  readAllocatedFromDb,
} from "@/lib/provisioning";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;
const UNIX_USER_RE = /^[a-z_][a-z0-9_-]{0,31}$/;

export async function provisionHostingAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const s = await requireSession();
  if (!isSuperAdmin(s.role)) {
    return {
      ok: false,
      error: "Forbidden: only Super Admin can register Web Hosting accounts.",
    };
  }

  const label = String(fd.get("label") ?? "").trim().slice(0, 80);
  const domain = String(fd.get("domain") ?? "").trim().toLowerCase().replace(/\.$/, "");
  const packageId = Number(fd.get("package_id") ?? 0);
  const ownerMode = String(fd.get("owner_mode") ?? "new");
  const existingUserId = Number(fd.get("existing_user_id") ?? 0);
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const displayName = String(fd.get("display_name") ?? "").trim().slice(0, 80);
  const password = String(fd.get("password") ?? "");
  const linuxUserInput = String(fd.get("linux_user") ?? "").trim().toLowerCase();
  const createLinuxUser = fd.get("create_linux_user") === "on";
  const notes = String(fd.get("notes") ?? "").trim().slice(0, 500);

  if (!domain || !DOMAIN_RE.test(domain)) {
    return { ok: false, error: "Enter a valid primary domain (e.g. example.com)." };
  }
  const pkg = getPackageById(packageId);
  if (!pkg || pkg.kind !== "hosting") {
    return { ok: false, error: "Select a valid Hosting package." };
  }
  if (!pkg.is_active) {
    return { ok: false, error: "Selected Hosting package is archived/disabled." };
  }

  const defaultUnix = domain.split(".")[0].replace(/[^a-z0-9]/g, "").slice(0, 16) || "hostuser";
  const linuxUser = linuxUserInput || defaultUnix;
  if (!UNIX_USER_RE.test(linuxUser) || linuxUser === "root") {
    return {
      ok: false,
      error: "Invalid non-root system/SFTP username (lowercase a-z, 0-9, _, -).",
    };
  }

  let hashedPw = "";
  if (ownerMode === "new") {
    if (!email || !EMAIL_RE.test(email)) {
      return { ok: false, error: "Valid owner email is required." };
    }
    if (password.length < 12) {
      return { ok: false, error: "Owner password must be at least 12 characters." };
    }
    if (/[\r\n:]/.test(password)) {
      return { ok: false, error: "Password must not contain newlines or colons." };
    }
    hashedPw = await hashPassword(password);
  } else if (!Number.isInteger(existingUserId) || existingUserId <= 0) {
    return { ok: false, error: "Select an existing panel user." };
  }

  const hostCap = await getHostCapacity();
  const rootDir = `/var/www/${domain}`;

  const txRes = db().transaction((): ActionResult => {
    const clash = db()
      .prepare(`SELECT id FROM hosting_accounts WHERE LOWER(domain) = LOWER(?)`)
      .get(domain) as { id: number } | undefined;
    if (clash) {
      return { ok: false, error: `A hosting account for "${domain}" already exists.` };
    }

    const allocatedNow = readAllocatedFromDb(db());
    const liveCap = {
      ...hostCap,
      allocated: allocatedNow,
      available: {
        cpuCores: Math.max(
          0,
          Number((hostCap.hardware.cpuCores - hostCap.reserved.cpuCores - allocatedNow.cpuCores).toFixed(2)),
        ),
        ramMb: Math.max(0, hostCap.hardware.ramMb - hostCap.reserved.ramMb - allocatedNow.ramMb),
        storageGb: Math.max(
          0,
          hostCap.hardware.storageGb - hostCap.reserved.storageGb - allocatedNow.storageGb,
        ),
      },
    };
    const fit = checkCapacityFits(liveCap, {
      cpuCores: pkg.cpu_cores,
      ramMb: pkg.ram_mb,
      storageGb: pkg.storage_gb,
    });
    if (!fit.ok) return fit;

    // Grant all Hosting Admin roles/modules, scoped cleanly to their assigned domain.
    const hostingPermsJson = serializePermissions({
      modules: defaultHostingAdminModules(Boolean(pkg.ssh_access)),
      scopes: { domains: [domain] },
    });

    let targetUserId = existingUserId;
    if (ownerMode === "new") {
      const existingEmail = db()
        .prepare(`SELECT id FROM users WHERE LOWER(email) = ?`)
        .get(email) as { id: number } | undefined;
      if (existingEmail) {
        return {
          ok: false,
          error: `Panel user "${email}" already exists. Choose "Assign Existing User" instead.`,
        };
      }
      const userInsert = db()
        .prepare(
          `INSERT INTO users
            (email, display_name, password_hash, role, permissions_json, google_enabled, is_active)
           VALUES (?, ?, ?, 'hosting_admin', ?, 1, 1)`,
        )
        .run(email, displayName || label || domain, hashedPw, hostingPermsJson);
      targetUserId = Number(userInsert.lastInsertRowid);
    } else {
      const userRow = db()
        .prepare(`SELECT id, role FROM users WHERE id = ?`)
        .get(existingUserId) as { id: number; role: string } | undefined;
      if (!userRow) return { ok: false, error: "Selected user was not found." };
      const currentRole = normalizeRole(userRow.role);
      if (currentRole !== "super_admin" && currentRole !== "admin" && currentRole !== "vps_admin") {
        db()
          .prepare(`UPDATE users SET role = 'hosting_admin', permissions_json = ? WHERE id = ?`)
          .run(hostingPermsJson, existingUserId);
      }
    }

    db()
      .prepare(
        `INSERT INTO hosting_accounts
          (label, domain, user_id, package_id, status, root_dir, linux_user,
           cpu_cores, ram_mb, storage_gb, bandwidth_gb, max_domains, max_subdomains,
           max_apps, max_databases, max_mailboxes, max_ftp_accounts, backup_slots,
           ssh_access, ssl_included, notes)
         VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        label || domain,
        domain,
        targetUserId,
        pkg.id,
        rootDir,
        createLinuxUser ? linuxUser : "",
        pkg.cpu_cores,
        pkg.ram_mb,
        pkg.storage_gb,
        pkg.bandwidth_gb,
        pkg.max_domains,
        pkg.max_subdomains,
        pkg.max_apps,
        pkg.max_databases,
        pkg.max_mailboxes,
        pkg.max_ftp_accounts,
        pkg.backup_slots,
        pkg.ssh_access,
        pkg.ssl_included,
        notes,
      );

    db().prepare(`INSERT OR IGNORE INTO domains (name, dnssec) VALUES (?, 0)`).run(domain);
    db()
      .prepare(
        `INSERT OR IGNORE INTO sites
          (domain, mode, upstream_port, folder_path, force_www_redirect, ssl_requested)
         VALUES (?, 'folder', NULL, ?, 0, ?)`,
      )
      .run(domain, rootDir, pkg.ssl_included);

    return { ok: true };
  })();

  if (!txRes.ok) return txRes;

  if (createLinuxUser) {
    const pw = password || `${Math.random().toString(36).slice(2)}Host!2026`;
    await agent.system
      .createUser({
        name: linuxUser,
        password: pw,
        sudo: false,
        shell: pkg.ssh_access ? "/bin/bash" : "/usr/sbin/nologin",
      })
      .catch(() => null);
  }
  await agent.sites
    .create({
      domain,
      mode: "folder",
      folder_path: rootDir,
      force_www_redirect: false,
      issue_ssl: Boolean(pkg.ssl_included),
    })
    .catch(() => null);

  writeAudit({
    actorId: s.userId,
    action: "hosting.provision",
    target: domain,
    result: "ok",
    message: `pkg=${pkg.slug} storage=${pkg.storage_gb}GB bw=${pkg.bandwidth_gb}GB`,
  });

  revalidatePath("/hosting");
  revalidatePath("/packages");
  revalidatePath("/domains");
  revalidatePath("/users");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function resizeHostingPackageAction(
  hostingId: number,
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const s = await requireSession();
  if (!isSuperAdmin(s.role)) {
    return { ok: false, error: "Forbidden: Super Admin required." };
  }

  const newPackageId = Number(fd.get("package_id") ?? 0);
  const pkg = getPackageById(newPackageId);
  if (!pkg || pkg.kind !== "hosting") {
    return { ok: false, error: "Select a valid Hosting package." };
  }

  const hostCap = await getHostCapacity();
  const res = db().transaction((): ActionResult => {
    const h = db()
      .prepare(`SELECT id, user_id, domain, status, cpu_cores, ram_mb, storage_gb FROM hosting_accounts WHERE id = ?`)
      .get(hostingId) as
      | {
          id: number;
          user_id: number;
          domain: string;
          status: string;
          cpu_cores: number;
          ram_mb: number;
          storage_gb: number;
        }
      | undefined;
    if (!h) return { ok: false, error: "Hosting account not found." };

    if (h.status !== "terminated") {
      const allocatedNow = readAllocatedFromDb(db());
      const liveCap = {
        ...hostCap,
        allocated: allocatedNow,
        available: {
          cpuCores: Math.max(
            0,
            Number((hostCap.hardware.cpuCores - hostCap.reserved.cpuCores - allocatedNow.cpuCores).toFixed(2)),
          ),
          ramMb: Math.max(0, hostCap.hardware.ramMb - hostCap.reserved.ramMb - allocatedNow.ramMb),
          storageGb: Math.max(
            0,
            hostCap.hardware.storageGb - hostCap.reserved.storageGb - allocatedNow.storageGb,
          ),
        },
      };
      const fit = checkCapacityFits(liveCap, {
        cpuCores: Math.max(0, pkg.cpu_cores - h.cpu_cores),
        ramMb: Math.max(0, pkg.ram_mb - h.ram_mb),
        storageGb: Math.max(0, pkg.storage_gb - h.storage_gb),
      });
      if (!fit.ok) return fit;
    }

    db()
      .prepare(
        `UPDATE hosting_accounts
            SET package_id = ?, cpu_cores = ?, ram_mb = ?, storage_gb = ?, bandwidth_gb = ?,
                max_domains = ?, max_subdomains = ?, max_apps = ?, max_databases = ?,
                max_mailboxes = ?, max_ftp_accounts = ?, backup_slots = ?,
                ssh_access = ?, ssl_included = ?
          WHERE id = ?`,
      )
      .run(
        pkg.id,
        pkg.cpu_cores,
        pkg.ram_mb,
        pkg.storage_gb,
        pkg.bandwidth_gb,
        pkg.max_domains,
        pkg.max_subdomains,
        pkg.max_apps,
        pkg.max_databases,
        pkg.max_mailboxes,
        pkg.max_ftp_accounts,
        pkg.backup_slots,
        pkg.ssh_access,
        pkg.ssl_included,
        hostingId,
      );

    const owner = db().prepare(`SELECT role FROM users WHERE id = ?`).get(h.user_id) as
      | { role: string }
      | undefined;
    if (owner && normalizeRole(owner.role) === "hosting_admin") {
      const nextPerms = serializePermissions({
        modules: defaultHostingAdminModules(Boolean(pkg.ssh_access)),
        scopes: { domains: [h.domain] },
      });
      db().prepare(`UPDATE users SET permissions_json = ? WHERE id = ?`).run(nextPerms, h.user_id);
    }

    return { ok: true };
  })();

  if (res.ok) {
    writeAudit({
      actorId: s.userId,
      action: "hosting.resize",
      target: String(hostingId),
      result: "ok",
      message: `pkg=${pkg.slug}`,
    });
    revalidatePath("/hosting");
    revalidatePath("/packages");
    revalidatePath("/dashboard");
  }
  return res;
}

export async function updateHostingStatusAction(
  hostingId: number,
  nextStatus: "active" | "suspended" | "terminated",
): Promise<ActionResult> {
  const s = await requireSession();
  if (!isSuperAdmin(s.role)) {
    return { ok: false, error: "Forbidden: Super Admin required." };
  }

  const hostCap = await getHostCapacity();
  const res = db().transaction((): ActionResult => {
    const h = db()
      .prepare(`SELECT id, domain, status, cpu_cores, ram_mb, storage_gb FROM hosting_accounts WHERE id = ?`)
      .get(hostingId) as
      | { id: number; domain: string; status: string; cpu_cores: number; ram_mb: number; storage_gb: number }
      | undefined;
    if (!h) return { ok: false, error: "Hosting account not found." };

    if (h.status === "terminated" && nextStatus !== "terminated") {
      const allocatedNow = readAllocatedFromDb(db());
      const liveCap = {
        ...hostCap,
        allocated: allocatedNow,
        available: {
          cpuCores: Math.max(
            0,
            Number((hostCap.hardware.cpuCores - hostCap.reserved.cpuCores - allocatedNow.cpuCores).toFixed(2)),
          ),
          ramMb: Math.max(0, hostCap.hardware.ramMb - hostCap.reserved.ramMb - allocatedNow.ramMb),
          storageGb: Math.max(
            0,
            hostCap.hardware.storageGb - hostCap.reserved.storageGb - allocatedNow.storageGb,
          ),
        },
      };
      const fit = checkCapacityFits(liveCap, {
        cpuCores: h.cpu_cores,
        ramMb: h.ram_mb,
        storageGb: h.storage_gb,
      });
      if (!fit.ok) return fit;
    }

    db().prepare(`UPDATE hosting_accounts SET status = ? WHERE id = ?`).run(nextStatus, hostingId);
    return { ok: true };
  })();

  if (res.ok) {
    writeAudit({
      actorId: s.userId,
      action: "hosting.status",
      target: String(hostingId),
      result: "ok",
      message: `status=${nextStatus}`,
    });
    revalidatePath("/hosting");
    revalidatePath("/packages");
    revalidatePath("/dashboard");
  }
  return res;
}

export async function deleteHostingAction(hostingId: number): Promise<ActionResult> {
  const s = await requireSession();
  if (!isSuperAdmin(s.role)) {
    return { ok: false, error: "Forbidden: Super Admin required." };
  }

  const h = db()
    .prepare(`SELECT id, domain FROM hosting_accounts WHERE id = ?`)
    .get(hostingId) as { id: number; domain: string } | undefined;
  if (!h) return { ok: false, error: "Hosting account not found." };

  db().prepare(`DELETE FROM hosting_accounts WHERE id = ?`).run(hostingId);

  writeAudit({
    actorId: s.userId,
    action: "hosting.delete",
    target: h.domain,
    result: "ok",
  });
  revalidatePath("/hosting");
  revalidatePath("/packages");
  revalidatePath("/dashboard");
  return { ok: true };
}
