"use client";

import { useEffect, useMemo, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import BoltMark from "@/components/BoltMark/BoltMark";
import NavIcon, { type NavIconName } from "./NavIcon";
import { Globe, Package, Server } from "lucide-react";
import {
  hasPermission,
  isAdminRole,
  isSuperAdmin,
  type PermissionKey,
  type UserPermissions,
  type UserRole,
} from "@/lib/permissions";
import styles from "./Sidebar.module.css";

type NavItem = {
  href: string;
  label: string;
  icon: NavIconName;
  lucide?: "package" | "vps" | "hosting";
  /** Required module permission. If omitted, checked via `adminOnly` / `superAdminOnly` / `roles`. */
  perm?: PermissionKey;
  /** Strictly requires admin or super_admin role. */
  adminOnly?: boolean;
  /** Strictly requires super_admin role. */
  superAdminOnly?: boolean;
  /** Restrict visibility to specific roles. */
  roles?: UserRole[];
  /** Dynamic label override per role. */
  labelForRole?: Partial<Record<UserRole, string>>;
};

const SECTIONS: { group: string; items: NavItem[] }[] = [
  {
    group: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: "dashboard" }],
  },
  {
    group: "Provisioning",
    items: [
      {
        href: "/packages",
        label: "Packages",
        icon: "scale",
        lucide: "package",
        superAdminOnly: true,
      },
      {
        href: "/vps",
        label: "VPS Servers",
        icon: "services",
        lucide: "vps",
        roles: ["super_admin", "vps_admin"],
        labelForRole: { vps_admin: "My VPS & Panel", super_admin: "VPS Provisioning" },
      },
      {
        href: "/hosting",
        label: "Web Hosting",
        icon: "domains",
        lucide: "hosting",
        roles: ["super_admin", "hosting_admin"],
        labelForRole: { hosting_admin: "My Hosting", super_admin: "Hosting Accounts" },
      },
    ],
  },
  {
    group: "Workloads",
    items: [
      { href: "/apps", label: "Apps", icon: "apps", perm: "apps" },
      { href: "/scale", label: "Scale & Addons", icon: "scale", perm: "services" },
      { href: "/cron", label: "Cron jobs", icon: "cron", perm: "cron" },
      { href: "/services", label: "System services", icon: "services", perm: "services" },
    ],
  },
  {
    group: "Storage",
    items: [
      { href: "/files/drive", label: "Drive", icon: "drive", perm: "files" },
      { href: "/files", label: "Files", icon: "files", perm: "files" },
    ],
  },
  {
    group: "Networking",
    items: [
      { href: "/domains", label: "Domains", icon: "domains", perm: "domains" },
      { href: "/redirects", label: "Redirects", icon: "redirects", perm: "domains" },
      { href: "/networks", label: "My Networks", icon: "networks", perm: "services" },
    ],
  },
  {
    group: "Mail & data",
    items: [
      { href: "/mailboxes", label: "Mailboxes", icon: "mailboxes", perm: "mail" },
      { href: "/mailboxes/webmail", label: "Webmail", icon: "webmail", perm: "mail" },
      { href: "/databases", label: "Databases", icon: "databases", perm: "databases" },
      { href: "/backups", label: "Backups", icon: "backups", perm: "backups" },
    ],
  },
  {
    group: "Operations",
    items: [
      { href: "/terminal", label: "Terminal", icon: "terminal", perm: "terminal" },
      { href: "/logs", label: "Logs", icon: "logs", perm: "logs" },
      { href: "/tasks", label: "Tasks", icon: "tasks", perm: "logs" },
      { href: "/audit", label: "Audit log", icon: "audit", perm: "logs" },
      { href: "/firewall", label: "Firewall & bans", icon: "firewall", perm: "security" },
      { href: "/security", label: "Security & SSH", icon: "security", perm: "security" },
    ],
  },
  {
    group: "Account",
    items: [
      { href: "/users", label: "Users", icon: "users", adminOnly: true },
      { href: "/ssh-keys", label: "SSH keys", icon: "sshKeys", perm: "security" },
      { href: "/notifications", label: "Notifications", icon: "notifications", perm: "services" },
      { href: "/settings", label: "Settings", icon: "settings" },
      { href: "/ai-agent", label: "MCP", icon: "mcp", adminOnly: true },
    ],
  },
];

export const SIDEBAR_TOGGLE_EVENT = "vps-panel:toggle-sidebar";

type Props = {
  role: UserRole;
  permissions: UserPermissions;
};

export default function Sidebar({ role, permissions }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const visibleSections = useMemo(() => {
    const view = { role, permissions };
    return SECTIONS.map((section) => ({
      group: section.group,
      items: section.items
        .filter((item) => {
          if (item.superAdminOnly) return isSuperAdmin(role);
          if (item.roles) return item.roles.includes(role);
          if (item.adminOnly) return isAdminRole(role);
          if (item.perm) return hasPermission(view, item.perm);
          return true;
        })
        .map((item) => ({
          ...item,
          label: item.labelForRole?.[role] ?? item.label,
        })),
    })).filter((s) => s.items.length > 0);
  }, [role, permissions]);

  // Longest match wins.
  const activeHref = useMemo(() => {
    let best = "";
    for (const section of visibleSections) {
      for (const item of section.items) {
        const matches = pathname === item.href || pathname.startsWith(item.href + "/");
        if (matches && item.href.length > best.length) best = item.href;
      }
    }
    return best;
  }, [pathname, visibleSections]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener(SIDEBAR_TOGGLE_EVENT, onToggle);
    return () => window.removeEventListener(SIDEBAR_TOGGLE_EVENT, onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.toggle(styles.bodyLock, open);
    return () => document.body.classList.remove(styles.bodyLock);
  }, [open]);

  return (
    <>
      <div
        className={[styles.backdrop, open ? styles.backdropOpen : ""].join(" ").trim()}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <nav className={[styles.nav, open ? styles.navOpen : ""].join(" ").trim()}>
        <div className={styles.brand}>
          <BoltMark size={24} />
          <div className={styles.brandText}>Paix Panel</div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {visibleSections.map((section) => (
          <div key={section.group} className={styles.group}>
            <div className={styles.groupTitle}>{section.group}</div>
            <ul className={styles.list}>
              {section.items.map((item) => {
                const active = item.href === activeHref;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={[styles.link, active ? styles.active : ""].join(" ").trim()}
                      onClick={() => setOpen(false)}
                    >
                      <SidebarLinkLabel icon={item.icon} lucide={item.lucide} label={item.label} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        <footer className={styles.footer}>
          <div>© 2026 Amani Sinkala</div>
          <div>Created 2026</div>
        </footer>
      </nav>
    </>
  );
}

function SidebarLinkLabel({
  icon,
  lucide,
  label,
}: {
  icon: NavIconName;
  lucide?: "package" | "vps" | "hosting";
  label: string;
}) {
  const { pending } = useLinkStatus();
  return (
    <span className={styles.linkRow}>
      {lucide === "package" ? (
        <Package size={16} className={styles.linkIcon} aria-hidden="true" />
      ) : lucide === "vps" ? (
        <Server size={16} className={styles.linkIcon} aria-hidden="true" />
      ) : lucide === "hosting" ? (
        <Globe size={16} className={styles.linkIcon} aria-hidden="true" />
      ) : (
        <NavIcon name={icon} className={styles.linkIcon} />
      )}
      <span className={styles.linkText}>{label}</span>
      {pending && <span className={styles.linkSpinner} aria-hidden="true" />}
    </span>
  );
}
