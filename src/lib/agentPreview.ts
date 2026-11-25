import "server-only";
import os from "node:os";
import fs from "node:fs";
import type {
  AppRow,
  CertRow,
  CoreServiceState,
  CronJobRow,
  DbDatabase,
  DbUser,
  FileEntry,
  FileRoot,
  FirewallStatus,
  FolderSizes,
  JailRow,
  KeyRow,
  MailAliasRow,
  MailDomainRow,
  MailboxRow,
  PgDatabase,
  PgRole,
  QuickInstallRecipe,
  RecordRow,
  SecurityOverview,
  ServiceRow,
  SiteListEntry,
  Snapshot,
  SshActiveSession,
  SshLogEvent,
  SshServerConfig,
  SysInfo,
  SystemUserRow,
  TaskState,
  TrashRow,
  WebmailMessageDetail,
  ZoneRow,
} from "./agent";

type PreviewState = {
  apps: (AppRow & {
    env: { key: string; value: string }[];
    execStart: string;
  })[];
  sites: SiteListEntry[];
  certs: CertRow[];
  zones: ZoneRow[];
  recordsByZone: Record<string, RecordRow[]>;
  nextRecordId: number;
  mailDomains: MailDomainRow[];
  mailboxes: MailboxRow[];
  nextMailboxId: number;
  aliases: MailAliasRow[];
  nextAliasId: number;
  mailIpDefault: "ipv4" | "ipv6";
  dbUsers: DbUser[];
  dbDatabases: DbDatabase[];
  pgRoles: PgRole[];
  pgDatabases: PgDatabase[];
  pgvectorEnabled: string[];
  firewall: FirewallStatus;
  jails: JailRow[];
  sshKeys: KeyRow[];
  sshConfig: SshServerConfig;
  cronJobs: CronJobRow[];
  services: ServiceRow[];
  coreServices: CoreServiceState[];
  systemUsers: SystemUserRow[];
  backups: Snapshot[];
  tasks: TaskState[];
  quickInstall: QuickInstallRecipe[];
  hostname: string;
  swapMb: number;
  swappiness: number;
  trash: TrashRow[];
  filesByRoot: Record<string, Record<string, FileEntry[]>>;
  webmailMessages: Record<string, WebmailMessageDetail[]>;
  sshLogs: SshLogEvent[];
  sshSessions: SshActiveSession[];
  manualBannedIps: string[];
};

const g = globalThis as unknown as { __boltPreviewState?: PreviewState };

function getState(): PreviewState {
  if (g.__boltPreviewState) return g.__boltPreviewState;

  const futureDate = (days: number) =>
    new Date(Date.now() + days * 86400 * 1000).toISOString();

  g.__boltPreviewState = {
    apps: [
      {
        name: "core-api",
        subdomain: "api.paixpanel.local",
        port: 4001,
        source_dir: "/srv/apps/core-api",
        active: "active",
        sub: "running",
        kind: "panel",
        source_dir_state: "populated",
        runtime: "node",
        image: null,
        docker_build: false,
        execStart: "/usr/bin/npm start",
        env: [
          { key: "NODE_ENV", value: "production" },
          { key: "PORT", value: "4001" },
          { key: "LOG_LEVEL", value: "info" },
        ],
      },
      {
        name: "web-storefront",
        subdomain: "app.paixpanel.local",
        port: 4002,
        source_dir: "/srv/apps/web-storefront",
        active: "active",
        sub: "running",
        kind: "panel",
        source_dir_state: "populated",
        runtime: "node",
        image: null,
        docker_build: false,
        execStart: "/usr/bin/npm start",
        env: [
          { key: "NODE_ENV", value: "production" },
          { key: "PORT", value: "4002" },
          { key: "NEXT_PUBLIC_API_URL", value: "https://api.paixpanel.local" },
        ],
      },
      {
        name: "analytics-ui",
        subdomain: "shopdemo.co.tz",
        port: 4003,
        source_dir: "",
        active: "active",
        sub: "running",
        kind: "panel",
        source_dir_state: "none",
        runtime: "docker",
        image: "metabase/metabase:latest",
        docker_build: false,
        execStart: "docker run metabase/metabase:latest",
        env: [{ key: "MB_JETTY_PORT", value: "4003" }],
      },
    ],
    sites: [
      { domain: "vps.paixpanel.local", kind: "panel-host" },
      { domain: "api.paixpanel.local", kind: "app" },
      { domain: "app.paixpanel.local", kind: "app" },
      { domain: "shopdemo.co.tz", kind: "app" },
      { domain: "docs.paixpanel.local", kind: "site" },
    ],
    certs: [
      { domain: "vps.paixpanel.local", not_after: futureDate(74), days_remaining: 74, serving: true },
      { domain: "api.paixpanel.local", not_after: futureDate(78), days_remaining: 78, serving: true },
      { domain: "app.paixpanel.local", not_after: futureDate(65), days_remaining: 65, serving: true },
      { domain: "shopdemo.co.tz", not_after: futureDate(85), days_remaining: 85, serving: true },
      { domain: "docs.paixpanel.local", not_after: futureDate(19), days_remaining: 19, serving: true },
    ],
    zones: [
      { id: 1, name: "paixpanel.local", type: "Native", records: 5 },
      { id: 2, name: "shopdemo.co.tz", type: "Native", records: 4 },
    ],
    recordsByZone: {
      "paixpanel.local": [
        { id: 1, name: "paixpanel.local", type: "A", content: "203.0.113.42", ttl: 300, prio: 0, disabled: false },
        { id: 2, name: "api.paixpanel.local", type: "A", content: "203.0.113.42", ttl: 300, prio: 0, disabled: false },
        { id: 3, name: "app.paixpanel.local", type: "A", content: "203.0.113.42", ttl: 300, prio: 0, disabled: false },
        { id: 4, name: "paixpanel.local", type: "MX", content: "mail.paixpanel.local", ttl: 300, prio: 10, disabled: false },
        { id: 5, name: "paixpanel.local", type: "TXT", content: "v=spf1 mx a ~all", ttl: 300, prio: 0, disabled: false },
      ],
      "shopdemo.co.tz": [
        { id: 6, name: "shopdemo.co.tz", type: "A", content: "203.0.113.42", ttl: 300, prio: 0, disabled: false },
        { id: 7, name: "www.shopdemo.co.tz", type: "CNAME", content: "shopdemo.co.tz", ttl: 300, prio: 0, disabled: false },
        { id: 8, name: "shopdemo.co.tz", type: "MX", content: "mail.shopdemo.co.tz", ttl: 300, prio: 10, disabled: false },
        { id: 9, name: "shopdemo.co.tz", type: "TXT", content: "v=spf1 mx a ~all", ttl: 300, prio: 0, disabled: false },
      ],
    },
    nextRecordId: 10,
    mailDomains: [
      { id: 1, name: "paixpanel.local", mailboxes: 2, ip_preference: "default" },
      { id: 2, name: "shopdemo.co.tz", mailboxes: 1, ip_preference: "ipv4" },
    ],
    mailboxes: [
      { id: 1, email: "admin@paixpanel.local", quota_mb: 2048 },
      { id: 2, email: "ops@paixpanel.local", quota_mb: 1024 },
      { id: 3, email: "orders@shopdemo.co.tz", quota_mb: 5120 },
    ],
    nextMailboxId: 4,
    aliases: [
      { id: 1, source: "support@shopdemo.co.tz", destination: "orders@shopdemo.co.tz" },
      { id: 2, source: "@paixpanel.local", destination: "admin@paixpanel.local" },
    ],
    nextAliasId: 3,
    mailIpDefault: "ipv4",
    dbUsers: [
      { user: "shop_app", host: "localhost" },
      { user: "reporting", host: "127.0.0.1" },
    ],
    dbDatabases: [
      { name: "shopdemo_prod", users: [{ user: "shop_app", host: "localhost" }] },
      { name: "analytics_warehouse", users: [{ user: "reporting", host: "127.0.0.1" }] },
    ],
    pgRoles: [
      { user: "core_api", superuser: false },
      { user: "postgres_admin", superuser: true },
    ],
    pgDatabases: [
      { name: "core_api_db", owner: "core_api" },
      { name: "embeddings_db", owner: "core_api" },
    ],
    pgvectorEnabled: ["embeddings_db"],
    firewall: {
      ufw_enabled: true,
      rules: [
        "22/tcp ALLOW IN Anywhere",
        "80/tcp ALLOW IN Anywhere",
        "443/tcp ALLOW IN Anywhere",
        "53/udp ALLOW IN Anywhere",
      ],
      listening_ports: [
        { proto: "tcp", address: "0.0.0.0", port: 22, process: "sshd" },
        { proto: "tcp", address: "0.0.0.0", port: 80, process: "nginx" },
        { proto: "tcp", address: "0.0.0.0", port: 443, process: "nginx" },
        { proto: "tcp", address: "127.0.0.1", port: 4001, process: "node" },
        { proto: "tcp", address: "127.0.0.1", port: 4002, process: "node" },
        { proto: "tcp", address: "127.0.0.1", port: 4003, process: "docker-proxy" },
      ],
      fail2ban_active: true,
    },
    jails: [
      { name: "sshd", banned: ["198.51.100.77"], total_failed: 42 },
      { name: "nginx-http-auth", banned: [], total_failed: 3 },
      { name: "dovecot", banned: [], total_failed: 7 },
    ],
    sshKeys: [
      {
        fingerprint: "SHA256:9xK2mLpQr8vT4nW7zB1cD6fH3jM5pS0yA2eG8uV",
        key_type: "ssh-ed25519",
        comment: "operator@workstation",
        keypair_name: null,
        authorized: true,
      },
      {
        fingerprint: "SHA256:3dF7gH1jK5lM9nP2qR6sT0vW4xY8zA1bC3eG5iK",
        key_type: "ssh-ed25519",
        comment: "deploy-core-api",
        keypair_name: "deploy_core_api",
        authorized: false,
      },
    ],
    sshConfig: {
      port: 22,
      idle_timeout_minutes: 15,
      password_auth: false,
      permit_root_login: "prohibit-password",
    },
    cronJobs: [
      {
        id: "cron-1",
        schedule: "0 3 * * *",
        user: "root",
        command: "/usr/local/bin/restic-backup.sh",
        label: "Nightly encrypted backup",
      },
      {
        id: "cron-2",
        schedule: "*/15 * * * *",
        user: "www-data",
        command: "curl -fsS http://127.0.0.1:4001/internal/health >/dev/null",
        label: "API health ping",
      },
    ],
    services: [
      { unit: "nginx.service", load: "loaded", active: "active", sub: "running", description: "A high performance web server and reverse proxy" },
      { unit: "vps-panel.service", load: "loaded", active: "active", sub: "running", description: "Paix Panel Web UI" },
      { unit: "vps-panel-agent.service", load: "loaded", active: "active", sub: "running", description: "Paix Panel Privileged Agent" },
      { unit: "mariadb.service", load: "loaded", active: "active", sub: "running", description: "MariaDB database server" },
      { unit: "postgresql.service", load: "loaded", active: "active", sub: "running", description: "PostgreSQL RDBMS" },
      { unit: "postfix.service", load: "loaded", active: "active", sub: "running", description: "Postfix Mail Transport Agent" },
      { unit: "dovecot.service", load: "loaded", active: "active", sub: "running", description: "Dovecot IMAP/POP3 server" },
      { unit: "pdns.service", load: "loaded", active: "active", sub: "running", description: "PowerDNS Authoritative Server" },
      { unit: "docker.service", load: "loaded", active: "active", sub: "running", description: "Docker Application Container Engine" },
      { unit: "fail2ban.service", load: "loaded", active: "active", sub: "running", description: "Fail2Ban Service" },
    ],
    coreServices: [
      { name: "nginx", package: "nginx", unit: "nginx.service", installed: true, active: true, enabled: true, quick_install_slug: null },
      { name: "Docker", package: "docker.io", unit: "docker.service", installed: true, active: true, enabled: true, quick_install_slug: "docker" },
      { name: "PostgreSQL", package: "postgresql", unit: "postgresql.service", installed: true, active: true, enabled: true, quick_install_slug: null },
      { name: "MariaDB", package: "mariadb-server", unit: "mariadb.service", installed: true, active: true, enabled: true, quick_install_slug: null },
      { name: "Redis", package: "redis-server", unit: "redis-server.service", installed: true, active: true, enabled: true, quick_install_slug: "redis" },
    ],
    systemUsers: [
      { name: "root", uid: 0, home: "/root", shell: "/bin/bash", is_human: true, sudo: true, reserved: true },
      { name: "deploy", uid: 1000, home: "/home/deploy", shell: "/bin/bash", is_human: true, sudo: true, reserved: false },
      { name: "www-data", uid: 33, home: "/var/www", shell: "/usr/sbin/nologin", is_human: false, sudo: false, reserved: true },
      { name: "postgres", uid: 112, home: "/var/lib/postgresql", shell: "/bin/bash", is_human: false, sudo: false, reserved: true },
    ],
    backups: [
      { id: "snap-a94f21c8", time: new Date(Date.now() - 6 * 3600 * 1000).toISOString(), paths: ["/srv/apps", "/etc/vps-panel", "/var/lib/vps-panel"], hostname: os.hostname() },
      { id: "snap-72b19e04", time: new Date(Date.now() - 30 * 3600 * 1000).toISOString(), paths: ["/srv/apps", "/etc/vps-panel", "/var/lib/vps-panel"], hostname: os.hostname() },
    ],
    tasks: [
      {
        id: "task-deploy-core-api",
        kind: "app:deploy",
        status: "succeeded",
        started_at: new Date(Date.now() - 3600 * 1000).toISOString(),
        finished_at: new Date(Date.now() - 3560 * 1000).toISOString(),
        log: [
          "Cloning https://github.com/acme/core-api.git into /srv/apps/core-api...",
          "Running npm ci --omit=dev...",
          "Running npm run build...",
          "Writing systemd unit vps-app-core-api.service",
          "Issuing TLS certificate for api.paixpanel.local",
          "Done: core-api listening on 127.0.0.1:4001",
        ],
      },
    ],
    quickInstall: [
      { slug: "docker", name: "Docker", description: "Container runtime for Docker apps and one-click tools.", default_port: 2375, installed: true, web_ui: false, bind: null, update_available: null },
      { slug: "redis", name: "Redis", description: "In-memory cache and queue store on 127.0.0.1:6379.", default_port: 6379, installed: true, web_ui: false, bind: "127.0.0.1", update_available: null },
      { slug: "roundcube", name: "Roundcube Webmail", description: "Browser webmail client wired to Postfix and Dovecot.", default_port: 8085, installed: true, web_ui: true, bind: "127.0.0.1", update_available: null },
      { slug: "phpmyadmin", name: "phpMyAdmin", description: "Web UI for MariaDB databases and users.", default_port: 8081, installed: false, web_ui: true, bind: null, update_available: null },
      { slug: "pgadmin", name: "pgAdmin 4", description: "Web UI for PostgreSQL databases and roles.", default_port: 8082, installed: false, web_ui: true, bind: null, update_available: null },
      { slug: "n8n", name: "n8n", description: "Workflow automation engine with webhook routing.", default_port: 5678, installed: false, web_ui: true, bind: null, update_available: false },
      { slug: "qdrant", name: "Qdrant", description: "Vector database for semantic search and RAG.", default_port: 6333, installed: false, web_ui: true, bind: null, update_available: null },
      { slug: "tailscale", name: "Tailscale", description: "Zero-config private mesh VPN for server access.", default_port: 41641, installed: false, web_ui: false, bind: null, update_available: null },
    ],
    hostname: os.hostname() || "ubuntu-vps-01",
    swapMb: 2048,
    swappiness: 10,
    trash: [],
    filesByRoot: {
      apps: {
        "": [
          { name: "core-api", kind: "dir", size: 4096, modified: new Date().toISOString(), mode: "0755", owner: "deploy", group: "deploy", link_target: null, link_is_dir: false, locked: false },
          { name: "web-storefront", kind: "dir", size: 4096, modified: new Date().toISOString(), mode: "0755", owner: "deploy", group: "deploy", link_target: null, link_is_dir: false, locked: false },
        ],
        "core-api": [
          { name: "package.json", kind: "file", size: 1240, modified: new Date().toISOString(), mode: "0644", owner: "deploy", group: "deploy", link_target: null, link_is_dir: false, locked: false },
          { name: ".env.production", kind: "file", size: 280, modified: new Date().toISOString(), mode: "0600", owner: "deploy", group: "deploy", link_target: null, link_is_dir: false, locked: false },
          { name: "dist", kind: "dir", size: 4096, modified: new Date().toISOString(), mode: "0755", owner: "deploy", group: "deploy", link_target: null, link_is_dir: false, locked: false },
        ],
      },
      www: {
        "": [
          { name: "docs", kind: "dir", size: 4096, modified: new Date().toISOString(), mode: "0755", owner: "www-data", group: "www-data", link_target: null, link_is_dir: false, locked: false },
        ],
        docs: [
          { name: "index.html", kind: "file", size: 4820, modified: new Date().toISOString(), mode: "0644", owner: "www-data", group: "www-data", link_target: null, link_is_dir: false, locked: false },
        ],
      },
      drive: {
        "": [
          { name: "sql-dumps", kind: "dir", size: 4096, modified: new Date().toISOString(), mode: "0755", owner: "root", group: "root", link_target: null, link_is_dir: false, locked: false },
        ],
      },
    },
    webmailMessages: {
      "admin@paixpanel.local": [
        {
          id: "msg-101",
          folder: "INBOX",
          from: "Let's Encrypt Expiry Bot <expiry@letsencrypt.org>",
          to: "admin@paixpanel.local",
          cc: "",
          subject: "TLS certificate issued for paixpanel.local",
          date: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
          message_id: "<cert-101@letsencrypt.org>",
          text_body: "Your ACME certificate for paixpanel.local and mail.paixpanel.local was renewed automatically and installed on nginx, Postfix, and Dovecot.",
          html_body: null,
          seen: false,
          flagged: true,
          attachments: [],
        },
        {
          id: "msg-102",
          folder: "INBOX",
          from: "monitoring@shopdemo.co.tz",
          to: "admin@paixpanel.local",
          cc: "ops@paixpanel.local",
          subject: "Daily backup snapshot verified",
          date: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
          message_id: "<backup-102@shopdemo.co.tz>",
          text_body: "Nightly restic snapshot completed cleanly.\n\nPaths: /srv/apps, /etc/vps-panel, /var/lib/vps-panel\nDuration: 18s",
          html_body: null,
          seen: true,
          flagged: false,
          attachments: [],
        },
        {
          id: "msg-103",
          folder: "Sent",
          from: "admin@paixpanel.local",
          to: "orders@shopdemo.co.tz",
          cc: "",
          subject: "Welcome to Paix Webmail",
          date: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
          message_id: "<welcome-103@paixpanel.local>",
          text_body: "Mail routing and DKIM signatures are live for shopdemo.co.tz.",
          html_body: null,
          seen: true,
          flagged: false,
          attachments: [],
        },
      ],
      "orders@shopdemo.co.tz": [
        {
          id: "msg-201",
          folder: "INBOX",
          from: "customer@example.com",
          to: "orders@shopdemo.co.tz",
          cc: "",
          subject: "Order #4821 confirmation inquiry",
          date: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
          message_id: "<ord-4821@example.com>",
          text_body: "Hello team,\n\nPlease confirm dispatch timing for Order #4821.\n\nThanks!",
          html_body: null,
          seen: false,
          flagged: false,
          attachments: [],
        },
      ],
    },
    sshLogs: [
      {
        timestamp: new Date(Date.now() - 90 * 1000).toISOString(),
        event_type: "failed_password",
        user: "root",
        ip: "198.51.100.77",
        port: 54122,
        method: "password",
        raw: `${new Date(Date.now() - 90 * 1000).toISOString()} vps sshd[2410]: Failed password for root from 198.51.100.77 port 54122 ssh2`,
      },
      {
        timestamp: new Date(Date.now() - 180 * 1000).toISOString(),
        event_type: "invalid_user",
        user: "ubuntu",
        ip: "198.51.100.77",
        port: 54118,
        method: "password",
        raw: `${new Date(Date.now() - 180 * 1000).toISOString()} vps sshd[2408]: Failed password for invalid user ubuntu from 198.51.100.77 port 54118 ssh2`,
      },
      {
        timestamp: new Date(Date.now() - 600 * 1000).toISOString(),
        event_type: "invalid_user",
        user: "admin",
        ip: "203.0.113.88",
        port: 41920,
        method: null,
        raw: `${new Date(Date.now() - 600 * 1000).toISOString()} vps sshd[2350]: Invalid user admin from 203.0.113.88 port 41920`,
      },
      {
        timestamp: new Date(Date.now() - 1500 * 1000).toISOString(),
        event_type: "accepted_publickey",
        user: "root",
        ip: "41.59.161.63",
        port: 51802,
        method: "publickey",
        raw: `${new Date(Date.now() - 1500 * 1000).toISOString()} vps sshd[2210]: Accepted publickey for root from 41.59.161.63 port 51802 ssh2: ED25519 SHA256:9xK2mL`,
      },
    ],
    sshSessions: [
      {
        user: "root",
        tty: "pts/0",
        source_ip: "41.59.161.63",
        since: new Date(Date.now() - 1500 * 1000).toISOString(),
        idle: "00:02",
      },
    ],
    manualBannedIps: ["198.51.100.77"],
  };
  return g.__boltPreviewState;
}

function readRealSysInfo(): SysInfo {
  const [l1, l5, l15] = os.loadavg();
  const totalKb = Math.round(os.totalmem() / 1024);
  const availKb = Math.round(os.freemem() / 1024);
  let diskTotal = 40 * 1024 * 1024 * 1024;
  let diskFree = 28 * 1024 * 1024 * 1024;
  try {
    const stat = fs.statfsSync("/");
    diskTotal = Number(stat.blocks) * Number(stat.bsize);
    diskFree = Number(stat.bavail) * Number(stat.bsize);
  } catch {
    // keep fallback
  }
  const ifaces = os.networkInterfaces();
  const net = Object.keys(ifaces)
    .filter((k) => k !== "lo")
    .slice(0, 3)
    .map((iface, idx) => ({
      iface,
      rx_bytes: 1_420_550_200 + idx * 120_000_000,
      tx_bytes: 2_810_114_900 + idx * 95_000_000,
    }));
  if (net.length === 0) {
    net.push({ iface: "eth0", rx_bytes: 1_420_550_200, tx_bytes: 2_810_114_900 });
  }
  return {
    uptime_secs: Math.max(60, Math.floor(os.uptime())),
    load_1: Number(l1.toFixed(2)),
    load_5: Number(l5.toFixed(2)),
    load_15: Number(l15.toFixed(2)),
    mem_total_kb: totalKb,
    mem_available_kb: availKb,
    swap_total_kb: getState().swapMb * 1024,
    swap_free_kb: Math.round(getState().swapMb * 1024 * 0.92),
    cpu_count: Math.max(1, os.cpus().length),
    disk: [{ mount: "/", total_bytes: diskTotal, free_bytes: diskFree }],
    net,
  };
}

function makeTask(s: PreviewState, kind: string, log: string[]): string {
  const id = `task-${Date.now().toString(36)}`;
  s.tasks.unshift({
    id,
    kind,
    status: "succeeded",
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
    log,
  });
  return id;
}

export async function handlePreviewAgentRequest<T>(
  method: string,
  rawPath: string,
  body?: unknown,
): Promise<T> {
  const s = getState();
  const [pathname, qs] = rawPath.split("?");
  const params = new URLSearchParams(qs ?? "");
  const m = method.toUpperCase();
  const b = (body ?? {}) as Record<string, unknown>;

  if (m === "GET" && pathname === "/health") {
    return { ok: true, version: "0.1.0-preview", now: new Date().toISOString() } as T;
  }

  if (m === "GET" && pathname === "/sysinfo") {
    return readRealSysInfo() as T;
  }

  if (m === "GET" && pathname === "/sysinfo/folders") {
    const sys = readRealSysInfo();
    const d = sys.disk[0];
    const used = Math.max(0, d.total_bytes - d.free_bytes);
    const resp: FolderSizes = {
      mount: "/",
      total_bytes: d.total_bytes,
      used_bytes: used,
      avail_bytes: d.free_bytes,
      measured_at: new Date().toISOString(),
      took_ms: 42,
      folders: [
        { path: "/srv/apps", label: "Deployed apps", kind: "data", parent: null, bytes: 1_240_000_000 },
        { path: "/var/lib/docker", label: "Docker images & volumes", kind: "data", parent: null, bytes: 2_890_000_000 },
        { path: "/var/vmail", label: "Mailboxes", kind: "data", parent: null, bytes: 320_000_000 },
        { path: "/var/log", label: "System & web logs", kind: "cache", parent: null, bytes: 185_000_000 },
        { path: "/usr", label: "OS & packages", kind: "system", parent: null, bytes: 3_410_000_000 },
      ],
    };
    return resp as T;
  }

  // Apps
  if (m === "GET" && pathname === "/apps") {
    return s.apps.map(({ env: _e, execStart: _x, ...rest }) => rest) as T;
  }
  if (m === "POST" && pathname === "/apps") {
    const name = String(b.name ?? "new-app");
    const port = Number(b.port ?? 4010);
    const subdomain = String(b.subdomain ?? "");
    const runtime = b.runtime === "docker" ? "docker" : "node";
    s.apps.push({
      name,
      subdomain,
      port,
      source_dir: runtime === "docker" ? "" : String(b.source_dir ?? `/srv/apps/${name}`),
      active: "active",
      sub: "running",
      kind: "panel",
      source_dir_state: runtime === "docker" ? "none" : "populated",
      runtime,
      image: runtime === "docker" ? String((b.docker as { image?: string } | undefined)?.image ?? "nginx:alpine") : null,
      docker_build: false,
      execStart: String(b.exec_start ?? "/usr/bin/npm start"),
      env: Array.isArray(b.env) ? (b.env as { key: string; value: string }[]) : [],
    });
    const task_id = makeTask(s, "app:deploy", [`Deploying ${name} on port ${port}...`, "Service started."]);
    return { task_id } as T;
  }

  const appMatch = pathname.match(/^\/apps\/([^/]+)(?:\/(.+))?$/);
  if (appMatch) {
    const appName = decodeURIComponent(appMatch[1]);
    const sub = appMatch[2] ?? "";
    const app = s.apps.find((a) => a.name === appName);
    if (!app) {
      if (sub === "source-state") return { state: "populated" } as T;
      return { ok: true } as T;
    }
    if (m === "GET" && !sub) {
      const { env: _e, execStart: _x, ...rest } = app;
      return rest as T;
    }
    if (m === "DELETE" && !sub) {
      s.apps = s.apps.filter((a) => a.name !== appName);
      return { ok: true } as T;
    }
    if (m === "POST" && (sub === "start" || sub === "restart")) {
      app.active = "active";
      app.sub = "running";
      return { ok: true } as T;
    }
    if (m === "POST" && sub === "stop") {
      app.active = "inactive";
      app.sub = "dead";
      return { ok: true } as T;
    }
    if (m === "POST" && sub === "update") {
      const task_id = makeTask(s, "app:update", [`Pulling latest changes for ${appName}...`, "Rebuilding & restarting...", "Update succeeded."]);
      return { task_id } as T;
    }
    if (m === "GET" && sub === "git-status") {
      return { has_repo: true, behind: 0, ahead: 0, current_sha: "a4f91c2", upstream_sha: "a4f91c2", error: null } as T;
    }
    if (m === "GET" && sub === "source-state") {
      return { state: app.source_dir_state === "none" ? "missing" : app.source_dir_state } as T;
    }
    if (m === "GET" && sub === "env") {
      return { env: app.env } as T;
    }
    if (m === "PATCH" && sub === "env") {
      app.env = (b.env as { key: string; value: string }[]) ?? app.env;
      return { ok: true, restarted: true } as T;
    }
    if (m === "GET" && sub === "env-files") {
      return {
        source_dir: app.source_dir || `/srv/apps/${appName}`,
        files: [
          {
            path: ".env.production",
            abs_path: `${app.source_dir || `/srv/apps/${appName}`}/.env.production`,
            size: 64,
            content: app.env.map((e) => `${e.key}=${e.value}`).join("\n"),
            too_large: false,
          },
        ],
        truncated: false,
      } as T;
    }
    if ((m === "PUT" || m === "DELETE") && sub === "env-files") {
      return { ok: true, restarted: b.restart ? appName : null } as T;
    }
    if (m === "PATCH" && sub === "entrypoint") {
      app.execStart = String(b.exec_start ?? app.execStart);
      return { ok: true, restarted: true } as T;
    }
    if (m === "PATCH" && sub === "routing") {
      app.subdomain = String(b.subdomain ?? "");
      app.port = Number(b.port ?? app.port);
      return { ok: true, state: app.subdomain ? "assigned" : "unassigned", bound: true, log: [] } as T;
    }
    if (m === "GET" && sub === "docker") {
      return {
        spec: {
          image: app.image ?? "",
          container_port: app.port,
          volumes: ["/metabase-data"],
          memory_mb: 1024,
          cpus: 1,
          build: null,
        },
        current_id: "sha256:9f2c8d1b7a34",
        previous_id: null,
        current_commit: null,
        previous_commit: null,
        volumes: [{ container_path: "/metabase-data", volume: `${appName}_data`, host_path: `/var/lib/docker/volumes/${appName}_data/_data` }],
      } as T;
    }
    if (m === "GET" && sub === "image-status") {
      return { image: app.image ?? "", current_id: "sha256:9f2c8d1b7a34", update_available: false, error: null } as T;
    }
  }

  // Sites & SSL
  if (m === "GET" && pathname === "/sites") return s.sites as T;
  if (m === "POST" && pathname === "/sites") {
    const domain = String(b.domain ?? "");
    if (domain && !s.sites.some((x) => x.domain === domain)) {
      s.sites.push({ domain, kind: "site" });
      if (b.issue_ssl && !s.certs.some((c) => c.domain === domain)) {
        s.certs.push({
          domain,
          not_after: new Date(Date.now() + 89 * 86400 * 1000).toISOString(),
          days_remaining: 89,
          serving: true,
        });
      }
    }
    return { ok: true, task_id: b.issue_ssl ? makeTask(s, "ssl:issue", [`Issued Let's Encrypt cert for ${domain}`]) : null } as T;
  }
  const siteMatch = pathname.match(/^\/sites\/([^/]+)(?:\/(.+))?$/);
  if (siteMatch) {
    const domain = decodeURIComponent(siteMatch[1]);
    const sub = siteMatch[2] ?? "";
    if (m === "GET" && sub === "status") {
      const cert = s.certs.find((c) => c.domain === domain);
      return {
        cert_exists: Boolean(cert),
        cert_not_after: cert?.not_after ?? null,
        days_remaining: cert?.days_remaining ?? null,
      } as T;
    }
    if (m === "DELETE" && !sub) {
      s.sites = s.sites.filter((x) => x.domain !== domain);
      return { ok: true } as T;
    }
    if (m === "PATCH" && !sub) {
      return { ok: true, task_id: null } as T;
    }
  }
  if (m === "GET" && pathname === "/ssl") return s.certs as T;
  if (m === "POST" && pathname === "/ssl/renew") {
    const domain = String(b.domain ?? "");
    const c = s.certs.find((x) => x.domain === domain);
    if (c) {
      c.days_remaining = 89;
      c.not_after = new Date(Date.now() + 89 * 86400 * 1000).toISOString();
    }
    return { task_id: makeTask(s, "ssl:renew", [`Renewed certificate for ${domain}`]) } as T;
  }

  // DNS
  if (m === "GET" && pathname === "/dns/zones") return s.zones as T;
  if (m === "POST" && pathname === "/dns/zones") {
    const name = String(b.name ?? "");
    const zone: ZoneRow = { id: s.zones.length + 1, name, type: "Native", records: 2 };
    s.zones.push(zone);
    s.recordsByZone[name] = [
      { id: s.nextRecordId++, name, type: "A", content: String(b.seed_ip ?? "203.0.113.42"), ttl: 300, prio: 0, disabled: false },
      { id: s.nextRecordId++, name: `www.${name}`, type: "CNAME", content: name, ttl: 300, prio: 0, disabled: false },
    ];
    return zone as T;
  }
  const zoneRecMatch = pathname.match(/^\/dns\/zones\/([^/]+)\/records$/);
  if (zoneRecMatch) {
    const zone = decodeURIComponent(zoneRecMatch[1]);
    if (m === "GET") return (s.recordsByZone[zone] ?? []) as T;
    if (m === "POST") {
      const rec: RecordRow = {
        id: s.nextRecordId++,
        name: String(b.name ?? zone),
        type: String(b.type ?? "A"),
        content: String(b.content ?? ""),
        ttl: Number(b.ttl ?? 300),
        prio: Number(b.prio ?? 0),
        disabled: false,
      };
      s.recordsByZone[zone] = [...(s.recordsByZone[zone] ?? []), rec];
      return rec as T;
    }
  }
  const zoneActionMatch = pathname.match(/^\/dns\/zones\/([^/]+)(?:\/(sign|reconcile))?$/);
  if (zoneActionMatch) {
    const zone = decodeURIComponent(zoneActionMatch[1]);
    const act = zoneActionMatch[2];
    if (m === "DELETE" && !act) {
      s.zones = s.zones.filter((z) => z.name !== zone);
      delete s.recordsByZone[zone];
      return { ok: true } as T;
    }
    if (m === "POST" && act === "reconcile") {
      return { added: [], updated: [], unchanged: ["A", "MX", "SPF"], non_standard_extras: [] } as T;
    }
    if (m === "POST" && act === "sign") return { ok: true } as T;
  }
  const recIdMatch = pathname.match(/^\/dns\/records\/(\d+)$/);
  if (recIdMatch) {
    const id = Number(recIdMatch[1]);
    for (const z of Object.keys(s.recordsByZone)) {
      if (m === "DELETE") {
        s.recordsByZone[z] = s.recordsByZone[z].filter((r) => r.id !== id);
      } else if (m === "PATCH") {
        const found = s.recordsByZone[z].find((r) => r.id === id);
        if (found) Object.assign(found, b);
      }
    }
    return { ok: true } as T;
  }

  // Mail
  if (m === "GET" && pathname === "/mail/domains") return s.mailDomains as T;
  if (m === "POST" && pathname === "/mail/domains") {
    const name = String(b.name ?? "");
    s.mailDomains.push({ id: s.mailDomains.length + 1, name, mailboxes: 0, ip_preference: "default" });
    return { name, dkim_status: "active", records_published: true, note: "DKIM & SPF records published", ssl_task_id: null } as T;
  }
  if (m === "GET" && pathname === "/mail/mailboxes") {
    return { server: "mail.paixpanel.local", mailboxes: s.mailboxes } as T;
  }
  if (m === "POST" && pathname === "/mail/mailboxes") {
    const email = String(b.email ?? "");
    const initial_password = String(b.password ?? "MailPass!2026");
    s.mailboxes.push({ id: s.nextMailboxId++, email, quota_mb: Number(b.quota_mb ?? 1024) });
    return { email, initial_password } as T;
  }
  const mbUsageMatch = pathname.match(/^\/mail\/mailboxes\/([^/]+)\/usage$/);
  if (mbUsageMatch && m === "GET") return { usage_bytes: 18_420_000, usage_mb: 18 } as T;
  const mbMatch = pathname.match(/^\/mail\/mailboxes\/([^/]+)$/);
  if (mbMatch) {
    const email = decodeURIComponent(mbMatch[1]);
    if (m === "DELETE") {
      s.mailboxes = s.mailboxes.filter((x) => x.email !== email);
      return { ok: true, maildir_trash_id: null, forwarders_removed: 0 } as T;
    }
    if (m === "PATCH") {
      const mb = s.mailboxes.find((x) => x.email === email);
      if (mb && b.quota_mb !== undefined) mb.quota_mb = Number(b.quota_mb);
      return { ok: true } as T;
    }
  }
  if (m === "GET" && pathname === "/mail/aliases") return s.aliases as T;
  if (m === "POST" && pathname === "/mail/aliases") {
    const source = String(b.source ?? "");
    const dests = Array.isArray(b.destinations) ? (b.destinations as string[]) : [];
    for (const d of dests) s.aliases.push({ id: s.nextAliasId++, source, destination: d });
    return { added: dests.length } as T;
  }
  const aliasMatch = pathname.match(/^\/mail\/aliases\/(\d+)$/);
  if (aliasMatch && m === "DELETE") {
    const id = Number(aliasMatch[1]);
    s.aliases = s.aliases.filter((a) => a.id !== id);
    return { ok: true } as T;
  }
  if (m === "GET" && pathname === "/mail/track") {
    return {
      address: params.get("address") ?? "",
      days: Number(params.get("days") ?? 3),
      rows: [
        {
          time: new Date(Date.now() - 1800 * 1000).toISOString(),
          queue_id: "4X9aBc21",
          from: "orders@shopdemo.co.tz",
          to: "customer@example.com",
          orig_to: null,
          status: "delivered",
          detail: "250 2.0.0 OK queued",
        },
      ],
      truncated: false,
    } as T;
  }
  if (pathname === "/mail/ip-settings") {
    if (m === "PUT" && (b.default_protocol === "ipv4" || b.default_protocol === "ipv6")) {
      s.mailIpDefault = b.default_protocol;
    }
    return {
      default_protocol: s.mailIpDefault,
      server_ipv4: "203.0.113.42",
      server_ipv6: null,
      domains: s.mailDomains.map((d) => ({
        name: d.name,
        preference: d.ip_preference ?? "default",
        effective: d.ip_preference && d.ip_preference !== "default" ? d.ip_preference : s.mailIpDefault,
      })),
      notes: ["Outbound IPv4 is active with valid PTR and SPF."],
      ipv6_active: false,
    } as T;
  }
  if (m === "GET" && pathname === "/mail/ip-check") {
    return {
      helo_host: "mail.paixpanel.local",
      ipv4: {
        address: "203.0.113.42",
        ready: true,
        checks: [
          { id: "ptr", label: "Reverse DNS (PTR)", status: "ok", detail: "Matches mail.paixpanel.local" },
          { id: "port25", label: "Outbound port 25", status: "ok", detail: "Reachable" },
        ],
      },
      ipv6: { address: null, ready: false, checks: [] },
    } as T;
  }

  // Built-in Webmail
  const wmFoldersMatch = pathname.match(/^\/mail\/webmail\/([^/]+)\/folders$/);
  if (wmFoldersMatch && m === "GET") {
    const email = decodeURIComponent(wmFoldersMatch[1]);
    const list = s.webmailMessages[email] ?? [];
    const folderNames = ["INBOX", "Sent", "Drafts", "Junk", "Trash"];
    return folderNames.map((name) => {
      const inFolder = list.filter((msg) => msg.folder === name);
      return {
        name,
        total: inFolder.length,
        unread: inFolder.filter((msg) => !msg.seen).length,
      };
    }) as T;
  }
  const wmListMatch = pathname.match(/^\/mail\/webmail\/([^/]+)\/messages$/);
  if (wmListMatch && m === "GET") {
    const email = decodeURIComponent(wmListMatch[1]);
    const folder = params.get("folder") ?? "INBOX";
    const q = (params.get("q") ?? "").trim().toLowerCase();
    const list = (s.webmailMessages[email] ?? [])
      .filter((msg) => msg.folder === folder)
      .filter((msg) => {
        if (!q) return true;
        return `${msg.subject} ${msg.from} ${msg.to} ${msg.text_body}`.toLowerCase().includes(q);
      })
      .map((msg) => ({
        id: msg.id,
        folder: msg.folder,
        from: msg.from,
        to: msg.to,
        subject: msg.subject,
        date: msg.date,
        snippet: msg.text_body.replace(/\s+/g, " ").slice(0, 140),
        seen: msg.seen,
        flagged: msg.flagged,
        has_attachments: msg.attachments.length > 0,
        size_bytes: msg.text_body.length + 256,
      }));
    return list as T;
  }
  const wmReadMatch = pathname.match(/^\/mail\/webmail\/([^/]+)\/messages\/([^/]+)$/);
  if (wmReadMatch && m === "GET") {
    const email = decodeURIComponent(wmReadMatch[1]);
    const id = decodeURIComponent(wmReadMatch[2]);
    const msg = (s.webmailMessages[email] ?? []).find((x) => x.id === id);
    if (!msg) throw new Error("Message not found");
    msg.seen = true;
    return msg as T;
  }
  const wmSendMatch = pathname.match(/^\/mail\/webmail\/([^/]+)\/send$/);
  if (wmSendMatch && m === "POST") {
    const email = decodeURIComponent(wmSendMatch[1]);
    const msgId = `<sent-${Date.now()}@${email.split("@")[1] ?? "local"}>`;
    const newMsg: WebmailMessageDetail = {
      id: `msg-${Date.now()}`,
      folder: "Sent",
      from: email,
      to: String(b.to ?? ""),
      cc: String(b.cc ?? ""),
      subject: String(b.subject ?? "(no subject)"),
      date: new Date().toISOString(),
      message_id: msgId,
      text_body: String(b.body ?? ""),
      html_body: null,
      seen: true,
      flagged: false,
      attachments: [],
    };
    s.webmailMessages[email] = [newMsg, ...(s.webmailMessages[email] ?? [])];
    // If sent to another local mailbox in preview, deliver into its INBOX too!
    const recipients = String(b.to ?? "").split(/[,;]/).map((x) => x.trim().toLowerCase());
    for (const rcpt of recipients) {
      if (s.mailboxes.some((mb) => mb.email.toLowerCase() === rcpt)) {
        s.webmailMessages[rcpt] = [
          { ...newMsg, id: `inbox-${Date.now()}`, folder: "INBOX", seen: false },
          ...(s.webmailMessages[rcpt] ?? []),
        ];
      }
    }
    return { ok: true, message_id: msgId } as T;
  }
  const wmActionMatch = pathname.match(/^\/mail\/webmail\/([^/]+)\/action$/);
  if (wmActionMatch && m === "POST") {
    const email = decodeURIComponent(wmActionMatch[1]);
    const list = s.webmailMessages[email] ?? [];
    const idx = list.findIndex((x) => x.id === String(b.message_id ?? ""));
    if (idx !== -1) {
      const msg = list[idx];
      if (b.action === "mark_read") msg.seen = true;
      else if (b.action === "mark_unread") msg.seen = false;
      else if (b.action === "flag") msg.flagged = !msg.flagged;
      else if (b.action === "move" && b.target_folder) msg.folder = String(b.target_folder);
      else if (b.action === "delete") {
        if (msg.folder === "Trash") list.splice(idx, 1);
        else msg.folder = "Trash";
      }
    }
    return { ok: true } as T;
  }

  // MariaDB & Postgres
  if (m === "GET" && pathname === "/db/users") return s.dbUsers as T;
  if (m === "POST" && pathname === "/db/users") {
    const user = String(b.user ?? "");
    const host = String(b.host ?? "localhost");
    s.dbUsers.push({ user, host });
    return { user, host, initial_password: String(b.password ?? "DbPass!2026") } as T;
  }
  if (m === "GET" && pathname === "/db/databases") return s.dbDatabases as T;
  if (m === "POST" && pathname === "/db/databases") {
    const d = { name: String(b.name ?? ""), users: [] };
    s.dbDatabases.push(d);
    return d as T;
  }
  if (m === "POST" && pathname === "/db/grant") {
    const dbRow = s.dbDatabases.find((d) => d.name === b.database);
    if (dbRow) dbRow.users.push({ user: String(b.user ?? ""), host: String(b.host ?? "localhost") });
    return { ok: true } as T;
  }
  if (m === "POST" && pathname === "/db/revoke") {
    const dbRow = s.dbDatabases.find((d) => d.name === b.database);
    if (dbRow) dbRow.users = dbRow.users.filter((u) => u.user !== b.user);
    return { ok: true } as T;
  }
  if (m === "DELETE" && pathname.startsWith("/db/users/")) {
    const u = decodeURIComponent(pathname.slice("/db/users/".length));
    s.dbUsers = s.dbUsers.filter((x) => x.user !== u);
    return { ok: true } as T;
  }
  if (m === "DELETE" && pathname.startsWith("/db/databases/")) {
    const d = decodeURIComponent(pathname.slice("/db/databases/".length));
    s.dbDatabases = s.dbDatabases.filter((x) => x.name !== d);
    return { ok: true } as T;
  }

  if (m === "GET" && pathname === "/pg/users") return s.pgRoles as T;
  if (m === "POST" && pathname === "/pg/users") {
    const user = String(b.user ?? "");
    s.pgRoles.push({ user, superuser: Boolean(b.superuser) });
    return { user, initial_password: String(b.password ?? "PgPass!2026") } as T;
  }
  if (m === "GET" && pathname === "/pg/databases") return s.pgDatabases as T;
  if (m === "POST" && pathname === "/pg/databases") {
    const row = { name: String(b.name ?? ""), owner: String(b.owner ?? "postgres") };
    s.pgDatabases.push(row);
    return row as T;
  }
  if (m === "GET" && pathname === "/pg/pgvector") {
    return { available: true, enabled: s.pgvectorEnabled } as T;
  }
  if (m === "POST" && pathname === "/pg/pgvector/enable") {
    const d = String(b.database ?? "");
    if (d && !s.pgvectorEnabled.includes(d)) s.pgvectorEnabled.push(d);
    return { ok: true } as T;
  }
  if (m === "POST" && pathname === "/pg/pgvector/disable") {
    s.pgvectorEnabled = s.pgvectorEnabled.filter((x) => x !== b.database);
    return { ok: true } as T;
  }

  // Firewall & Fail2ban
  if (m === "GET" && pathname === "/firewall/status") return s.firewall as T;
  if (m === "POST" && pathname === "/firewall/allow") {
    s.firewall.rules.push(`${b.port}/${b.proto ?? "tcp"} ALLOW IN Anywhere`);
    return { ok: true } as T;
  }
  if (m === "POST" && pathname === "/firewall/deny") {
    s.firewall.rules = s.firewall.rules.filter((r) => !r.startsWith(`${b.port}/`));
    return { ok: true } as T;
  }
  if (m === "GET" && pathname === "/fail2ban/jails") return s.jails as T;
  if (m === "POST" && pathname === "/fail2ban/unban") {
    const j = s.jails.find((x) => x.name === b.jail);
    if (j) j.banned = j.banned.filter((ip) => ip !== b.ip);
    return { ok: true } as T;
  }
  if (m === "POST" && pathname === "/fail2ban/unban-all") {
    const j = s.jails.find((x) => x.name === b.jail);
    if (j) j.banned = [];
    return { ok: true } as T;
  }
  const jailFailMatch = pathname.match(/^\/fail2ban\/jails\/([^/]+)\/failed-by-ip$/);
  if (jailFailMatch && m === "GET") {
    return [{ ip: "198.51.100.77", attempts: 14, last_seen: new Date().toISOString() }] as T;
  }

  // Security & SSH Intrusion Monitor
  if (m === "GET" && pathname === "/security/overview") {
    const sshdJail = s.jails.find((j) => j.name === "sshd");
    const bannedSet = new Set([...(sshdJail?.banned ?? []), ...s.manualBannedIps]);
    const aggMap = new Map<string, {
      ip: string;
      failed_attempts: number;
      invalid_user_attempts: number;
      accepted_attempts: number;
      usernames: Set<string>;
      last_seen: string;
    }>();
    let failed_count = 0;
    let invalid_user_count = 0;
    let accepted_count = 0;

    for (const ev of s.sshLogs) {
      if (ev.event_type === "failed_password" || ev.event_type === "auth_failure") failed_count++;
      if (ev.event_type === "invalid_user") {
        failed_count++;
        invalid_user_count++;
      }
      if (ev.event_type === "accepted_publickey" || ev.event_type === "accepted_password") accepted_count++;
      if (ev.ip) {
        const cur = aggMap.get(ev.ip) ?? {
          ip: ev.ip,
          failed_attempts: 0,
          invalid_user_attempts: 0,
          accepted_attempts: 0,
          usernames: new Set<string>(),
          last_seen: ev.timestamp,
        };
        if (ev.user) cur.usernames.add(ev.user);
        if (ev.timestamp > cur.last_seen) cur.last_seen = ev.timestamp;
        if (ev.event_type === "failed_password" || ev.event_type === "auth_failure") cur.failed_attempts++;
        if (ev.event_type === "invalid_user") {
          cur.failed_attempts++;
          cur.invalid_user_attempts++;
        }
        if (ev.event_type === "accepted_publickey" || ev.event_type === "accepted_password") cur.accepted_attempts++;
        aggMap.set(ev.ip, cur);
      }
    }

    const attackers = [...aggMap.values()].map((a) => ({
      ip: a.ip,
      failed_attempts: a.failed_attempts,
      invalid_user_attempts: a.invalid_user_attempts,
      accepted_attempts: a.accepted_attempts,
      usernames: [...a.usernames],
      last_seen: a.last_seen,
      banned: bannedSet.has(a.ip),
    }));
    const unique_attacker_ips = attackers.filter((a) => a.failed_attempts > 0).length;
    const alerts: string[] = [];
    if (failed_count > 0) {
      alerts.push(`${failed_count} failed or suspicious SSH login attempt(s) from ${unique_attacker_ips} IP(s) in recent logs.`);
    }
    const overview: SecurityOverview = {
      alert_level: failed_count > 0 ? "elevated" : "ok",
      alerts,
      posture: {
        ssh_port: s.sshConfig.port,
        permit_root_login: s.sshConfig.permit_root_login,
        password_auth: s.sshConfig.password_auth,
        idle_timeout_minutes: s.sshConfig.idle_timeout_minutes,
        root_authorized_keys: s.sshKeys.filter((k) => k.authorized).length,
        ufw_enabled: s.firewall.ufw_enabled,
        ufw_rules_count: s.firewall.rules.length,
        fail2ban_active: s.firewall.fail2ban_active,
        total_banned_ips: bannedSet.size,
        sshd_banned_ips: [...bannedSet],
        sshd_total_failed: sshdJail?.total_failed ?? failed_count,
      },
      active_sessions: s.sshSessions,
      attackers,
      stats: {
        total_events: s.sshLogs.length,
        failed_count,
        invalid_user_count,
        accepted_count,
        unique_attacker_ips,
      },
      logs: s.sshLogs,
    };
    return overview as T;
  }
  if (m === "POST" && pathname === "/security/ban-ip") {
    const ip = String(b.ip ?? "").trim();
    if (ip && !s.manualBannedIps.includes(ip)) s.manualBannedIps.push(ip);
    const sshd = s.jails.find((j) => j.name === "sshd");
    if (sshd && !sshd.banned.includes(ip)) sshd.banned.push(ip);
    return { ok: true } as T;
  }
  if (m === "POST" && pathname === "/security/unban-ip") {
    const ip = String(b.ip ?? "").trim();
    s.manualBannedIps = s.manualBannedIps.filter((x) => x !== ip);
    const sshd = s.jails.find((j) => j.name === "sshd");
    if (sshd) sshd.banned = sshd.banned.filter((x) => x !== ip);
    return { ok: true } as T;
  }

  // SSH
  if (m === "GET" && pathname === "/ssh/keys") return s.sshKeys as T;
  if (m === "POST" && pathname === "/ssh/keys") {
    s.sshKeys.push({
      fingerprint: `SHA256:${Math.random().toString(36).slice(2, 14)}`,
      key_type: "ssh-ed25519",
      comment: String(b.label ?? "added-key"),
      keypair_name: null,
      authorized: true,
    });
    return { ok: true } as T;
  }
  if (m === "DELETE" && pathname.startsWith("/ssh/keys/")) {
    const fp = decodeURIComponent(pathname.slice("/ssh/keys/".length));
    s.sshKeys = s.sshKeys.filter((k) => k.fingerprint !== fp);
    return { ok: true } as T;
  }
  if (m === "GET" && pathname === "/ssh/config") return s.sshConfig as T;
  if (m === "PATCH" && pathname === "/ssh/config") {
    Object.assign(s.sshConfig, b);
    return { ok: true } as T;
  }

  // Cron
  if (m === "GET" && pathname === "/cron/jobs") return s.cronJobs as T;
  if (m === "POST" && pathname === "/cron/jobs") {
    const job: CronJobRow = {
      id: `cron-${Date.now().toString(36)}`,
      schedule: String(b.schedule ?? "0 * * * *"),
      user: String(b.user ?? "root"),
      command: String(b.command ?? ""),
      label: String(b.label ?? ""),
    };
    s.cronJobs.push(job);
    return job as T;
  }
  if (m === "DELETE" && pathname.startsWith("/cron/jobs/")) {
    const id = decodeURIComponent(pathname.slice("/cron/jobs/".length));
    s.cronJobs = s.cronJobs.filter((j) => j.id !== id);
    return { ok: true } as T;
  }

  // Files
  if (m === "GET" && pathname === "/files/roots") {
    const roots: FileRoot[] = [
      { id: "apps", label: "Apps", path: "/srv/apps", description: "Deployed app source folders", writable: true, exists: true },
      { id: "www", label: "Web roots", path: "/var/www", description: "Static folder sites", writable: true, exists: true },
      { id: "drive", label: "Drive", path: "/var/lib/vps-panel/drive", description: "Staged SQL dumps and uploads", writable: true, exists: true },
      { id: "logs", label: "Nginx logs", path: "/var/log/nginx", description: "Access & error logs (read-only)", writable: false, exists: true },
    ];
    return roots as T;
  }
  if (m === "GET" && pathname === "/files/list") {
    const rootId = params.get("root") ?? "apps";
    const rel = params.get("path") ?? "";
    const entries = s.filesByRoot[rootId]?.[rel] ?? [];
    return {
      root: { id: rootId, label: rootId, path: `/srv/${rootId}`, description: "", writable: rootId !== "logs", exists: true },
      path: rel,
      abs_path: rel ? `/srv/${rootId}/${rel}` : `/srv/${rootId}`,
      writable: rootId !== "logs",
      entries,
      truncated: false,
    } as T;
  }
  if (m === "GET" && pathname === "/files/trash") return s.trash as T;

  // Services, system, backups, tasks, quickInstall, docker, tailscale, privacy
  if (m === "GET" && pathname === "/services") return s.services as T;
  const svcMatch = pathname.match(/^\/services\/([^/]+)\/([^/]+)$/);
  if (svcMatch && m === "POST") {
    const unit = decodeURIComponent(svcMatch[1]);
    const act = decodeURIComponent(svcMatch[2]);
    const row = s.services.find((x) => x.unit === unit);
    if (row) {
      row.active = act === "stop" ? "inactive" : "active";
      row.sub = act === "stop" ? "dead" : "running";
    }
    return { ok: true } as T;
  }
  if (m === "GET" && pathname === "/system/services") return s.coreServices as T;
  if (m === "GET" && pathname === "/system/users") return s.systemUsers as T;
  if (m === "GET" && pathname === "/system/swap") {
    const sys = readRealSysInfo();
    return {
      path: "/swapfile",
      unsupported: null,
      file_bytes: s.swapMb * 1024 * 1024,
      active: s.swapMb > 0,
      size_bytes: s.swapMb * 1024 * 1024,
      used_bytes: Math.round(s.swapMb * 1024 * 1024 * 0.08),
      in_fstab: true,
      other: [],
      leftover_bridge: null,
      swappiness: s.swappiness,
      mem_total_bytes: sys.mem_total_kb * 1024,
      mem_available_bytes: sys.mem_available_kb * 1024,
      disk_total_bytes: sys.disk[0].total_bytes,
      disk_free_bytes: sys.disk[0].free_bytes,
      disk_reserve_bytes: 2 * 1024 * 1024 * 1024,
      min_mb: 256,
      max_mb: 8192,
      busy: false,
    } as T;
  }
  if (m === "GET" && pathname === "/system/hostname") {
    return { hostname: s.hostname, running: s.hostname, cloud_init: true, preserved: true } as T;
  }
  if (m === "PUT" && pathname === "/system/hostname") {
    s.hostname = String(b.hostname ?? s.hostname);
    return { hostname: s.hostname, steps: ["Updated static hostname", "Updated /etc/hosts"] } as T;
  }
  if (m === "GET" && pathname === "/system/update-check") {
    return { up_to_date: true, behind: 0, ahead: 0, current_commit: "7f4d21a", target_commit: "7f4d21a", repo_dir: "/opt/vps-panel", fetch_error: null } as T;
  }
  if (m === "GET" && pathname === "/backups") return s.backups as T;
  if (m === "POST" && pathname === "/backups/run") {
    const snap: Snapshot = {
      id: `snap-${Math.random().toString(16).slice(2, 10)}`,
      time: new Date().toISOString(),
      paths: ["/srv/apps", "/etc/vps-panel"],
      hostname: s.hostname,
    };
    s.backups.unshift(snap);
    return { task_id: makeTask(s, "backup:run", ["Scanning paths...", `Created snapshot ${snap.id}`]) } as T;
  }
  if (m === "GET" && pathname === "/tasks") return s.tasks as T;
  if (m === "GET" && pathname.startsWith("/tasks/")) {
    const id = decodeURIComponent(pathname.slice("/tasks/".length));
    return (s.tasks.find((t) => t.id === id) ?? s.tasks[0]) as T;
  }
  if (m === "GET" && pathname === "/quick-install") return s.quickInstall as T;
  if (m === "POST" && pathname.startsWith("/quick-install/")) {
    const slug = pathname.split("/")[2];
    const item = s.quickInstall.find((r) => r.slug === slug);
    if (item) {
      item.installed = true;
      item.bind = "127.0.0.1";
    }
    return { task_id: makeTask(s, `quick-install:${slug}`, [`Installed ${slug}`]) } as T;
  }
  if (m === "GET" && pathname === "/docker/status") {
    return { installed: true, running: true, version: "27.3.1" } as T;
  }
  if (m === "GET" && pathname === "/tailscale/status") {
    return {
      installed: false,
      version: null,
      daemon: "inactive",
      server_hostname: s.hostname,
      backend_state: null,
      auth_url: null,
      login_task: null,
      node: null,
      tailnet: null,
      user: null,
      peers: [],
      health: [],
      prefs: null,
      error: null,
    } as T;
  }
  if (pathname === "/privacy/status") {
    return {
      log_ip: "masked",
      log_query: "strip",
      retention_days: 14,
      parts: [
        { id: "nginx_logs", label: "Nginx access logs", wanted: "IPs masked, queries stripped", actual: "IPs masked, queries stripped", ok: true, detail: "" },
        { id: "journal", label: "System journal", wanted: "Retain 14 days", actual: "Retain 14 days", ok: true, detail: "" },
      ],
      notes: [],
    } as T;
  }

  return { ok: true } as T;
}
