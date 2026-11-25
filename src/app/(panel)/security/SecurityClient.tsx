"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { SecurityOverview, SshLogEvent } from "@/lib/agent";
import LocalTime from "@/components/LocalTime/LocalTime";
import StatusBadge from "@/components/StatusBadge/StatusBadge";
import styles from "@/components/page.module.css";
import {
  banIpSecurityAction,
  fetchSecurityOverviewAction,
  unbanIpSecurityAction,
} from "@/server-actions/security";
import sec from "./security.module.css";

type Props = {
  initial: SecurityOverview | null;
  initialError?: string | null;
};

type LogFilter = "all" | "failed" | "invalid" | "accepted";

function isFailedType(t: string): boolean {
  return (
    t === "failed_password" ||
    t === "invalid_user" ||
    t === "auth_failure" ||
    t === "preauth_closed"
  );
}

function eventTone(t: string): "ok" | "warn" | "danger" | "info" | "muted" {
  switch (t) {
    case "accepted_publickey":
    case "accepted_password":
      return "ok";
    case "invalid_user":
    case "failed_password":
    case "auth_failure":
      return "danger";
    case "preauth_closed":
      return "warn";
    default:
      return "muted";
  }
}

function eventLabel(t: string): string {
  switch (t) {
    case "accepted_publickey":
      return "accepted (key)";
    case "accepted_password":
      return "accepted (password)";
    case "failed_password":
      return "failed login";
    case "invalid_user":
      return "invalid user";
    case "auth_failure":
      return "auth failure";
    case "preauth_closed":
      return "preauth closed";
    case "disconnected":
      return "disconnected";
    default:
      return "sshd";
  }
}

export default function SecurityClient({ initial, initialError = null }: Props) {
  const [data, setData] = useState<SecurityOverview | null>(initial);
  const [lineLimit, setLineLimit] = useState<number>(300);
  const [filter, setFilter] = useState<LogFilter>("all");
  const [query, setQuery] = useState("");
  const [rawView, setRawView] = useState(false);
  const [manualIp, setManualIp] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function refresh(lines = lineLimit) {
    setError(null);
    startTransition(async () => {
      const res = await fetchSecurityOverviewAction(lines);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.data) setData(res.data);
    });
  }

  function onBanIp(ip: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await banIpSecurityAction(ip);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNotice(`Banned ${ip} in Fail2ban (sshd) & UFW.`);
      setManualIp("");
      const ov = await fetchSecurityOverviewAction(lineLimit);
      if (ov.ok && ov.data) setData(ov.data);
    });
  }

  function onUnbanIp(ip: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await unbanIpSecurityAction(ip);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNotice(`Unbanned ${ip}.`);
      const ov = await fetchSecurityOverviewAction(lineLimit);
      if (ov.ok && ov.data) setData(ov.data);
    });
  }

  const filteredLogs = useMemo(() => {
    if (!data) return [] as SshLogEvent[];
    const needle = query.trim().toLowerCase();
    return data.logs.filter((ev) => {
      if (filter === "failed" && !isFailedType(ev.event_type)) return false;
      if (filter === "invalid" && ev.event_type !== "invalid_user") return false;
      if (
        filter === "accepted" &&
        ev.event_type !== "accepted_publickey" &&
        ev.event_type !== "accepted_password"
      ) {
        return false;
      }
      if (needle) {
        const hay = `${ev.timestamp} ${ev.event_type} ${ev.user ?? ""} ${ev.ip ?? ""} ${ev.raw}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [data, filter, query]);

  const alertTone =
    data?.alert_level === "critical"
      ? "danger"
      : data?.alert_level === "elevated"
        ? "warn"
        : "ok";

  return (
    <div>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Security &amp; SSH Monitor</h1>
          <div className={styles.subtitle}>
            Live SSH intrusion detection, complete SSH authentication logs, active sessions, and IP bans.
          </div>
        </div>
        <div className={styles.actions}>
          <select
            className={styles.select}
            value={lineLimit}
            onChange={(e) => {
              const next = Number(e.target.value);
              setLineLimit(next);
              refresh(next);
            }}
            disabled={isPending}
            aria-label="Log history depth"
          >
            <option value={100}>Last 100 lines</option>
            <option value={300}>Last 300 lines</option>
            <option value={600}>Last 600 lines</option>
            <option value={1000}>Last 1000 lines</option>
          </select>
          <button
            type="button"
            className={styles.btn}
            onClick={() => refresh(lineLimit)}
            disabled={isPending}
          >
            {isPending ? "Refreshing..." : "Refresh"}
          </button>
          <Link href="/firewall" className={styles.btnGhost} style={{ textDecoration: "none" }}>
            Firewall &amp; jails
          </Link>
          <Link href="/ssh-keys" className={styles.btnGhost} style={{ textDecoration: "none" }}>
            SSH keys
          </Link>
          <Link href="/settings?tab=server#ssh-server" className={styles.btnGhost} style={{ textDecoration: "none" }}>
            SSH settings
          </Link>
        </div>
      </div>

      {error && (
        <div role="alert" className={styles.error}>
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className={styles.notice}>
          {notice}
        </div>
      )}

      {!data ? (
        <div className={styles.section}>
          <div className={styles.empty}>
            Could not load SSH &amp; security telemetry from the server agent.
          </div>
        </div>
      ) : (
        <>
          <div className={sec.alertBanner}>
            <div className={sec.alertHeader}>
              <div className={sec.alertTitle}>
                <span>Security status</span>
                <StatusBadge
                  text={data.alert_level.toUpperCase()}
                  tone={alertTone}
                />
              </div>
              <span className={styles.muted} style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
                {data.stats.total_events} SSH events inspected · {data.stats.unique_attacker_ips} source IP(s) with failed attempts
              </span>
            </div>
            {data.alerts.length === 0 ? (
              <div className={styles.muted} style={{ fontSize: 13 }}>
                No active SSH brute-force alerts or firewall exposure warnings detected in the inspected logs.
              </div>
            ) : (
              <ul className={sec.alertList}>
                {data.alerts.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            )}
          </div>

          <div className={sec.postureGrid}>
            <div className={sec.statCard}>
              <div className={sec.statLabel}>SSH daemon</div>
              <div className={sec.statValue}>Port {data.posture.ssh_port}</div>
              <div className={sec.statHint}>
                Idle timeout: {data.posture.idle_timeout_minutes > 0 ? `${data.posture.idle_timeout_minutes}m` : "none"}
              </div>
            </div>

            <div className={sec.statCard}>
              <div className={sec.statLabel}>SSH authentication</div>
              <div className={sec.statValue}>
                <StatusBadge
                  text={data.posture.password_auth ? "Password ON" : "Keys only"}
                  tone={data.posture.password_auth ? "warn" : "ok"}
                />
              </div>
              <div className={sec.statHint}>
                PermitRootLogin: <span className={styles.code}>{data.posture.permit_root_login}</span> · {data.posture.root_authorized_keys} root key(s)
              </div>
            </div>

            <div className={sec.statCard}>
              <div className={sec.statLabel}>UFW firewall</div>
              <div className={sec.statValue}>
                <StatusBadge
                  text={data.posture.ufw_enabled ? "Active" : "Inactive"}
                  tone={data.posture.ufw_enabled ? "ok" : "danger"}
                />
              </div>
              <div className={sec.statHint}>{data.posture.ufw_rules_count} queued/active rule(s)</div>
            </div>

            <div className={sec.statCard}>
              <div className={sec.statLabel}>Fail2ban (sshd)</div>
              <div className={sec.statValue}>
                <StatusBadge
                  text={data.posture.fail2ban_active ? "Active" : "Stopped"}
                  tone={data.posture.fail2ban_active ? "ok" : "danger"}
                />
              </div>
              <div className={sec.statHint}>
                {data.posture.sshd_banned_ips.length} banned IP(s) · {data.posture.sshd_total_failed} total failed
              </div>
            </div>

            <div className={sec.statCard}>
              <div className={sec.statLabel}>Recent SSH attempts</div>
              <div className={sec.statValue}>{data.stats.failed_count} failed</div>
              <div className={sec.statHint}>
                {data.stats.invalid_user_count} invalid user · {data.stats.accepted_count} accepted
              </div>
            </div>
          </div>

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>
              Active SSH sessions ({data.active_sessions.length})
            </h2>
            {data.active_sessions.length === 0 ? (
              <div className={styles.empty}>No interactive SSH sessions currently logged in.</div>
            ) : (
              <div className={sec.tableWrap}>
                <table className={sec.table}>
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Source IP</th>
                      <th>TTY</th>
                      <th>Logged in</th>
                      <th>Idle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.active_sessions.map((s, idx) => (
                      <tr key={`${s.user}-${s.tty}-${idx}`}>
                        <td><span className={styles.code}>{s.user}</span></td>
                        <td><span className={styles.code}>{s.source_ip}</span></td>
                        <td><span className={styles.muted}>{s.tty}</span></td>
                        <td className={sec.numCell}>
                          <LocalTime value={s.since} mode="short" fallback={s.since} />
                        </td>
                        <td className={sec.numCell}>{s.idle}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>
              Suspicious IPs &amp; SSH attackers ({data.attackers.length})
            </h2>
            <form
              className={sec.banForm}
              onSubmit={(e) => {
                e.preventDefault();
                if (manualIp.trim()) onBanIp(manualIp.trim());
              }}
            >
              <label className={styles.field}>
                Block an IP address manually (Fail2ban + UFW)
                <input
                  className={styles.input}
                  placeholder="e.g. 203.0.113.45"
                  value={manualIp}
                  onChange={(e) => setManualIp(e.target.value)}
                  disabled={isPending}
                />
              </label>
              <button
                type="submit"
                className={styles.btnDanger}
                disabled={isPending || !manualIp.trim()}
              >
                Ban IP
              </button>
            </form>

            {data.attackers.length === 0 ? (
              <div className={styles.empty}>
                No failed or accepted SSH IP activity found in the inspected window.
              </div>
            ) : (
              <div className={sec.tableWrap}>
                <table className={sec.table}>
                  <thead>
                    <tr>
                      <th>IP address</th>
                      <th>Failed</th>
                      <th>Invalid user</th>
                      <th>Accepted</th>
                      <th>Usernames targeted</th>
                      <th>Last seen</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.attackers.map((a) => (
                      <tr key={a.ip}>
                        <td><span className={styles.code}>{a.ip}</span></td>
                        <td className={sec.numCell}>
                          <strong style={{ color: a.failed_attempts > 0 ? "var(--danger)" : "var(--text)" }}>
                            {a.failed_attempts}
                          </strong>
                        </td>
                        <td className={sec.numCell}>{a.invalid_user_attempts}</td>
                        <td className={sec.numCell}>{a.accepted_attempts}</td>
                        <td>
                          {a.usernames.length > 0 ? (
                            <span className={styles.muted}>{a.usernames.join(", ")}</span>
                          ) : (
                            <span className={styles.muted}>—</span>
                          )}
                        </td>
                        <td className={sec.numCell}>
                          <LocalTime value={a.last_seen} mode="short" fallback={a.last_seen} />
                        </td>
                        <td>
                          <StatusBadge
                            text={a.banned ? "banned" : a.failed_attempts > 0 ? "unbanned" : "allowed"}
                            tone={a.banned ? "danger" : a.failed_attempts > 0 ? "warn" : "ok"}
                          />
                        </td>
                        <td>
                          {a.banned ? (
                            <button
                              type="button"
                              className={styles.btnGhost}
                              onClick={() => onUnbanIp(a.ip)}
                              disabled={isPending}
                            >
                              Unban
                            </button>
                          ) : (
                            <button
                              type="button"
                              className={styles.btnDanger}
                              onClick={() => onBanIp(a.ip)}
                              disabled={isPending}
                            >
                              Ban IP
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className={styles.section}>
            <div className={sec.controlsBar}>
              <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
                Complete SSH logs ({filteredLogs.length})
              </h2>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => setRawView((v) => !v)}
              >
                {rawView ? "Show structured table" : "Show raw journal / auth.log"}
              </button>
            </div>

            <div className={sec.controlsBar}>
              <div className={sec.tabs}>
                <button
                  type="button"
                  className={[sec.tabBtn, filter === "all" ? sec.tabBtnActive : ""].join(" ").trim()}
                  onClick={() => setFilter("all")}
                >
                  All ({data.logs.length})
                </button>
                <button
                  type="button"
                  className={[sec.tabBtn, filter === "failed" ? sec.tabBtnActive : ""].join(" ").trim()}
                  onClick={() => setFilter("failed")}
                >
                  Failed &amp; suspicious ({data.stats.failed_count})
                </button>
                <button
                  type="button"
                  className={[sec.tabBtn, filter === "invalid" ? sec.tabBtnActive : ""].join(" ").trim()}
                  onClick={() => setFilter("invalid")}
                >
                  Invalid users ({data.stats.invalid_user_count})
                </button>
                <button
                  type="button"
                  className={[sec.tabBtn, filter === "accepted" ? sec.tabBtnActive : ""].join(" ").trim()}
                  onClick={() => setFilter("accepted")}
                >
                  Accepted ({data.stats.accepted_count})
                </button>
              </div>
              <div className={sec.filterRight}>
                <input
                  type="search"
                  className={styles.input}
                  placeholder="Filter by IP, username, or text..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Filter SSH logs"
                />
              </div>
            </div>

            {filteredLogs.length === 0 ? (
              <div className={styles.empty}>No SSH log entries match the current filter.</div>
            ) : rawView ? (
              <pre className={styles.log}>
                {filteredLogs.map((l) => l.raw).join("\n")}
              </pre>
            ) : (
              <div className={sec.tableWrap}>
                <table className={sec.table}>
                  <thead>
                    <tr>
                      <th>Time (local)</th>
                      <th>Event</th>
                      <th>User</th>
                      <th>Source IP</th>
                      <th>Port</th>
                      <th>Raw entry</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map((ev, idx) => (
                      <tr key={`${ev.timestamp}-${idx}`}>
                        <td className={sec.numCell}>
                          <LocalTime value={ev.timestamp} mode="datetime" fallback={ev.timestamp || "—"} />
                        </td>
                        <td>
                          <StatusBadge
                            text={eventLabel(ev.event_type)}
                            tone={eventTone(ev.event_type)}
                          />
                        </td>
                        <td>
                          {ev.user ? (
                            <span className={styles.code}>{ev.user}</span>
                          ) : (
                            <span className={styles.muted}>—</span>
                          )}
                        </td>
                        <td>
                          {ev.ip ? (
                            <span className={styles.code}>{ev.ip}</span>
                          ) : (
                            <span className={styles.muted}>—</span>
                          )}
                        </td>
                        <td className={sec.numCell}>
                          {ev.port ?? <span className={styles.muted}>—</span>}
                        </td>
                        <td>
                          <div className={sec.rawDetail}>{ev.raw}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
