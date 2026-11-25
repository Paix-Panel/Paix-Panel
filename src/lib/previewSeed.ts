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
  if (alreadySeeded) return;

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
  });

  tx();
}
