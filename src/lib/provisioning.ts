import "server-only";
import type Database from "better-sqlite3";
import { agent } from "./agent";
import { db } from "./db";
import { getServerAddress } from "./serverAddress";
import { getSettingNumber, setSetting } from "./settings";
import type { PackageKind, PanelChoiceId } from "./panelOffers";

export type ServicePackageRow = {
  id: number;
  name: string;
  slug: string;
  kind: PackageKind;
  description: string;
  cpu_cores: number;
  ram_mb: number;
  storage_gb: number;
  swap_mb: number;
  bandwidth_gb: number;
  port_speed_mbps: number;
  max_domains: number;
  max_subdomains: number;
  max_apps: number;
  max_databases: number;
  max_mailboxes: number;
  mailbox_quota_mb: number;
  max_ftp_accounts: number;
  backup_slots: number;
  ssh_access: number;
  ssl_included: number;
  dedicated_ip: number;
  price_label: string;
  billing_cycle: string;
  is_active: number;
  created_at: string;
};

export type VpsInstanceRow = {
  id: number;
  name: string;
  user_id: number;
  package_id: number;
  status: "active" | "suspended" | "terminated";
  ssh_ip: string;
  ssh_port: number;
  ssh_user: string;
  linux_user: string;
  os_template: string;
  panel_choice: PanelChoiceId;
  custom_panel_name: string;
  custom_panel_url: string;
  custom_installer_cmd: string;
  cpu_cores: number;
  ram_mb: number;
  storage_gb: number;
  bandwidth_gb: number;
  storage_used_mb: number;
  bandwidth_used_gb: number;
  notes: string;
  created_at: string;
};

export type VpsInstanceView = VpsInstanceRow & {
  owner_email: string;
  owner_name: string;
  package_name: string;
  package_price: string;
  port_speed_mbps: number;
};

export type HostingAccountRow = {
  id: number;
  label: string;
  domain: string;
  user_id: number;
  package_id: number;
  status: "active" | "suspended" | "terminated";
  root_dir: string;
  linux_user: string;
  cpu_cores: number;
  ram_mb: number;
  storage_gb: number;
  bandwidth_gb: number;
  max_domains: number;
  max_subdomains: number;
  max_apps: number;
  max_databases: number;
  max_mailboxes: number;
  max_ftp_accounts: number;
  backup_slots: number;
  ssh_access: number;
  ssl_included: number;
  notes: string;
  created_at: string;
};

export type HostingAccountView = HostingAccountRow & {
  owner_email: string;
  owner_name: string;
  package_name: string;
  package_price: string;
  mailbox_quota_mb: number;
};

export type HostCapacitySummary = {
  serverIp: string;
  serverHost: string | null;
  hardware: {
    cpuCores: number;
    ramMb: number;
    storageGb: number;
    storageFreeOnDiskGb: number;
  };
  reserved: {
    cpuCores: number;
    ramMb: number;
    storageGb: number;
  };
  allocated: {
    cpuCores: number;
    ramMb: number;
    storageGb: number;
    bandwidthGb: number;
    vpsCpuCores: number;
    vpsRamMb: number;
    vpsStorageGb: number;
    hostingCpuCores: number;
    hostingRamMb: number;
    hostingStorageGb: number;
    activeVpsCount: number;
    suspendedVpsCount: number;
    activeHostingCount: number;
    suspendedHostingCount: number;
  };
  available: {
    cpuCores: number;
    ramMb: number;
    storageGb: number;
  };
};

export const RESERVE_CPU_KEY = "host.reserve_cpu_cores";
export const RESERVE_RAM_KEY = "host.reserve_ram_mb";
export const RESERVE_STORAGE_KEY = "host.reserve_storage_gb";

export function readHostReserves(): {
  cpuCores: number;
  ramMb: number;
  storageGb: number;
} {
  const cpuRaw = Number(getSettingNumber(RESERVE_CPU_KEY, 0));
  const ramRaw = Number(getSettingNumber(RESERVE_RAM_KEY, 0));
  const storageRaw = Number(getSettingNumber(RESERVE_STORAGE_KEY, 0));
  return {
    cpuCores: Number.isFinite(cpuRaw) && cpuRaw > 0 ? cpuRaw : 0,
    ramMb: Number.isFinite(ramRaw) && ramRaw > 0 ? Math.floor(ramRaw) : 0,
    storageGb: Number.isFinite(storageRaw) && storageRaw > 0 ? Math.floor(storageRaw) : 0,
  };
}

export function saveHostReserves(reserves: {
  cpuCores: number;
  ramMb: number;
  storageGb: number;
}): void {
  setSetting(RESERVE_CPU_KEY, String(Math.max(0, reserves.cpuCores)));
  setSetting(RESERVE_RAM_KEY, String(Math.max(0, Math.floor(reserves.ramMb))));
  setSetting(RESERVE_STORAGE_KEY, String(Math.max(0, Math.floor(reserves.storageGb))));
}

export function readAllocatedFromDb(handle: Database.Database = db()) {
  const vpsAgg = handle
    .prepare(
      `SELECT
         COALESCE(SUM(cpu_cores), 0) AS cpu,
         COALESCE(SUM(ram_mb), 0) AS ram,
         COALESCE(SUM(storage_gb), 0) AS storage,
         COALESCE(SUM(bandwidth_gb), 0) AS bw,
         COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) AS active_cnt,
         COALESCE(SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END), 0) AS susp_cnt
       FROM vps_instances
       WHERE status != 'terminated'`,
    )
    .get() as {
    cpu: number;
    ram: number;
    storage: number;
    bw: number;
    active_cnt: number;
    susp_cnt: number;
  };

  const hostAgg = handle
    .prepare(
      `SELECT
         COALESCE(SUM(cpu_cores), 0) AS cpu,
         COALESCE(SUM(ram_mb), 0) AS ram,
         COALESCE(SUM(storage_gb), 0) AS storage,
         COALESCE(SUM(bandwidth_gb), 0) AS bw,
         COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) AS active_cnt,
         COALESCE(SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END), 0) AS susp_cnt
       FROM hosting_accounts
       WHERE status != 'terminated'`,
    )
    .get() as {
    cpu: number;
    ram: number;
    storage: number;
    bw: number;
    active_cnt: number;
    susp_cnt: number;
  };

  return {
    cpuCores: Number((vpsAgg.cpu + hostAgg.cpu).toFixed(2)),
    ramMb: Math.round(vpsAgg.ram + hostAgg.ram),
    storageGb: Math.round(vpsAgg.storage + hostAgg.storage),
    bandwidthGb: Math.round(vpsAgg.bw + hostAgg.bw),
    vpsCpuCores: Number(vpsAgg.cpu.toFixed(2)),
    vpsRamMb: Math.round(vpsAgg.ram),
    vpsStorageGb: Math.round(vpsAgg.storage),
    hostingCpuCores: Number(hostAgg.cpu.toFixed(2)),
    hostingRamMb: Math.round(hostAgg.ram),
    hostingStorageGb: Math.round(hostAgg.storage),
    activeVpsCount: vpsAgg.active_cnt,
    suspendedVpsCount: vpsAgg.susp_cnt,
    activeHostingCount: hostAgg.active_cnt,
    suspendedHostingCount: hostAgg.susp_cnt,
  };
}

export async function getHostCapacity(): Promise<HostCapacitySummary> {
  const [sys, addr] = await Promise.all([
    agent.sysinfo().catch(() => null),
    getServerAddress().catch(() => ({ domain: null, ip: null })),
  ]);

  const rootDisk = sys?.disk?.find((d) => d.mount === "/") ?? sys?.disk?.[0] ?? null;
  const hwCpu = sys ? Math.max(1, Number(sys.cpu_count || 1)) : 2;
  const hwRamMb = sys ? Math.max(512, Math.round(sys.mem_total_kb / 1024)) : 4096;
  const hwStorageGb = rootDisk
    ? Math.max(10, Math.floor(rootDisk.total_bytes / (1024 * 1024 * 1024)))
    : 100;
  const diskFreeGb = rootDisk
    ? Math.max(0, Math.floor(rootDisk.free_bytes / (1024 * 1024 * 1024)))
    : hwStorageGb;

  const reserved = readHostReserves();
  const allocated = readAllocatedFromDb();

  const availCpu = Math.max(
    0,
    Number((hwCpu - reserved.cpuCores - allocated.cpuCores).toFixed(2)),
  );
  const availRam = Math.max(0, hwRamMb - reserved.ramMb - allocated.ramMb);
  const availStorage = Math.max(0, hwStorageGb - reserved.storageGb - allocated.storageGb);

  return {
    serverIp: addr.ip || "203.0.113.42",
    serverHost: addr.domain || null,
    hardware: {
      cpuCores: hwCpu,
      ramMb: hwRamMb,
      storageGb: hwStorageGb,
      storageFreeOnDiskGb: diskFreeGb,
    },
    reserved,
    allocated,
    available: {
      cpuCores: availCpu,
      ramMb: availRam,
      storageGb: availStorage,
    },
  };
}

export function checkCapacityFits(
  capacity: HostCapacitySummary,
  delta: { cpuCores: number; ramMb: number; storageGb: number },
): { ok: true } | { ok: false; error: string } {
  const problems: string[] = [];
  if (delta.cpuCores > 0 && delta.cpuCores > capacity.available.cpuCores + 1e-6) {
    problems.push(
      `CPU: requested ${delta.cpuCores} vCPU, only ${capacity.available.cpuCores} vCPU remaining`,
    );
  }
  if (delta.ramMb > 0 && delta.ramMb > capacity.available.ramMb) {
    problems.push(
      `RAM: requested ${formatMb(delta.ramMb)}, only ${formatMb(capacity.available.ramMb)} remaining`,
    );
  }
  if (delta.storageGb > 0 && delta.storageGb > capacity.available.storageGb) {
    problems.push(
      `Storage: requested ${delta.storageGb} GB, only ${capacity.available.storageGb} GB remaining`,
    );
  }
  if (problems.length > 0) {
    return {
      ok: false,
      error: `Insufficient server resources (${problems.join("; ")}). Free up capacity or adjust package limits.`,
    };
  }
  return { ok: true };
}

function formatMb(mb: number): string {
  if (mb >= 1024) {
    const gb = mb / 1024;
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
  }
  return `${mb} MB`;
}

export function listServicePackages(kind?: PackageKind): ServicePackageRow[] {
  const rows = kind
    ? (db()
        .prepare(`SELECT * FROM service_packages WHERE kind = ? ORDER BY cpu_cores ASC, ram_mb ASC, id ASC`)
        .all(kind) as ServicePackageRow[])
    : (db()
        .prepare(`SELECT * FROM service_packages ORDER BY kind ASC, cpu_cores ASC, ram_mb ASC, id ASC`)
        .all() as ServicePackageRow[]);
  return rows;
}

export function getPackageById(id: number): ServicePackageRow | null {
  const row = db()
    .prepare(`SELECT * FROM service_packages WHERE id = ?`)
    .get(id) as ServicePackageRow | undefined;
  return row ?? null;
}

export function listAllVpsInstances(): VpsInstanceView[] {
  return db()
    .prepare(
      `SELECT v.*,
              u.email AS owner_email,
              u.display_name AS owner_name,
              p.name AS package_name,
              p.price_label AS package_price,
              p.port_speed_mbps AS port_speed_mbps
         FROM vps_instances v
         JOIN users u ON u.id = v.user_id
         JOIN service_packages p ON p.id = v.package_id
        ORDER BY v.id DESC`,
    )
    .all() as VpsInstanceView[];
}

export function listVpsInstancesForUser(userId: number): VpsInstanceView[] {
  return db()
    .prepare(
      `SELECT v.*,
              u.email AS owner_email,
              u.display_name AS owner_name,
              p.name AS package_name,
              p.price_label AS package_price,
              p.port_speed_mbps AS port_speed_mbps
         FROM vps_instances v
         JOIN users u ON u.id = v.user_id
         JOIN service_packages p ON p.id = v.package_id
        WHERE v.user_id = ?
        ORDER BY v.id DESC`,
    )
    .all(userId) as VpsInstanceView[];
}

export function getVpsInstanceById(id: number): VpsInstanceView | null {
  const row = db()
    .prepare(
      `SELECT v.*,
              u.email AS owner_email,
              u.display_name AS owner_name,
              p.name AS package_name,
              p.price_label AS package_price,
              p.port_speed_mbps AS port_speed_mbps
         FROM vps_instances v
         JOIN users u ON u.id = v.user_id
         JOIN service_packages p ON p.id = v.package_id
        WHERE v.id = ?`,
    )
    .get(id) as VpsInstanceView | undefined;
  return row ?? null;
}

export function listAllHostingAccounts(): HostingAccountView[] {
  return db()
    .prepare(
      `SELECT h.*,
              u.email AS owner_email,
              u.display_name AS owner_name,
              p.name AS package_name,
              p.price_label AS package_price,
              p.mailbox_quota_mb AS mailbox_quota_mb
         FROM hosting_accounts h
         JOIN users u ON u.id = h.user_id
         JOIN service_packages p ON p.id = h.package_id
        ORDER BY h.id DESC`,
    )
    .all() as HostingAccountView[];
}

export function listHostingAccountsForUser(userId: number): HostingAccountView[] {
  return db()
    .prepare(
      `SELECT h.*,
              u.email AS owner_email,
              u.display_name AS owner_name,
              p.name AS package_name,
              p.price_label AS package_price,
              p.mailbox_quota_mb AS mailbox_quota_mb
         FROM hosting_accounts h
         JOIN users u ON u.id = h.user_id
         JOIN service_packages p ON p.id = h.package_id
        WHERE h.user_id = ?
        ORDER BY h.id DESC`,
    )
    .all(userId) as HostingAccountView[];
}

export function getHostingAccountById(id: number): HostingAccountView | null {
  const row = db()
    .prepare(
      `SELECT h.*,
              u.email AS owner_email,
              u.display_name AS owner_name,
              p.name AS package_name,
              p.price_label AS package_price,
              p.mailbox_quota_mb AS mailbox_quota_mb
         FROM hosting_accounts h
         JOIN users u ON u.id = h.user_id
         JOIN service_packages p ON p.id = h.package_id
        WHERE h.id = ?`,
    )
    .get(id) as HostingAccountView | undefined;
  return row ?? null;
}
