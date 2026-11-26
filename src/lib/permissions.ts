export const USER_ROLES = [
  "super_admin",
  "admin",
  "vps_admin",
  "hosting_admin",
  "user",
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PERMISSION_KEYS = [
  "apps",
  "domains",
  "databases",
  "mail",
  "files",
  "backups",
  "cron",
  "logs",
  "terminal",
  "security",
  "services",
  "settings",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export type UserScopes = {
  /** Allowed app names under /apps (empty/omitted = all apps when `apps` perm granted). */
  apps?: string[];
  /** Allowed domain/zone names under /domains & /redirects & /mailboxes. */
  domains?: string[];
  /** Allowed database names under /databases. */
  databases?: string[];
};

export type UserPermissions = {
  modules: PermissionKey[];
  scopes?: UserScopes;
};

export type PermissionDefinition = {
  key: PermissionKey;
  label: string;
  description: string;
  category: "Workloads" | "Web & Data" | "Operations & System";
};

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  {
    key: "apps",
    label: "Apps & Deployments",
    description: "Deploy Node/Python/PHP/Go/Docker apps, view & restart assigned apps",
    category: "Workloads",
  },
  {
    key: "domains",
    label: "Domains, DNS & SSL",
    description: "Manage domains, HTTP routing, SSL certs, DNS zones & redirects",
    category: "Web & Data",
  },
  {
    key: "databases",
    label: "Databases (MariaDB / PostgreSQL)",
    description: "Manage databases, DB users, SQL imports & pgvector",
    category: "Web & Data",
  },
  {
    key: "mail",
    label: "Mailboxes & Webmail",
    description: "Manage email accounts, DKIM/DMARC & Roundcube webmail",
    category: "Web & Data",
  },
  {
    key: "files",
    label: "Files & Drive",
    description: "Browse, upload, download & edit server and app files",
    category: "Web & Data",
  },
  {
    key: "backups",
    label: "Backups",
    description: "View, trigger and restore server backup snapshots",
    category: "Workloads",
  },
  {
    key: "cron",
    label: "Cron Jobs",
    description: "Create and manage scheduled cron tasks",
    category: "Workloads",
  },
  {
    key: "logs",
    label: "Logs & Tasks",
    description: "View live service logs, build tasks & audit trail",
    category: "Operations & System",
  },
  {
    key: "terminal",
    label: "Web Terminal",
    description: "Execute shell commands via the browser terminal",
    category: "Operations & System",
  },
  {
    key: "services",
    label: "Services, Scale & Networks",
    description: "Control systemd services, scale/addons, mesh networks & notifications",
    category: "Operations & System",
  },
  {
    key: "security",
    label: "Firewall, SSH Keys & Security",
    description: "Manage UFW rules, fail2ban bans, SSH daemon & SSH keys",
    category: "Operations & System",
  },
  {
    key: "settings",
    label: "Panel & Server Settings",
    description: "Edit panel theme, hostname, timezone, SSL email & SSO settings",
    category: "Operations & System",
  },
];

export const ROLE_TEMPLATES: {
  id: string;
  label: string;
  description: string;
  modules: PermissionKey[];
}[] = [
  {
    id: "app_developer",
    label: "App Developer",
    description: "Deploy apps, manage domains/DBs, browse files and inspect logs",
    modules: ["apps", "domains", "databases", "files", "logs"],
  },
  {
    id: "web_domain_ops",
    label: "Web & Domain Manager",
    description: "Domains, SSL, redirects, mailboxes and files",
    modules: ["domains", "mail", "files", "backups"],
  },
  {
    id: "db_operator",
    label: "Database & Backup Operator",
    description: "Manage MariaDB/PostgreSQL databases and backups",
    modules: ["databases", "backups", "logs"],
  },
  {
    id: "readonly_viewer",
    label: "Logs & Monitoring Viewer",
    description: "Read-only access to logs and task progress",
    modules: ["logs"],
  },
];

/** Quick-install runtime slug -> /apps/new?runtime= value */
export const RUNTIME_DEPLOY_MAP: Record<string, string> = {
  nodejs: "node",
  python: "python",
  php: "php",
  golang: "go",
  java: "java",
  ruby: "ruby",
  rust: "rust",
  bun: "bun",
  deno: "deno",
  dotnet: "dotnet",
};

export const DEFAULT_VPS_ADMIN_MODULES: PermissionKey[] = [
  "apps",
  "domains",
  "databases",
  "mail",
  "files",
  "backups",
  "cron",
  "logs",
  "terminal",
  "security",
  "services",
];

export function defaultHostingAdminModules(sshAccess: boolean): PermissionKey[] {
  return [
    "apps",
    "domains",
    "databases",
    "mail",
    "files",
    "backups",
    "cron",
    "logs",
    ...(sshAccess ? (["terminal", "security"] as PermissionKey[]) : []),
  ];
}

export function normalizeRole(role: string | null | undefined): UserRole {
  if (role === "super_admin") return "super_admin";
  if (role === "admin") return "admin";
  if (role === "vps_admin") return "vps_admin";
  if (role === "hosting_admin") return "hosting_admin";
  return "user";
}

export function isSuperAdmin(role: string | null | undefined): boolean {
  return role === "super_admin";
}

export function isAdminRole(role: string | null | undefined): boolean {
  return role === "super_admin" || role === "admin";
}

export function isVpsAdmin(role: string | null | undefined): boolean {
  return role === "vps_admin";
}

export function isHostingAdmin(role: string | null | undefined): boolean {
  return role === "hosting_admin";
}

export function isTenantRole(role: string | null | undefined): boolean {
  return role === "vps_admin" || role === "hosting_admin";
}

export function roleDisplayLabel(role: string | null | undefined): string {
  if (role === "super_admin") return "Super Admin";
  if (role === "admin") return "Admin";
  if (role === "vps_admin") return "VPS Admin";
  if (role === "hosting_admin") return "Hosting Admin";
  return "User";
}

export function emptyPermissions(): UserPermissions {
  return { modules: [], scopes: {} };
}

export function parsePermissions(raw: string | null | undefined): UserPermissions {
  if (!raw) return emptyPermissions();
  try {
    const parsed = JSON.parse(raw) as Partial<UserPermissions>;
    const validKeySet = new Set<string>(PERMISSION_KEYS);
    const modules = Array.isArray(parsed.modules)
      ? Array.from(
          new Set(
            parsed.modules.filter(
              (m): m is PermissionKey => typeof m === "string" && validKeySet.has(m),
            ),
          ),
        )
      : [];
    const cleanScopeList = (val: unknown): string[] | undefined => {
      if (!Array.isArray(val)) return undefined;
      const items = Array.from(
        new Set(
          val
            .map((v) => (typeof v === "string" ? v.trim().toLowerCase() : ""))
            .filter(Boolean),
        ),
      );
      return items.length > 0 ? items : undefined;
    };
    const scopes: UserScopes = {};
    if (parsed.scopes && typeof parsed.scopes === "object") {
      const apps = cleanScopeList(parsed.scopes.apps);
      const domains = cleanScopeList(parsed.scopes.domains);
      const databases = cleanScopeList(parsed.scopes.databases);
      if (apps) scopes.apps = apps;
      if (domains) scopes.domains = domains;
      if (databases) scopes.databases = databases;
    }
    return { modules, scopes };
  } catch {
    return emptyPermissions();
  }
}

export function serializePermissions(perms: UserPermissions): string {
  const normalized = parsePermissions(JSON.stringify(perms));
  return JSON.stringify(normalized);
}

export type SessionPermissionView = {
  role: string;
  permissions?: UserPermissions;
};

export function hasPermission(
  session: SessionPermissionView | null | undefined,
  perm: PermissionKey,
): boolean {
  if (!session) return false;
  if (isAdminRole(session.role)) return true;
  return session.permissions?.modules.includes(perm) ?? false;
}

export function hasAnyPermission(
  session: SessionPermissionView | null | undefined,
  perms: PermissionKey[],
): boolean {
  return perms.some((p) => hasPermission(session, p));
}

export function isAppAllowed(
  session: SessionPermissionView | null | undefined,
  appName: string,
): boolean {
  if (!session) return false;
  if (isAdminRole(session.role)) return true;
  if (!hasPermission(session, "apps")) return false;
  const scoped = session.permissions?.scopes?.apps;
  if (!scoped || scoped.length === 0) return true;
  return scoped.includes(appName.trim().toLowerCase());
}

export function isDomainAllowed(
  session: SessionPermissionView | null | undefined,
  domain: string,
): boolean {
  if (!session) return false;
  if (isAdminRole(session.role)) return true;
  if (!hasAnyPermission(session, ["domains", "mail"])) return false;
  const scoped = session.permissions?.scopes?.domains;
  if (!scoped || scoped.length === 0) return true;
  const target = domain.trim().toLowerCase().replace(/\.$/, "");
  return scoped.some(
    (allowed) => target === allowed || target.endsWith(`.${allowed}`),
  );
}

export function isDatabaseAllowed(
  session: SessionPermissionView | null | undefined,
  dbName: string,
): boolean {
  if (!session) return false;
  if (isAdminRole(session.role)) return true;
  if (!hasPermission(session, "databases")) return false;
  const scoped = session.permissions?.scopes?.databases;
  if (!scoped || scoped.length === 0) return true;
  return scoped.includes(dbName.trim().toLowerCase());
}
