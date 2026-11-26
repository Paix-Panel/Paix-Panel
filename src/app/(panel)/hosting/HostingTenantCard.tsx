import Link from "next/link";
import {
  Boxes,
  Clock,
  Database,
  FolderOpen,
  Globe,
  HardDrive,
  KeyRound,
  Mail,
  ScrollText,
  Send,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import type { HostingAccountView } from "@/lib/provisioning";
import StatusBadge from "@/components/StatusBadge/StatusBadge";
import pageStyles from "@/components/page.module.css";
import styles from "./hosting.module.css";

function fmtLimit(val: number, unit = ""): string {
  if (val <= 0) return "Unlimited";
  return unit ? `${val} ${unit}` : String(val);
}

export default function HostingTenantCard({
  account,
  serverIp,
  nameservers,
}: {
  account: HostingAccountView;
  serverIp: string;
  nameservers: string;
}) {
  const essentials = [
    {
      href: "/domains",
      label: "Domains & Auto-SSL",
      sub: "DNS records, HTTPS & subdomains",
      icon: <Globe size={16} />,
    },
    {
      href: "/files",
      label: "File Manager",
      sub: "Upload folders, ZIPs & edit site files",
      icon: <FolderOpen size={16} />,
    },
    {
      href: "/databases",
      label: "Databases",
      sub: "MariaDB, PostgreSQL & SQL imports",
      icon: <Database size={16} />,
    },
    {
      href: "/mailboxes",
      label: "Email Accounts",
      sub: `Up to ${fmtLimit(account.max_mailboxes)} mailboxes`,
      icon: <Mail size={16} />,
    },
    {
      href: "/mailboxes/webmail",
      label: "Webmail Client",
      sub: "Read & send domain emails",
      icon: <Send size={16} />,
    },
    {
      href: "/apps",
      label: "Web Apps",
      sub: "PHP, Node.js, Python & static apps",
      icon: <Boxes size={16} />,
    },
    {
      href: "/backups",
      label: "Backups",
      sub: `${account.backup_slots} snapshot slot(s)`,
      icon: <HardDrive size={16} />,
    },
    {
      href: "/cron",
      label: "Cron Jobs",
      sub: "Automated scheduled tasks",
      icon: <Clock size={16} />,
    },
    {
      href: "/logs",
      label: "Access & Error Logs",
      sub: "Live service & request logs",
      icon: <ScrollText size={16} />,
    },
    ...(account.ssh_access
      ? [
          {
            href: "/terminal",
            label: "Web Terminal",
            sub: "SSH shell access included",
            icon: <Terminal size={16} />,
          },
          {
            href: "/ssh-keys",
            label: "SSH Keys",
            sub: "Manage authorized SSH keys",
            icon: <KeyRound size={16} />,
          },
        ]
      : []),
  ];

  return (
    <div className={pageStyles.section}>
      <div className={styles.rowBetween} style={{ marginBottom: 14 }}>
        <div>
          <h2 className={pageStyles.sectionTitle} style={{ margin: 0 }}>
            {account.domain}{" "}
            <span className={pageStyles.muted} style={{ fontWeight: 400 }}>
              ({account.label})
            </span>
          </h2>
          <div className={pageStyles.muted} style={{ fontSize: 12, marginTop: 2 }}>
            Package: <strong>{account.package_name}</strong> ({account.package_price}) · Owner:{" "}
            <span className={styles.mono}>{account.owner_email}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <StatusBadge
            text={account.ssl_included ? "Auto-SSL Included" : "Standard HTTP"}
            tone={account.ssl_included ? "info" : "muted"}
          />
          <StatusBadge
            text={account.status}
            tone={
              account.status === "active"
                ? "ok"
                : account.status === "suspended"
                  ? "warn"
                  : "danger"
            }
          />
        </div>
      </div>

      {/* DNS, Root Path, SFTP Info */}
      <div className={styles.infoBar}>
        <div>
          <div className={pageStyles.muted}>Primary IP / A Record</div>
          <div className={styles.mono} style={{ fontWeight: 600, marginTop: 2 }}>
            {serverIp}
          </div>
        </div>
        <div>
          <div className={pageStyles.muted}>Nameservers</div>
          <div className={styles.mono} style={{ fontWeight: 600, marginTop: 2 }}>
            {nameservers}
          </div>
        </div>
        <div>
          <div className={pageStyles.muted}>Document Root</div>
          <div className={styles.mono} style={{ fontWeight: 600, marginTop: 2 }}>
            {account.root_dir}
          </div>
        </div>
        <div>
          <div className={pageStyles.muted}>System / SFTP User</div>
          <div className={styles.mono} style={{ fontWeight: 600, marginTop: 2 }}>
            {account.linux_user || "panel-managed"} ·{" "}
            {account.ssh_access ? "SSH Enabled" : "Web Panel Only"}
          </div>
        </div>
      </div>

      {/* Hosting Package Quota Limits */}
      <div className={styles.quotaGrid}>
        <div className={styles.quotaBox}>
          <div className={styles.quotaLabel}>Disk Space</div>
          <div className={styles.quotaVal}>{account.storage_gb} GB</div>
          <div className={styles.quotaSub}>Dedicated NVMe quota</div>
        </div>
        <div className={styles.quotaBox}>
          <div className={styles.quotaLabel}>Bandwidth</div>
          <div className={styles.quotaVal}>{fmtLimit(account.bandwidth_gb, "GB")}</div>
          <div className={styles.quotaSub}>Monthly transfer limit</div>
        </div>
        <div className={styles.quotaBox}>
          <div className={styles.quotaLabel}>Domains &amp; Subdomains</div>
          <div className={styles.quotaVal}>
            {fmtLimit(account.max_domains)} / {fmtLimit(account.max_subdomains)}
          </div>
          <div className={styles.quotaSub}>Addon domains &amp; subs</div>
        </div>
        <div className={styles.quotaBox}>
          <div className={styles.quotaLabel}>Databases</div>
          <div className={styles.quotaVal}>{fmtLimit(account.max_databases)}</div>
          <div className={styles.quotaSub}>MariaDB &amp; PostgreSQL</div>
        </div>
        <div className={styles.quotaBox}>
          <div className={styles.quotaLabel}>Mailboxes</div>
          <div className={styles.quotaVal}>{fmtLimit(account.max_mailboxes)}</div>
          <div className={styles.quotaSub}>{account.mailbox_quota_mb} MB per mailbox</div>
        </div>
        <div className={styles.quotaBox}>
          <div className={styles.quotaLabel}>Apps &amp; FTP</div>
          <div className={styles.quotaVal}>
            {fmtLimit(account.max_apps)} apps · {fmtLimit(account.max_ftp_accounts)} FTP
          </div>
          <div className={styles.quotaSub}>{account.backup_slots} backup slot(s)</div>
        </div>
      </div>

      {/* Hosting Admin Essentials Grid */}
      <div className={styles.rowBetween} style={{ marginBottom: 10 }}>
        <h3 className={pageStyles.sectionTitle} style={{ margin: 0 }}>
          Hosting Control Center (Full Hosting Admin Roles Active)
        </h3>
        <span className={pageStyles.muted} style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}>
          <ShieldCheck size={14} aria-hidden="true" /> Scoped to {account.domain}
        </span>
      </div>

      <div className={styles.toolsGrid}>
        {essentials.map((tool) => (
          <Link key={tool.href} href={tool.href} className={styles.toolCard}>
            <span className={styles.toolIcon}>{tool.icon}</span>
            <div>
              <div className={styles.toolTitle}>{tool.label}</div>
              <div className={styles.toolSub}>{tool.sub}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
