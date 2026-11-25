"use client";

import { useEffect, useState } from "react";
import { usePanelTimezone } from "@/components/TimezoneSync/TimezoneContext";

/**
 * Parse timestamps emitted across the panel & Linux tools:
 * - RFC3339 / ISO (`2026-05-28T10:02:31Z`)
 * - SQLite UTC (`2026-05-28 10:02:31`)
 * - journalctl short-iso (`2026-10-11T14:11:03+0200` / `-0500`)
 */
export function parsePanelTimestamp(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  // SQLite `datetime('now')` without timezone is always UTC.
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(s)) {
    const d = new Date(s.replace(" ", "T") + "Z");
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // journalctl short-iso uses `+0200` without colon; normalize to `+02:00`.
  const normalized = s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatTimestampInTz(
  raw: string | null | undefined,
  timezone: string,
  mode: "datetime" | "date" | "time" | "short" = "datetime",
): string {
  if (!raw) return "-";
  const d = parsePanelTimestamp(raw);
  if (!d) return raw;
  try {
    if (mode === "date") {
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(d);
    }
    if (mode === "time") {
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(d);
    }
    if (mode === "short") {
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(d);
    }
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return raw;
  }
}

export default function LocalTime({
  value,
  mode = "datetime",
  fallback = "-",
  className,
}: {
  value: string | null | undefined;
  mode?: "datetime" | "date" | "time" | "short";
  fallback?: string;
  className?: string;
}) {
  const { timezone } = usePanelTimezone();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!value) {
    return <span className={className}>{fallback}</span>;
  }

  const formatted = mounted
    ? formatTimestampInTz(value, timezone, mode)
    : formatTimestampInTz(value, timezone || "UTC", mode);

  return (
    <time
      dateTime={value}
      className={className}
      style={{ fontVariantNumeric: "tabular-nums" }}
      title={mounted ? `${formatted} (${timezone})` : value}
    >
      {formatted}
    </time>
  );
}
