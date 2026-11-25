# Walkthrough & Audit Report

## Implemented Features

1. **Browser-Location Timezone (`auto` default)**:
   - Panel timezone now defaults to `"auto"` instead of UTC or a hardcoded region.
   - `TimezoneProvider` resolves the operator's browser timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) and syncs it via the `paix_tz` cookie so server components, audit logs, task logs, backups, fail2ban timestamps, mail delivery tracking, Webmail dates, and SSH logs all format in the operator's local time automatically.
   - Operators can still override to any specific IANA timezone (e.g. `Africa/Dar_es_Salaam`, `Africa/Nairobi`, etc.) or switch back to Auto in `/settings`.

2. **Mail Panel Upgrade & Built-in Webmail (`/mailboxes/webmail`)**:
   - Removed the Roundcube-only blocker on `/mailboxes` while keeping Roundcube as an optional secondary link when configured.
   - Added a Mail Domains overview card on `/mailboxes` plus direct **Open Webmail** buttons per mailbox and in the header.
   - Implemented Rust agent Maildir + `/usr/sbin/sendmail` endpoints (`agent/src/handlers/webmail.rs`) supporting `INBOX`, `Sent`, `Drafts`, `Junk`, and `Trash` folders, MIME/RFC-2047 decoding, search, read/unread/flag/move/delete actions, and outbound delivery without external Webmail setup blockers.

3. **Security & SSH Intrusion Monitor (`/security`)**:
   - Implemented `agent/src/handlers/security.rs` (`GET /security/overview`, `POST /security/ban-ip`, `POST /security/unban-ip`) combining `sshd` config, UFW status, Fail2ban jails, root authorized keys count, active `who -u` SSH sessions, and parsed + raw `journalctl` / `/var/log/auth.log` SSH logs.
   - Added `/security` dashboard with alert severity banner, security posture summary cards, active sessions table, attacker IP aggregation with 1-click Fail2ban + UFW Ban/Unban controls, and filterable structured/raw SSH logs.

4. **High-Traffic Scale, Speed & Massive Storage Addons (`/scale`)**:
   - Hardened `agent/src/handlers/quick_install.rs` with `DPkg::Lock::Timeout=120` and non-interactive `dpkg` conflict protection on `apt-get` steps so one-click installs do not fail on transient background package locks.
   - Added 6 one-click high-speed & massive-data addons: **Valkey** (in-memory cache, `:6380`), **Memcached** (multi-threaded RAM cache, `:11211`), **MinIO S3** (S3-compatible object storage, `:9000` API / `:9001` Console with multi-port bind preservation), **ClickHouse** (columnar big-data analytics, `:8123` / `:9004`), **Meilisearch** (sub-50ms full-text search, `:7700`), and **K3s** (lightweight CNCF Kubernetes cluster with `--disable traefik` so Nginx stays on ports 80/443).
   - Added `agent/src/handlers/scale.rs` (`GET /scale/status`, `POST /scale/apply`) and `/scale` UI (`ScaleClient.tsx`) for one-click **TCP BBR + 65k Socket Backlog**, **Nginx Shared Proxy Micro-Cache (`paix_cache`)**, and adaptive **MariaDB / PostgreSQL High-Throughput** buffer tuning.

# Security Summary

## 1. Payment, Billing, License-Claim & Hidden Telemetry Audit
- Audited the entire repository (`src/`, `agent/`, `scripts/`, `install.sh`, `update.sh`, `package.json`) and ran `bun audit` (exit code `0`, 178 packages checked, 0 known advisories).
- **Result: Clean.** No payment, subscription, license-claim, crypto-miner, monetization, analytics, or hidden tracking scripts exist anywhere in the codebase:
  - `NEXT_TELEMETRY_DISABLED=1` is explicitly configured in `install.sh`, `update.sh`, and systemd templates.
  - No Stripe/PayPal/billing SDKs or payment webhooks exist.
  - Matches for `"claim"` in `src/` are strictly limited to `claimInvite` in `src/lib/networks/store.ts` (multi-server network peering token exchange) and JWT payload documentation comments in `src/lib/auth.ts`.
  - Outbound HTTP calls in the codebase are exclusively operator-initiated infrastructure actions (GitHub self-update check, Let's Encrypt ACME / certbot, Cloudflare/PowerDNS APIs, Let's Encrypt / Rspamd / Docker Hub quick-install pulls, and operator-configured notification webhooks).

## 2. Security Controls Applied to New Code
- **Authentication & Authorization**: Every new Server Action (`src/server-actions/webmail.ts`, `src/server-actions/security.ts`, `src/server-actions/scale.ts`) calls `requireAdmin()`, and `/mailboxes/webmail`, `/security`, and `/scale` verify `s.role === "admin"`.
- **Webmail Maildir & Header Safety**:
  - `verify_mailbox_root()` verifies the mailbox exists in MariaDB `virtual_users` and normalizes local/domain segments via `mailbox_parts()` to block path traversal.
  - `validate_message_id()` and `normalize_folder()` reject `.`, `/`, `\`, `..`, and `\0`.
  - Outbound `send_message()` strips `\r`/`\n` from headers (`sanitize_header_value`), validates recipient syntax, executes `/usr/sbin/sendmail` directly with argv arrays (no shell interpolation), and saves Maildir files owned by `vmail`.
  - HTML email bodies in `WebmailClient.tsx` render exclusively inside `<iframe sandbox="" srcDoc={...} />` with an empty `sandbox` attribute (scripts, forms, and same-origin access disabled; zero `dangerouslySetInnerHTML`).
- **SSH Security Monitor Safety**:
  - `ban_ip` and `unban_ip` parse targets strictly as `std::net::IpAddr` and `node:net` `isIP()`, reject loopback/unspecified addresses, and invoke `fail2ban-client` and `ufw` directly via argv arrays without `sh -c`.
- **Scale & Addon Credential / Config Safety**:
  - Dynamically generates random cryptographic secrets via CSPRNG for MinIO (`MINIO_ROOT_PASSWORD`) and Meilisearch (`MEILI_MASTER_KEY`), masking secret args in task logs (`loggable_arg`) and defaulting container ports to `127.0.0.1` loopback.
  - All kernel/Nginx/MariaDB/PostgreSQL tuning drop-ins write atomically (`fs_atomic::write`) and validate via `nginx -t` / `systemctl restart` + `postgres_is_ready()` with automatic rollback on failure.
