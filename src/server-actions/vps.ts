"use server";

import { revalidatePath } from "next/cache";
import { agent } from "@/lib/agent";
import { writeAudit } from "@/lib/audit";
import { isSuperAdmin, requireSession } from "@/lib/auth";
import { hashPassword } from "@/lib/crypto";
import { db } from "@/lib/db";
import {
  DEFAULT_VPS_ADMIN_MODULES,
  normalizeRole,
  serializePermissions,
} from "@/lib/permissions";
import {
  checkCapacityFits,
  getHostCapacity,
  getPackageById,
  readAllocatedFromDb,
} from "@/lib/provisioning";
import type { PanelChoiceId } from "@/lib/panelOffers";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const HOST_LABEL_RE = /^[a-z0-9][a-z0-9.-]{1,62}[a-z0-9]$/;
const UNIX_USER_RE = /^[a-z_][a-z0-9_-]{0,31}$/;
const VALID_PANELS = new Set<PanelChoiceId>([
  "paix",
  "cpanel",
  "aapanel",
  "cyberpanel",
  "hestia",
  "plesk",
  "custom",
]);

export async function provisionVpsAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const s = await requireSession();
  if (!isSuperAdmin(s.role)) {
    return { ok: false, error: "Forbidden: only Super Admin can register and allocate VPS instances." };
  }

  const name = String(fd.get("name") ?? "").trim().toLowerCase();
  const packageId = Number(fd.get("package_id") ?? 0);
  const ownerMode = String(fd.get("owner_mode") ?? "new");
  const existingUserId = Number(fd.get("existing_user_id") ?? 0);
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const displayName = String(fd.get("display_name") ?? "").trim().slice(0, 80);
  const password = String(fd.get("password") ?? "");
  const sshIpInput = String(fd.get("ssh_ip") ?? "").trim();
  const sshPortRaw = Number(fd.get("ssh_port") ?? 22);
  const sshUser = String(fd.get("ssh_user") ?? "root").trim().toLowerCase() || "root";
  const createLinuxUser = fd.get("create_linux_user") === "on";
  const osTemplate = String(fd.get("os_template") ?? "Ubuntu 24.04 LTS").trim().slice(0, 64);
  const initialPanelRaw = String(fd.get("panel_choice") ?? "paix").trim().toLowerCase() as PanelChoiceId;
  const panelChoice: PanelChoiceId = VALID_PANELS.has(initialPanelRaw) ? initialPanelRaw : "paix";
  const notes = String(fd.get("notes") ?? "").trim().slice(0, 500);

  if (!name || !HOST_LABEL_RE.test(name)) {
    return {
      ok: false,
      error: "VPS hostname/name must be 3-64 chars (lowercase letters, digits, dots, hyphens).",
    };
  }
  if (!Number.isInteger(packageId) || packageId <= 0) {
    return { ok: false, error: "Select a valid VPS package." };
  }
  const pkg = getPackageById(packageId);
  if (!pkg || pkg.kind !== "vps") {
    return { ok: false, error: "Selected package is not a valid VPS package." };
  }
  if (!pkg.is_active) {
    return { ok: false, error: "Selected VPS package is archived/disabled." };
  }

  const sshPort = Number.isInteger(sshPortRaw) && sshPortRaw >= 1 && sshPortRaw <= 65535 ? sshPortRaw : 22;
  if (!UNIX_USER_RE.test(sshUser)) {
    return { ok: false, error: "Invalid SSH username (lowercase a-z, 0-9, _, -)." };
  }
  if (createLinuxUser && sshUser === "root") {
    return { ok: false, error: "Choose a non-root SSH username when creating a dedicated Linux user." };
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
  const sshIp = sshIpInput || hostCap.serverIp;

  // Atomic SQLite transaction ensures concurrent requests cannot over-allocate host resources.
  const txResult = db().transaction((): ActionResult<{ vpsId: number }> => {
    const clash = db()
      .prepare(`SELECT id FROM vps_instances WHERE LOWER(name) = LOWER(?)`)
      .get(name) as { id: number } | undefined;
    if (clash) {
      return { ok: false, error: `A VPS named "${name}" already exists.` };
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

    const vpsPermsJson = serializePermissions({
      modules: DEFAULT_VPS_ADMIN_MODULES,
      scopes: {},
    });

    let targetUserId = existingUserId;
    if (ownerMode === "new") {
      const existingEmail = db()
        .prepare(`SELECT id FROM users WHERE LOWER(email) = ?`)
        .get(email) as { id: number } | undefined;
      if (existingEmail) {
        return { ok: false, error: `Panel user "${email}" already exists. Choose "Assign Existing User" instead.` };
      }
      const userInsert = db()
        .prepare(
          `INSERT INTO users
            (email, display_name, password_hash, role, permissions_json, google_enabled, is_active)
           VALUES (?, ?, ?, 'vps_admin', ?, 1, 1)`,
        )
        .run(email, displayName || name, hashedPw, vpsPermsJson);
      targetUserId = Number(userInsert.lastInsertRowid);
    } else {
      const userRow = db()
        .prepare(`SELECT id, role FROM users WHERE id = ?`)
        .get(existingUserId) as { id: number; role: string } | undefined;
      if (!userRow) {
        return { ok: false, error: "Selected panel user was not found." };
      }
      const currentRole = normalizeRole(userRow.role);
      if (currentRole !== "super_admin" && currentRole !== "admin") {
        db()
          .prepare(`UPDATE users SET role = 'vps_admin', permissions_json = ? WHERE id = ?`)
          .run(vpsPermsJson, existingUserId);
      }
    }

    const vpsInsert = db()
      .prepare(
        `INSERT INTO vps_instances
          (name, user_id, package_id, status, ssh_ip, ssh_port, ssh_user, linux_user,
           os_template, panel_choice, cpu_cores, ram_mb, storage_gb, bandwidth_gb, notes)
         VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        name,
        targetUserId,
        pkg.id,
        sshIp,
        sshPort,
        sshUser,
        createLinuxUser ? sshUser : "",
        osTemplate || "Ubuntu 24.04 LTS",
        panelChoice,
        pkg.cpu_cores,
        pkg.ram_mb,
        pkg.storage_gb,
        pkg.bandwidth_gb,
        notes,
      );

    return { ok: true, data: { vpsId: Number(vpsInsert.lastInsertRowid) } };
  })();

  if (!txResult.ok) return txResult;

  if (createLinuxUser && sshUser !== "root") {
    const linuxPw = password || `${Math.random().toString(36).slice(2)}Paix!2026`;
    await agent.system
      .createUser({ name: sshUser, password: linuxPw, sudo: true, shell: "/bin/bash" })
      .catch(() => null);
  }

  writeAudit({
    actorId: s.userId,
    action: "vps.provision",
    target: name,
    result: "ok",
    message: `pkg=${pkg.slug} cpu=${pkg.cpu_cores} ram=${pkg.ram_mb}MB storage=${pkg.storage_gb}GB panel=${panelChoice}`,
  });

  revalidatePath("/vps");
  revalidatePath("/packages");
  revalidatePath("/users");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function resizeVpsPackageAction(
  vpsId: number,
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const s = await requireSession();
  if (!isSuperAdmin(s.role)) {
    return { ok: false, error: "Forbidden: Super Admin required." };
  }

  const newPackageId = Number(fd.get("package_id") ?? 0);
  const pkg = getPackageById(newPackageId);
  if (!pkg || pkg.kind !== "vps") {
    return { ok: false, error: "Select a valid VPS package." };
  }

  const hostCap = await getHostCapacity();

  const res = db().transaction((): ActionResult => {
    const vps = db()
      .prepare(`SELECT * FROM vps_instances WHERE id = ?`)
      .get(vpsId) as
      | { id: number; name: string; status: string; cpu_cores: number; ram_mb: number; storage_gb: number }
      | undefined;
    if (!vps) return { ok: false, error: "VPS instance not found." };

    if (vps.status !== "terminated") {
      const deltaCpu = pkg.cpu_cores - vps.cpu_cores;
      const deltaRam = pkg.ram_mb - vps.ram_mb;
      const deltaStorage = pkg.storage_gb - vps.storage_gb;
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
        cpuCores: Math.max(0, deltaCpu),
        ramMb: Math.max(0, deltaRam),
        storageGb: Math.max(0, deltaStorage),
      });
      if (!fit.ok) return fit;
    }

    db()
      .prepare(
        `UPDATE vps_instances
            SET package_id = ?, cpu_cores = ?, ram_mb = ?, storage_gb = ?, bandwidth_gb = ?
          WHERE id = ?`,
      )
      .run(pkg.id, pkg.cpu_cores, pkg.ram_mb, pkg.storage_gb, pkg.bandwidth_gb, vpsId);

    return { ok: true };
  })();

  if (res.ok) {
    writeAudit({
      actorId: s.userId,
      action: "vps.resize",
      target: String(vpsId),
      result: "ok",
      message: `pkg=${pkg.slug}`,
    });
    revalidatePath("/vps");
    revalidatePath("/packages");
    revalidatePath("/dashboard");
  }
  return res;
}

export async function updateVpsStatusAction(
  vpsId: number,
  nextStatus: "active" | "suspended" | "terminated",
): Promise<ActionResult> {
  const s = await requireSession();
  if (!isSuperAdmin(s.role)) {
    return { ok: false, error: "Forbidden: Super Admin required." };
  }

  const hostCap = await getHostCapacity();
  const res = db().transaction((): ActionResult => {
    const vps = db()
      .prepare(`SELECT id, name, status, cpu_cores, ram_mb, storage_gb FROM vps_instances WHERE id = ?`)
      .get(vpsId) as
      | { id: number; name: string; status: string; cpu_cores: number; ram_mb: number; storage_gb: number }
      | undefined;
    if (!vps) return { ok: false, error: "VPS instance not found." };

    if (vps.status === "terminated" && nextStatus !== "terminated") {
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
        cpuCores: vps.cpu_cores,
        ramMb: vps.ram_mb,
        storageGb: vps.storage_gb,
      });
      if (!fit.ok) return fit;
    }

    db().prepare(`UPDATE vps_instances SET status = ? WHERE id = ?`).run(nextStatus, vpsId);
    return { ok: true };
  })();

  if (res.ok) {
    writeAudit({
      actorId: s.userId,
      action: "vps.status",
      target: String(vpsId),
      result: "ok",
      message: `status=${nextStatus}`,
    });
    revalidatePath("/vps");
    revalidatePath("/packages");
    revalidatePath("/dashboard");
  }
  return res;
}

export async function deleteVpsAction(vpsId: number): Promise<ActionResult> {
  const s = await requireSession();
  if (!isSuperAdmin(s.role)) {
    return { ok: false, error: "Forbidden: Super Admin required." };
  }

  const vps = db()
    .prepare(`SELECT id, name, linux_user FROM vps_instances WHERE id = ?`)
    .get(vpsId) as { id: number; name: string; linux_user: string } | undefined;
  if (!vps) return { ok: false, error: "VPS instance not found." };

  db().prepare(`DELETE FROM vps_instances WHERE id = ?`).run(vpsId);

  writeAudit({
    actorId: s.userId,
    action: "vps.delete",
    target: vps.name,
    result: "ok",
    message: "freed allocated CPU/RAM/Storage back to host pool",
  });

  revalidatePath("/vps");
  revalidatePath("/packages");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateMyVpsPanelChoiceAction(
  vpsId: number,
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const s = await requireSession();
  const vps = db()
    .prepare(`SELECT id, user_id, name FROM vps_instances WHERE id = ?`)
    .get(vpsId) as { id: number; user_id: number; name: string } | undefined;
  if (!vps) return { ok: false, error: "VPS instance not found." };

  if (vps.user_id !== s.userId && !isSuperAdmin(s.role)) {
    return { ok: false, error: "Forbidden: you do not own this VPS instance." };
  }

  const choiceRaw = String(fd.get("panel_choice") ?? "paix").trim().toLowerCase() as PanelChoiceId;
  const panelChoice: PanelChoiceId = VALID_PANELS.has(choiceRaw) ? choiceRaw : "paix";
  const customPanelName = String(fd.get("custom_panel_name") ?? "").trim().slice(0, 80);
  const customPanelUrl = String(fd.get("custom_panel_url") ?? "").trim().slice(0, 240);
  const customInstallerCmd = String(fd.get("custom_installer_cmd") ?? "").trim().slice(0, 1200);

  if (customPanelUrl && !/^https?:\/\/.+/i.test(customPanelUrl)) {
    return { ok: false, error: "Custom panel URL must start with http:// or https://" };
  }

  db()
    .prepare(
      `UPDATE vps_instances
          SET panel_choice = ?,
              custom_panel_name = ?,
              custom_panel_url = ?,
              custom_installer_cmd = ?
        WHERE id = ?`,
    )
    .run(panelChoice, customPanelName, customPanelUrl, customInstallerCmd, vpsId);

  writeAudit({
    actorId: s.userId,
    action: "vps.panel_choice",
    target: vps.name,
    result: "ok",
    message: `panel=${panelChoice}`,
  });

  revalidatePath("/vps");
  revalidatePath("/dashboard");
  return { ok: true };
}
