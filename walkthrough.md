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

# Security Summary

## 1. Payment, Billing, License-Claim & Hidden Telemetry Audit
- Audited the entire repository (`src/`, `agent/`, `scripts/`, `install.sh`, `update.sh`, `package.json`) and ran `bun audit` (exit code `0`, 178 packages checked, 0 known advisories).
- **Result: Clean.** No payment, subscription, license-claim, crypto-miner, monetization, analytics, or hidden tracking scripts exist anywhere in the codebase:
  - `NEXT_TELEMETRY_DISABLED=1` is explicitly configured in `install.sh`, `update.sh`, and systemd templates.
  - No Stripe/PayPal/billing SDKs or payment webhooks exist.
  - Matches for `"claim"` in `src/` are strictly limited to `claimInvite` in `src/lib/networks/store.ts` (multi-server network peering token exchange) and JWT payload documentation comments in `src/lib/auth.ts`.
  - Outbound HTTP calls in the codebase are exclusively operator-initiated infrastructure actions (GitHub self-update check, Let's Encrypt ACME / certbot, Cloudflare/PowerDNS APIs, Let's Encrypt / Rspamd / Docker Hub quick-install pulls, and operator-configured notification webhooks).

## 2. Security Controls Applied to New Code
- **Authentication & Authorization**: Every new Server Action (`src/server-actions/webmail.ts`, `src/server-actions/security.ts`) calls `requireAdmin()`, and both `/mailboxes/webmail` and `/security` verify `s.role === "admin"`.
- **Webmail Maildir & Header Safety**:
  - `verify_mailbox_root()` verifies the mailbox exists in MariaDB `virtual_users` and normalizes local/domain segments via `mailbox_parts()` to block path traversal.
  - `validate_message_id()` and `normalize_folder()` reject `.`, `/`, `\`, `..`, and `\0`.
  - Outbound `send_message()` strips `\r`/`\n` from headers (`sanitize_header_value`), validates recipient syntax, executes `/usr/sbin/sendmail` directly with argv arrays (no shell interpolation), and saves Maildir files owned by `vmail`.
  - HTML email bodies in `WebmailClient.tsx` render exclusively inside `<iframe sandbox="" srcDoc={...} />` with an empty `sandbox` attribute (scripts, forms, and same-origin access disabled; zero `dangerouslySetInnerHTML`).
- **SSH Security Monitor Safety**:
  - `ban_ip` and `unban_ip` parse targets strictly as `std::net::IpAddr` and `node:net` `isIP()`, reject loopback/unspecified addresses, and invoke `fail2ban-client` and `ufw` directly via argv arrays without `sh -c`.
