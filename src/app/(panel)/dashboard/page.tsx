import Link from "next/link";
import {
  Boxes,
  Clock,
  Database,
  FolderOpen,
  Globe,
  HardDrive,
  Mail,
  PlusSquare,
  Radio,
  ScrollText,
  Server,
  Settings,
  Shield,
  Terminal,
  Users,
} from "lucide-react";
import { agent } from "@/lib/agent";
import { requireSession } from "@/lib/auth";
import { getLiveAccessPublicState } from "@/lib/liveAccess";
import {
  hasAnyPermission,
  hasPermission,
  isAdminRole,
  isAppAllowed,
  isDomainAllowed,
  roleDisplayLabel,
} from "@/lib/permissions";
import { getServerAddress } from "@/lib/serverAddress";
import HealthChart from "@/components/HealthChart/HealthChart";
import Table from "@/components/Table/Table";
import styles from "@/components/page.module.css";
import grid from "./grid.module.css";
import FolderBreakdown from "./FolderBreakdown";
import { fetchLoadOne, fetchMemUsedPct } from "./samples";

export const dynamic = "force-dynamic";

type HubItem = {
  href: string;
  label: string;
  sub: string;
  icon: React.ReactNode;
};

export default async function DashboardPage() {
  const session = await requireSession();
  const canApps = hasPermission(session, "apps");
  const canDomains = hasPermission(session, "domains");
  const canFolders = hasAnyPermission(session, ["files", "services"]);
  const isAdmin = isAdminRole(session.role);

  const [info, rawApps, rawCerts, address] = await Promise.all([
    agent.sysinfo().catch(() => null),
    canApps ? agent.apps.list().catch(() => null) : Promise.resolve(null),
    canDomains ? agent.ssl.list().catch(() => null) : Promise.resolve(null),
    getServerAddress().catch(() => ({ domain: null, ip: null })),
  ]);
  const liveAccess = getLiveAccessPublicState();

  const apps = rawApps ? rawApps.filter((a) => isAppAllowed(session, a.name)) : null;
  const certs = rawCerts ? rawCerts.filter((c) => isDomainAllowed(session, c.domain)) : null;
  const hasAddress = !!(address.domain || address.ip);

  const runningApps = apps?.filter((a) => a.sub === "running").length ?? 0;
  const servingCerts = certs?.filter((c) => c.serving !== false) ?? [];
  const expiredCerts = servingCerts.filter((c) => c.days_remaining < 0).length;
  const expiringCerts = servingCerts.filter(
    (c) => c.days_remaining >= 0 && c.days_remaining < 30,
  ).length;
  const certSub = !certs
    ? "unavailable"
    : [
        expiredCerts ? `${expiredCerts} expired` : null,
        expiringCerts ? `${expiringCerts} expiring` : null,
      ]
        .filter(Boolean)
        .join(", ") || "all healthy";
  const certTone: "ok" | "warn" | "danger" | undefined = !certs
    ? undefined
    : expiredCerts
      ? "danger"
      : expiringCerts
        ? "warn"
        : "ok";

  const rootDisk =
    info?.disk?.find((d) => d.mount === "/") ?? info?.disk?.[0] ?? null;
  const diskUsedPct = rootDisk
    ? ((rootDisk.total_bytes - rootDisk.free_bytes) / rootDisk.total_bytes) * 100
    : 0;
  const diskTone: "ok" | "warn" | "danger" | undefined = !rootDisk
    ? undefined
    : diskUsedPct >= 90
      ? "danger"
      : diskUsedPct >= 75
        ? "warn"
        : "ok";

  const hubItems: HubItem[] = [];
  if (canApps) {
    hubItems.push(
      {
        href: "/apps",
        label: "Apps & Runtimes",
        sub: "Manage apps & deployments",
        icon: <Boxes size={16} />,
      },
      {
        href: "/apps/new?method=github",
        label: "Deploy New App",
        sub: "Node, Python, PHP, Go & Docker",
        icon: <PlusSquare size={16} />,
      },
    );
  }
  if (canDomains) {
    hubItems.push({
      href: "/domains",
      label: "Domains & SSL",
      sub: "Zones, nginx routing & HTTPS",
      icon: <Globe size={16} />,
    });
  }
  if (hasPermission(session, "databases")) {
    hubItems.push({
      href: "/databases",
      label: "Databases",
      sub: "MariaDB, PostgreSQL & SQL",
      icon: <Database size={16} />,
    });
  }
  if (hasPermission(session, "mail")) {
    hubItems.push({
      href: "/mailboxes",
      label: "Mailboxes",
      sub: "Email accounts & webmail",
      icon: <Mail size={16} />,
    });
  }
  if (hasPermission(session, "files")) {
    hubItems.push({
      href: "/files",
      label: "File Manager",
      sub: "Browse & edit app files",
      icon: <FolderOpen size={16} />,
    });
  }
  if (hasPermission(session, "backups")) {
    hubItems.push({
      href: "/backups",
      label: "Backups",
      sub: "Snapshots & disaster recovery",
      icon: <HardDrive size={16} />,
    });
  }
  if (hasPermission(session, "cron")) {
    hubItems.push({
      href: "/cron",
      label: "Cron Jobs",
      sub: "Scheduled tasks & timers",
      icon: <Clock size={16} />,
    });
  }
  if (hasPermission(session, "logs")) {
    hubItems.push({
      href: "/logs",
      label: "Live Logs",
      sub: "Journald & service tails",
      icon: <ScrollText size={16} />,
    });
  }
  if (hasPermission(session, "terminal")) {
    hubItems.push({
      href: "/terminal",
      label: "Web Terminal",
      sub: "Shell console access",
      icon: <Terminal size={16} />,
    });
  }
  if (hasPermission(session, "services")) {
    hubItems.push({
      href: "/services",
      label: "Services & Scale",
      sub: "Daemons & 20M+ scale addons",
      icon: <Server size={16} />,
    });
  }
  if (hasPermission(session, "security")) {
    hubItems.push({
      href: "/security",
      label: "Security & UFW",
      sub: "Firewall, SSH & fail2ban",
      icon: <Shield size={16} />,
    });
  }
  if (isAdmin) {
    hubItems.push({
      href: "/users",
      label: "Users & SSO",
      sub: "Roles, tasks & Google Auth",
      icon: <Users size={16} />,
    });
  }
  if (hasPermission(session, "settings")) {
    hubItems.push(
      {
        href: "/settings?tab=live-access",
        label: "IP / No-IP Live",
        sub:
          liveAccess.mode === "noip"
            ? `No-IP active (${liveAccess.hostname || liveAccess.provider.replace(/_/g, " ")})`
            : "Switch IP or No-IP keep-live",
        icon: <Radio size={16} />,
      },
      {
        href: "/settings",
        label: "Settings",
        sub: "Server, SSL email & Google SSO",
        icon: <Settings size={16} />,
      },
    );
  }

  return (
    <div>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Dashboard</h1>
          <div className={styles.subtitle}>
            {hasAddress && (
              <>
                <span className={grid.serverLabel}>Server</span>{" "}
                {address.domain && (
                  <span className={grid.serverDomain}>{address.domain}</span>
                )}
                {address.domain && address.ip && " "}
                {address.ip && (
                  <span className={grid.serverIp}>
                    {address.domain ? `(${address.ip})` : address.ip}
                  </span>
                )}
                {!address.domain && address.ip && (
                  <>
                    {" "}
                    <span className={grid.serverHint}>
                      (point your domain&apos;s nameservers here to activate)
                    </span>
                  </>
                )}
              </>
            )}
            {info && (
              <>
                {hasAddress && <span className={grid.serverDot}>·</span>}
                Uptime {formatUptime(info.uptime_secs)}
              </>
            )}
            {!info && <span>Agent unreachable</span>}
            {hasPermission(session, "settings") && (
              <>
                <span className={grid.serverDot}>·</span>
                <Link href="/settings?tab=live-access" style={{ color: "inherit", textDecoration: "underline" }}>
                  {liveAccess.mode === "noip"
                    ? `No-IP Live (${liveAccess.hostname || liveAccess.provider.replace(/_/g, " ")})`
                    : "IP Mode"}
                </Link>
              </>
            )}
            <span className={grid.serverDot}>·</span>
            <span>
              Signed in as <strong>{session.email}</strong> ({roleDisplayLabel(session.role)})
            </span>
          </div>
        </div>
      </div>

      <div className={grid.statRow}>
        {canApps && (
          <Stat
            label="Apps"
            value={apps ? `${runningApps}/${apps.length}` : "-"}
            sub={apps ? "running" : "unavailable"}
          />
        )}
        {canDomains && (
          <Stat
            label="Certs"
            value={certs ? String(certs.length) : "-"}
            sub={certSub}
            tone={certTone}
          />
        )}
        <Stat
          label="Load avg"
          value={info ? info.load_1.toFixed(2) : "-"}
          sub={info ? `${info.cpu_count} cpu` : ""}
        />
        <Stat
          label="Mem free"
          value={info ? `${(info.mem_available_kb / 1024 / 1024).toFixed(1)} GB` : "-"}
          sub={info ? `${(info.mem_total_kb / 1024 / 1024).toFixed(1)} GB total` : ""}
        />
        <Stat
          label="Storage"
          value={rootDisk ? `${formatBytes(rootDisk.free_bytes)} free` : "-"}
          sub={
            rootDisk
              ? `${diskUsedPct.toFixed(0)}% used of ${formatBytes(rootDisk.total_bytes)}`
              : ""
          }
          tone={diskTone}
        />
      </div>

      {hubItems.length > 0 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Control Hub</h2>
          <div className={grid.hubGrid}>
            {hubItems.map((item) => (
              <Link key={item.href} href={item.href} className={grid.hubCard}>
                <span className={grid.hubIcon}>{item.icon}</span>
                <div>
                  <div className={grid.hubTitle}>{item.label}</div>
                  <div className={grid.hubSub}>{item.sub}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className={grid.chartRow}>
        <HealthChart label="Load 1m" fetchValue={fetchLoadOne} />
        {/* Memory is a percentage: the chart's top is 100, not the highest
            sample so far, which drew a flat line along the top edge. */}
        <HealthChart
          label="Memory used"
          fetchValue={fetchMemUsedPct}
          color="var(--ok)"
          scaleMax={100}
          unit="%"
        />
      </div>

      {info && (info.disk.length > 0 || info.net.length > 0) && (
        <div className={grid.infoRow}>
          {info.disk.length > 0 && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Disks</h2>
              <Table
                layout="fixed"
                columns={[
                  { key: "mount", label: "Mount" },
                  { key: "used", label: "Used" },
                  { key: "size", label: "Size", width: "90px" },
                ]}
                rowKey={(_r, i) => info.disk[i].mount}
                rows={info.disk.map((d) => {
                  const used = d.total_bytes - d.free_bytes;
                  return {
                    mount: <span className={styles.code}>{d.mount}</span>,
                    used: renderUsageBar(used, d.total_bytes),
                    size: formatBytes(d.total_bytes),
                  };
                })}
                empty="No disks reported."
              />
            </div>
          )}

          {info.net.length > 0 && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Network</h2>
              <Table
                layout="fixed"
                columns={[
                  { key: "iface", label: "Interface", width: "110px" },
                  { key: "rx", label: "RX bytes" },
                  { key: "tx", label: "TX bytes" },
                ]}
                rows={info.net.map((n) => ({
                  iface: <span className={styles.code}>{n.iface}</span>,
                  rx: n.rx_bytes.toLocaleString(),
                  tx: n.tx_bytes.toLocaleString(),
                }))}
                empty="No network counters."
              />
            </div>
          )}
        </div>
      )}

      {info && canFolders && <FolderBreakdown />}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "ok" | "warn" | "danger";
}) {
  return (
    <div className={`${grid.stat} ${tone ? grid[`tone_${tone}`] : ""}`}>
      <div className={grid.statLabel}>{label}</div>
      <div className={grid.statValue}>{value}</div>
      {sub && <div className={grid.statSub}>{sub}</div>}
    </div>
  );
}

function formatBytes(bytes: number): string {
  const gb = bytes / 1024 / 1024 / 1024;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(0)} MB`;
}

function renderUsageBar(used: number, total: number): React.ReactNode {
  const pct =
    total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  let barColor = "var(--accent)";
  let textColor: string | undefined;
  if (pct >= 90) {
    barColor = "var(--danger)";
    textColor = "var(--danger)";
  } else if (pct >= 75) {
    barColor = "var(--warn)";
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 12, color: textColor }}>
        {formatBytes(used)}{" "}
        <span style={{ color: "var(--text-dim)" }}>({pct}%)</span>
      </span>
      <div
        style={{
          width: "100%",
          height: 6,
          background: "var(--bg-elev-2)",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: barColor,
            transition: "width 0.2s",
          }}
        />
      </div>
    </div>
  );
}

function formatUptime(secs: number): string {
  const days = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (days > 0) return `${days}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
