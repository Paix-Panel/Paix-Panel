import Link from "next/link";
import { requireSession } from "@/lib/auth";
import {
  listAuditDays,
  listAuditForDay,
  resolvePanelTimezone,
  todayInTz,
} from "@/lib/audit";
import Table from "@/components/Table/Table";
import StatusBadge from "@/components/StatusBadge/StatusBadge";
import LocalTime from "@/components/LocalTime/LocalTime";
import styles from "@/components/page.module.css";
import audit from "./audit.module.css";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function formatLongDate(day: string, tz: string): string {
  // Day is "YYYY-MM-DD" in the configured tz. Render at noon UTC of the same
  // calendar day to dodge DST edge cases when extracting the weekday.
  const d = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: tz,
  });
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  // Every Terminal command is in here word for word (passwords typed on a
  // command line included), with targets and error text: admins only, like
  // the logs and task logs.
  const s = await requireSession();
  if (s.role !== "admin") {
    return (
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Audit log</h1>
          <div className={styles.subtitle}>Only admins can read the audit log.</div>
        </div>
      </div>
    );
  }
  const sp = await searchParams;
  const tz = await resolvePanelTimezone();
  const today = todayInTz(tz);
  const requestedDay = sp.day && DATE_RE.test(sp.day) ? sp.day : null;

  const days = listAuditDays(tz); // newest -> oldest
  const newestWithLogs = days[0] ?? null;
  const oldestWithLogs = days[days.length - 1] ?? null;

  let currentDay = requestedDay ?? newestWithLogs ?? today;
  if (currentDay > today) currentDay = today;

  let prevDay: string | null = null;
  for (const d of days) {
    if (d < currentDay) {
      prevDay = d;
      break;
    }
  }

  let nextDay: string | null = null;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i] > currentDay) {
      nextDay = days[i];
      break;
    }
  }
  if (nextDay && nextDay > today) nextDay = null;

  const rows = listAuditForDay(currentDay, 2000, tz);
  const isToday = currentDay === today;
  const hasLogsThisDay = rows.length > 0;

  return (
    <div>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Audit log</h1>
          <div className={styles.subtitle}>
            Every panel action: who, when, what, result. Times in{" "}
            {tz.replace("_", " ")}.
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <DayNavLink
          href={prevDay ? `/audit?day=${prevDay}` : null}
          disabled={!prevDay}
          label="← Older"
          tooltip={
            prevDay
              ? `Jump to ${prevDay}`
              : oldestWithLogs
                ? `No entries before ${oldestWithLogs}`
                : "No entries"
          }
        />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 220 }}>
          <strong style={{ fontSize: 15 }}>{formatLongDate(currentDay, tz)}</strong>
          <span className={styles.muted} style={{ fontSize: 12 }}>
            {currentDay}
            {isToday ? " · today" : ""}
            {" · "}
            {hasLogsThisDay
              ? `${rows.length} ${rows.length === 1 ? "entry" : "entries"}`
              : "no entries"}
          </span>
        </div>
        <DayNavLink
          href={nextDay ? `/audit?day=${nextDay}` : null}
          disabled={!nextDay}
          label="Newer →"
          tooltip={
            nextDay
              ? `Jump to ${nextDay}`
              : isToday
                ? "Already on today"
                : "No newer entries"
          }
        />
        <div style={{ flex: 1 }} />
        {!isToday && (
          <Link href="/audit" className={styles.btnGhost}>
            Today
          </Link>
        )}
      </div>

      {hasLogsThisDay ? (
        <Table
          scrollX="always"
          columns={[
            { key: "ts", label: "When", width: "180px" },
            { key: "actor", label: "Actor", width: "200px" },
            { key: "action", label: "Action", width: "180px" },
            { key: "target", label: "Target", width: "190px" },
            { key: "result", label: "Result", width: "90px" },
            { key: "msg", label: "Message", width: "420px" },
          ]}
          rows={rows.map((r) => ({
            ts: <LocalTime value={r.ts} className={styles.muted} />,
            actor: renderActor(r.actor_email, r.actor_id),
            action: <span className={styles.code}>{r.action}</span>,
            target: r.target ? (
              <span className={audit.target} title={r.target}>
                {r.target}
              </span>
            ) : (
              "-"
            ),
            result: (
              <StatusBadge
                text={r.result}
                tone={r.result === "ok" ? "ok" : "danger"}
              />
            ),
            msg: r.message ? (
              <span className={audit.msg} title={r.message}>
                {r.message}
              </span>
            ) : (
              "-"
            ),
          }))}
          empty="No audit entries."
        />
      ) : (
        <div className={styles.empty}>
          No audit entries for {currentDay}. Use{" "}
          <strong>← Older</strong> to jump back to the previous day that has
          activity.
        </div>
      )}
    </div>
  );
}

/**
 * Render the Actor cell. We have three states:
 *  - actor_email present → the user who performed the action; show email.
 *  - actor_id present but no email → user row was deleted; show "#<id>"
 *    so log forensics still have something to grep for.
 *  - both null → system-driven event (e.g. a failed login that didn't
 *    match any user, where writeAudit is called with actorId: null);
 *    show "system" in muted text.
 */
function renderActor(actorEmail: string | null, actorId: number | null): React.ReactNode {
  if (actorEmail) return <span className={styles.muted}>{actorEmail}</span>;
  if (actorId != null) {
    return <span className={styles.muted}>#{actorId}</span>;
  }
  return <span className={styles.muted}>system</span>;
}

function DayNavLink({
  href,
  disabled,
  label,
  tooltip,
}: {
  href: string | null;
  disabled: boolean;
  label: string;
  tooltip: string;
}) {
  if (disabled || !href) {
    return (
      <span
        className={styles.btnGhost}
        title={tooltip}
        style={{
          opacity: 0.4,
          cursor: "not-allowed",
        }}
      >
        {label}
      </span>
    );
  }
  return (
    <Link href={href} className={styles.btnGhost} title={tooltip}>
      {label}
    </Link>
  );
}
