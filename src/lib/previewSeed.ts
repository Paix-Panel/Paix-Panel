import "server-only";
import type Database from "better-sqlite3";
import { config } from "./config";

/**
 * Seeds realistic sample records in SQLite when running in AI Studio / local
 * preview mode without a live Ubuntu VPS agent. Never runs on a real VPS.
 */
export function seedPreviewDb(handle: Database.Database): void {
  if (!config.isPreviewMock) return;

  const alreadySeeded = handle
    .prepare(`SELECT value FROM settings WHERE key = 'panel.preview_seeded'`)
    .get() as { value: string } | undefined;

  if (!alreadySeeded) {
    const tx = handle.transaction(() => {
      handle
        .prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`)
        .run("panel.setup_complete", "true");
      handle
        .prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`)
        .run("panel.timezone", "auto");
      handle
        .prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`)
        .run("panel.acme_email", "admin@paixpanel.local");
      handle
        .prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`)
        .run("dns.ns_pair", "ns1.paixpanel.local,ns2.paixpanel.local");
      handle
        .prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`)
        .run("panel.preview_seeded", "1");

      const folderRes = handle
        .prepare(`INSERT INTO app_folders (name, sort_order, collapsed) VALUES (?, ?, 0)`)
        .run("Production", 0);
      const prodFolderId = Number(folderRes.lastInsertRowid);
      const toolsRes = handle
        .prepare(`INSERT INTO app_folders (name, sort_order, collapsed) VALUES (?, ?, 0)`)
        .run("Internal Tools", 1);
      const toolsFolderId = Number(toolsRes.lastInsertRowid);

      handle
        .prepare(
          `INSERT OR IGNORE INTO domains (name, dnssec) VALUES (?, 1), (?, 0)`,
        )
        .run("paixpanel.local", "shopdemo.co.tz");

      handle
        .prepare(
          `INSERT OR IGNORE INTO sites
            (domain, mode, upstream_port, folder_path, force_www_redirect, ssl_requested, ssl_issued_at)
           VALUES
            ('api.paixpanel.local', 'port', 4001, NULL, 0, 1, datetime('now', '-12 days')),
            ('app.paixpanel.local', 'port', 4002, NULL, 1, 1, datetime('now', '-25 days')),
            ('shopdemo.co.tz', 'port', 4003, NULL, 1, 1, datetime('now', '-5 days')),
            ('docs.paixpanel.local', 'folder', NULL, '/var/www/docs', 0, 1, datetime('now', '-18 days'))`,
        )
        .run();

      handle
        .prepare(
          `INSERT OR IGNORE INTO apps
            (name, source_dir, port, subdomain, runtime, entrypoint, ssl_enabled, repo_url, folder_id)
           VALUES
            ('core-api', '/srv/apps/core-api', 4001, 'api.paixpanel.local', 'node', 'npm start', 1, 'https://github.com/acme/core-api.git', ?),
            ('web-storefront', '/srv/apps/web-storefront', 4002, 'app.paixpanel.local', 'node', 'npm start', 1, 'https://github.com/acme/storefront.git', ?),
            ('analytics-ui', '', 4003, 'shopdemo.co.tz', 'docker', '', 1, NULL, ?)`,
        )
        .run(prodFolderId, prodFolderId, toolsFolderId);

      handle
        .prepare(
          `INSERT OR IGNORE INTO app_comments (name, comment) VALUES
            ('core-api', 'Main REST & webhook service'),
            ('web-storefront', 'Next.js customer portal'),
            ('analytics-ui', 'Plausible / Metabase container')`,
        )
        .run();

      handle
        .prepare(
          `INSERT OR IGNORE INTO redirects (domain, source_path, target_url, code, match_mode)
           VALUES ('shopdemo.co.tz', '/old-checkout', 'https://shopdemo.co.tz/checkout', 301, 'exact')`,
        )
        .run();

      handle
        .prepare(
          `INSERT OR IGNORE INTO backup_jobs (schedule, includes, last_run_at, last_status)
           VALUES ('0 3 * * *', '/srv/apps,/etc/vps-panel,/var/lib/vps-panel', datetime('now', '-6 hours'), 'ok')`,
        )
        .run();

      handle
        .prepare(
          `INSERT OR IGNORE INTO notifications (channel, target, events)
           VALUES ('webhook', 'https://hooks.example.com/ops-alerts', 'backup.fail,ssl.expiring,network.offline')`,
        )
        .run();

      const devPerms = JSON.stringify({
        modules: ["apps", "domains", "databases", "files", "logs"],
        scopes: {
          apps: ["core-api", "web-storefront"],
          domains: ["paixpanel.local"],
          databases: ["app_prod"],
        },
      });
      handle
        .prepare(
          `INSERT OR IGNORE INTO users
            (email, display_name, password_hash, role, permissions_json, google_enabled, is_active)
           VALUES
            ('ops@paixpanel.local', 'Server Admin', '!google-oauth-only!', 'admin', '{"modules":[]}', 1, 1),
            ('dev@paixpanel.local', 'Scoped Developer', '!google-oauth-only!', 'user', ?, 1, 1)`,
        )
        .run(devPerms);
    });
    tx();
  }

  const pkgSeeded = handle
    .prepare(`SELECT value FROM settings WHERE key = 'panel.preview_packages_seeded'`)
    .get() as { value: string } | undefined;
  if (!pkgSeeded) {
    const pkgTx = handle.transaction(() => {
      handle
        .prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`)
        .run("panel.preview_packages_seeded", "1");

      const insertPkg = handle.prepare(
        `INSERT OR IGNORE INTO service_packages
          (name, slug, kind, description, cpu_cores, ram_mb, storage_gb, swap_mb,
           bandwidth_gb, port_speed_mbps, max_domains, max_subdomains, max_apps,
           max_databases, max_mailboxes, mailbox_quota_mb, max_ftp_accounts,
           backup_slots, ssh_access, ssl_included, dedicated_ip, price_label, billing_cycle, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      );

      insertPkg.run(
        "VPS Nano",
        "vps-nano",
        "vps",
        "Entry virtual server with SSH + free Paix Panel or BYO panel option.",
        0.5,
        1024,
        40,
        512,
        1000,
        1000,
        10,
        50,
        10,
        10,
        20,
        2048,
        10,
        5,
        1,
        1,
        1,
        "$9 / mo",
        "monthly",
      );
      insertPkg.run(
        "VPS Standard",
        "vps-standard",
        "vps",
        "Balanced compute node for full-stack apps, databases, mail & custom control panels.",
        1,
        2048,
        80,
        1024,
        3000,
        1000,
        0,
        0,
        0,
        0,
        0,
        5120,
        0,
        10,
        1,
        1,
        1,
        "$18 / mo",
        "monthly",
      );
      insertPkg.run(
        "VPS Performance",
        "vps-performance",
        "vps",
        "High-memory VPS for cPanel/WHM, aaPanel, CyberPanel, or heavy Docker workloads.",
        2,
        4096,
        120,
        2048,
        0,
        10000,
        0,
        0,
        0,
        0,
        0,
        10240,
        0,
        20,
        1,
        1,
        1,
        "$35 / mo",
        "monthly",
      );
      insertPkg.run(
        "Web Hosting Basic",
        "hosting-basic",
        "hosting",
        "Essential web hosting with domains, SSL, File Manager, MariaDB/PostgreSQL & email.",
        0.25,
        256,
        20,
        0,
        500,
        1000,
        2,
        10,
        3,
        4,
        10,
        1024,
        3,
        3,
        0,
        1,
        0,
        "$4 / mo",
        "monthly",
      );
      insertPkg.run(
        "Web Hosting Business",
        "hosting-business",
        "hosting",
        "Multi-domain hosting with SSH terminal, generous NVMe storage, unlimited email & backups.",
        0.5,
        512,
        50,
        0,
        2000,
        1000,
        10,
        50,
        10,
        15,
        50,
        2048,
        10,
        7,
        1,
        1,
        0,
        "$12 / mo",
        "monthly",
      );

      const vpsPerms = JSON.stringify({
        modules: [
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
        ],
        scopes: {},
      });
      const hostingPerms = JSON.stringify({
        modules: ["apps", "domains", "databases", "mail", "files", "backups", "cron", "logs"],
        scopes: { domains: ["shopdemo.co.tz"] },
      });

      handle
        .prepare(
          `INSERT OR IGNORE INTO users
            (email, display_name, password_hash, role, permissions_json, google_enabled, is_active)
           VALUES
            ('vps1@paixpanel.local', 'Juma Hassan (VPS Admin)', '!google-oauth-only!', 'vps_admin', ?, 1, 1),
            ('host1@paixpanel.local', 'Amina Shop (Hosting Admin)', '!google-oauth-only!', 'hosting_admin', ?, 1, 1)`,
        )
        .run(vpsPerms, hostingPerms);

      const vpsUser = handle
        .prepare(`SELECT id FROM users WHERE email = 'vps1@paixpanel.local'`)
        .get() as { id: number } | undefined;
      const hostUser = handle
        .prepare(`SELECT id FROM users WHERE email = 'host1@paixpanel.local'`)
        .get() as { id: number } | undefined;
      const nanoPkg = handle
        .prepare(`SELECT * FROM service_packages WHERE slug = 'vps-nano'`)
        .get() as { id: number; cpu_cores: number; ram_mb: number; storage_gb: number; bandwidth_gb: number } | undefined;
      const basicHostPkg = handle
        .prepare(`SELECT * FROM service_packages WHERE slug = 'hosting-basic'`)
        .get() as {
        id: number;
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
      } | undefined;

      if (vpsUser && nanoPkg) {
        handle
          .prepare(
            `INSERT OR IGNORE INTO vps_instances
              (name, user_id, package_id, status, ssh_ip, ssh_port, ssh_user, linux_user,
               os_template, panel_choice, cpu_cores, ram_mb, storage_gb, bandwidth_gb,
               storage_used_mb, bandwidth_used_gb, notes)
             VALUES (?, ?, ?, 'active', '203.0.113.42', 22, 'vps_alpha', 'vps_alpha',
                     'Ubuntu 24.04 LTS', 'paix', ?, ?, ?, ?, 6420, 48.5,
                     'Demo VPS using Paix Panel Free with full SSH access')`,
          )
          .run(
            "vps-alpha.paixpanel.local",
            vpsUser.id,
            nanoPkg.id,
            nanoPkg.cpu_cores,
            nanoPkg.ram_mb,
            nanoPkg.storage_gb,
            nanoPkg.bandwidth_gb,
          );
      }

      if (hostUser && basicHostPkg) {
        handle
          .prepare(
            `INSERT OR IGNORE INTO hosting_accounts
              (label, domain, user_id, package_id, status, root_dir, linux_user,
               cpu_cores, ram_mb, storage_gb, bandwidth_gb, max_domains, max_subdomains,
               max_apps, max_databases, max_mailboxes, max_ftp_accounts, backup_slots,
               ssh_access, ssl_included, notes)
             VALUES (?, ?, ?, ?, 'active', '/var/www/shopdemo.co.tz', 'shopdemo',
                     ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                     'Starter hosting account with full hosting admin roles')`,
          )
          .run(
            "ShopDemo Store",
            "shopdemo.co.tz",
            hostUser.id,
            basicHostPkg.id,
            basicHostPkg.cpu_cores,
            basicHostPkg.ram_mb,
            basicHostPkg.storage_gb,
            basicHostPkg.bandwidth_gb,
            basicHostPkg.max_domains,
            basicHostPkg.max_subdomains,
            basicHostPkg.max_apps,
            basicHostPkg.max_databases,
            basicHostPkg.max_mailboxes,
            basicHostPkg.max_ftp_accounts,
            basicHostPkg.backup_slots,
            basicHostPkg.ssh_access,
            basicHostPkg.ssl_included,
          );
      }
    });
    pkgTx();
  }
}
