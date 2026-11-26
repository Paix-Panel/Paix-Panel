"use server";

import { revalidatePath } from "next/cache";
import { isSuperAdmin, requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { saveHostReserves } from "@/lib/provisioning";
import type { PackageKind } from "@/lib/panelOffers";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

function slugify(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function numField(fd: FormData, key: string, fallback: number, min = 0, max = 1_000_000): number {
  const v = Number(fd.get(key));
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

function intField(fd: FormData, key: string, fallback: number, min = 0, max = 10_000_000): number {
  return Math.round(numField(fd, key, fallback, min, max));
}

function boolField(fd: FormData, key: string): number {
  return fd.get(key) === "on" || fd.get(key) === "true" || fd.get(key) === "1" ? 1 : 0;
}

export async function createPackageAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const s = await requireSession();
  if (!isSuperAdmin(s.role)) {
    return { ok: false, error: "Forbidden: only Super Admin can create packages." };
  }

  const name = String(fd.get("name") ?? "").trim().slice(0, 80);
  const kindRaw = String(fd.get("kind") ?? "vps").trim().toLowerCase();
  const kind: PackageKind = kindRaw === "hosting" ? "hosting" : "vps";
  const slugInput = String(fd.get("slug") ?? "").trim();
  const slug = slugify(slugInput || name);
  const description = String(fd.get("description") ?? "").trim().slice(0, 500);

  if (!name) return { ok: false, error: "Package name is required." };
  if (!slug) return { ok: false, error: "Valid package slug is required." };

  const cpuCores = Number(numField(fd, "cpu_cores", kind === "vps" ? 1 : 0.25, 0, 256).toFixed(2));
  const ramMb = intField(fd, "ram_mb", kind === "vps" ? 1024 : 256, 64, 1_048_576);
  const storageGb = intField(fd, "storage_gb", kind === "vps" ? 40 : 10, 1, 100_000);
  const swapMb = intField(fd, "swap_mb", kind === "vps" ? 512 : 0, 0, 262_144);
  const bandwidthGb = intField(fd, "bandwidth_gb", 1000, 0, 1_000_000);
  const portSpeedMbps = intField(fd, "port_speed_mbps", 1000, 10, 100_000);

  if (kind === "vps" && cpuCores < 0.25) {
    return { ok: false, error: "VPS package must allocate at least 0.25 CPU core." };
  }

  const maxDomains = intField(fd, "max_domains", kind === "vps" ? 0 : 1, 0, 10_000);
  const maxSubdomains = intField(fd, "max_subdomains", kind === "vps" ? 0 : 10, 0, 100_000);
  const maxApps = intField(fd, "max_apps", kind === "vps" ? 0 : 3, 0, 10_000);
  const maxDatabases = intField(fd, "max_databases", kind === "vps" ? 0 : 5, 0, 10_000);
  const maxMailboxes = intField(fd, "max_mailboxes", kind === "vps" ? 0 : 10, 0, 100_000);
  const mailboxQuotaMb = intField(fd, "mailbox_quota_mb", 1024, 50, 1_048_576);
  const maxFtpAccounts = intField(fd, "max_ftp_accounts", kind === "vps" ? 0 : 3, 0, 10_000);
  const backupSlots = intField(fd, "backup_slots", 3, 0, 365);

  const sshAccess = boolField(fd, "ssh_access");
  const sslIncluded = boolField(fd, "ssl_included");
  const dedicatedIp = boolField(fd, "dedicated_ip");
  const priceLabel = String(fd.get("price_label") ?? "Custom").trim().slice(0, 40) || "Custom";
  const billingCycleRaw = String(fd.get("billing_cycle") ?? "monthly").trim().toLowerCase();
  const billingCycle = ["monthly", "yearly", "free", "one-time"].includes(billingCycleRaw)
    ? billingCycleRaw
    : "monthly";

  const clash = db()
    .prepare(`SELECT id FROM service_packages WHERE LOWER(name) = LOWER(?) OR LOWER(slug) = LOWER(?)`)
    .get(name, slug) as { id: number } | undefined;
  if (clash) {
    return { ok: false, error: "A package with that name or slug already exists." };
  }

  db()
    .prepare(
      `INSERT INTO service_packages
        (name, slug, kind, description, cpu_cores, ram_mb, storage_gb, swap_mb,
         bandwidth_gb, port_speed_mbps, max_domains, max_subdomains, max_apps,
         max_databases, max_mailboxes, mailbox_quota_mb, max_ftp_accounts,
         backup_slots, ssh_access, ssl_included, dedicated_ip, price_label, billing_cycle, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    )
    .run(
      name,
      slug,
      kind,
      description,
      cpuCores,
      ramMb,
      storageGb,
      swapMb,
      bandwidthGb,
      portSpeedMbps,
      maxDomains,
      maxSubdomains,
      maxApps,
      maxDatabases,
      maxMailboxes,
      mailboxQuotaMb,
      maxFtpAccounts,
      backupSlots,
      sshAccess,
      sslIncluded,
      dedicatedIp,
      priceLabel,
      billingCycle,
    );

  writeAudit({
    actorId: s.userId,
    action: "packages.create",
    target: `${kind}:${slug}`,
    result: "ok",
    message: `cpu=${cpuCores} ram=${ramMb}MB storage=${storageGb}GB bw=${bandwidthGb}GB`,
  });

  revalidatePath("/packages");
  revalidatePath("/vps");
  revalidatePath("/hosting");
  return { ok: true };
}

export async function updatePackageAction(
  packageId: number,
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const s = await requireSession();
  if (!isSuperAdmin(s.role)) {
    return { ok: false, error: "Forbidden: only Super Admin can edit packages." };
  }

  const existing = db()
    .prepare(`SELECT * FROM service_packages WHERE id = ?`)
    .get(packageId) as { id: number; kind: PackageKind; slug: string } | undefined;
  if (!existing) return { ok: false, error: "Package not found." };

  const name = String(fd.get("name") ?? "").trim().slice(0, 80);
  if (!name) return { ok: false, error: "Package name is required." };

  const description = String(fd.get("description") ?? "").trim().slice(0, 500);
  const cpuCores = Number(numField(fd, "cpu_cores", 1, 0, 256).toFixed(2));
  const ramMb = intField(fd, "ram_mb", 1024, 64, 1_048_576);
  const storageGb = intField(fd, "storage_gb", 20, 1, 100_000);
  const swapMb = intField(fd, "swap_mb", 0, 0, 262_144);
  const bandwidthGb = intField(fd, "bandwidth_gb", 1000, 0, 1_000_000);
  const portSpeedMbps = intField(fd, "port_speed_mbps", 1000, 10, 100_000);
  const maxDomains = intField(fd, "max_domains", 1, 0, 10_000);
  const maxSubdomains = intField(fd, "max_subdomains", 10, 0, 100_000);
  const maxApps = intField(fd, "max_apps", 3, 0, 10_000);
  const maxDatabases = intField(fd, "max_databases", 5, 0, 10_000);
  const maxMailboxes = intField(fd, "max_mailboxes", 10, 0, 100_000);
  const mailboxQuotaMb = intField(fd, "mailbox_quota_mb", 1024, 50, 1_048_576);
  const maxFtpAccounts = intField(fd, "max_ftp_accounts", 3, 0, 10_000);
  const backupSlots = intField(fd, "backup_slots", 3, 0, 365);
  const sshAccess = boolField(fd, "ssh_access");
  const sslIncluded = boolField(fd, "ssl_included");
  const dedicatedIp = boolField(fd, "dedicated_ip");
  const isActive = boolField(fd, "is_active");
  const priceLabel = String(fd.get("price_label") ?? "Custom").trim().slice(0, 40) || "Custom";
  const billingCycleRaw = String(fd.get("billing_cycle") ?? "monthly").trim().toLowerCase();
  const billingCycle = ["monthly", "yearly", "free", "one-time"].includes(billingCycleRaw)
    ? billingCycleRaw
    : "monthly";

  if (existing.kind === "vps" && cpuCores < 0.25) {
    return { ok: false, error: "VPS package must allocate at least 0.25 CPU core." };
  }

  db()
    .prepare(
      `UPDATE service_packages
          SET name = ?, description = ?, cpu_cores = ?, ram_mb = ?, storage_gb = ?,
              swap_mb = ?, bandwidth_gb = ?, port_speed_mbps = ?, max_domains = ?,
              max_subdomains = ?, max_apps = ?, max_databases = ?, max_mailboxes = ?,
              mailbox_quota_mb = ?, max_ftp_accounts = ?, backup_slots = ?,
              ssh_access = ?, ssl_included = ?, dedicated_ip = ?, price_label = ?,
              billing_cycle = ?, is_active = ?
        WHERE id = ?`,
    )
    .run(
      name,
      description,
      cpuCores,
      ramMb,
      storageGb,
      swapMb,
      bandwidthGb,
      portSpeedMbps,
      maxDomains,
      maxSubdomains,
      maxApps,
      maxDatabases,
      maxMailboxes,
      mailboxQuotaMb,
      maxFtpAccounts,
      backupSlots,
      sshAccess,
      sslIncluded,
      dedicatedIp,
      priceLabel,
      billingCycle,
      isActive,
      packageId,
    );

  writeAudit({
    actorId: s.userId,
    action: "packages.update",
    target: `${existing.kind}:${existing.slug}`,
    result: "ok",
    message: `cpu=${cpuCores} ram=${ramMb}MB storage=${storageGb}GB active=${isActive}`,
  });

  revalidatePath("/packages");
  revalidatePath("/vps");
  revalidatePath("/hosting");
  return { ok: true };
}

export async function togglePackageActiveAction(
  packageId: number,
  active: boolean,
): Promise<ActionResult> {
  const s = await requireSession();
  if (!isSuperAdmin(s.role)) {
    return { ok: false, error: "Forbidden: Super Admin required." };
  }
  db()
    .prepare(`UPDATE service_packages SET is_active = ? WHERE id = ?`)
    .run(active ? 1 : 0, packageId);
  writeAudit({
    actorId: s.userId,
    action: "packages.toggle",
    target: String(packageId),
    result: "ok",
    message: `active=${active ? 1 : 0}`,
  });
  revalidatePath("/packages");
  revalidatePath("/vps");
  revalidatePath("/hosting");
  return { ok: true };
}

export async function deletePackageAction(packageId: number): Promise<ActionResult> {
  const s = await requireSession();
  if (!isSuperAdmin(s.role)) {
    return { ok: false, error: "Forbidden: Super Admin required." };
  }

  const vpsRefs = db()
    .prepare(`SELECT COUNT(*) AS c FROM vps_instances WHERE package_id = ?`)
    .get(packageId) as { c: number };
  const hostRefs = db()
    .prepare(`SELECT COUNT(*) AS c FROM hosting_accounts WHERE package_id = ?`)
    .get(packageId) as { c: number };

  if (vpsRefs.c > 0 || hostRefs.c > 0) {
    return {
      ok: false,
      error: `Cannot delete package while ${vpsRefs.c} VPS and ${hostRefs.c} Hosting account(s) reference it. Disable/archive it or migrate accounts first.`,
    };
  }

  const pkg = db()
    .prepare(`SELECT slug, kind FROM service_packages WHERE id = ?`)
    .get(packageId) as { slug: string; kind: string } | undefined;
  if (!pkg) return { ok: false, error: "Package not found." };

  db().prepare(`DELETE FROM service_packages WHERE id = ?`).run(packageId);
  writeAudit({
    actorId: s.userId,
    action: "packages.delete",
    target: `${pkg.kind}:${pkg.slug}`,
    result: "ok",
  });
  revalidatePath("/packages");
  return { ok: true };
}

export async function updateHostReserveAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const s = await requireSession();
  if (!isSuperAdmin(s.role)) {
    return { ok: false, error: "Forbidden: Super Admin required." };
  }
  const cpuCores = numField(fd, "reserve_cpu_cores", 0, 0, 128);
  const ramMb = intField(fd, "reserve_ram_mb", 0, 0, 1_048_576);
  const storageGb = intField(fd, "reserve_storage_gb", 0, 0, 100_000);

  saveHostReserves({ cpuCores, ramMb, storageGb });
  writeAudit({
    actorId: s.userId,
    action: "host.reserves.update",
    target: "host_pool",
    result: "ok",
    message: `cpu=${cpuCores} ram=${ramMb}MB storage=${storageGb}GB`,
  });
  revalidatePath("/packages");
  revalidatePath("/vps");
  revalidatePath("/hosting");
  revalidatePath("/dashboard");
  return { ok: true };
}
