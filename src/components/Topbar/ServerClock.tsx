"use client";

import { useEffect, useMemo, useState } from "react";
import { usePanelTimezone } from "@/components/TimezoneSync/TimezoneContext";
import styles from "./Topbar.module.css";

/**
 * Live wall-clock for the server, rendered in the browser's detected
 * timezone by default (`auto`) or an operator-chosen zone in /settings.
 */
export default function ServerClock({
  initialServerMs,
  timezone,
}: {
  initialServerMs: number;
  timezone: string;
}) {
  const { timezone: ctxTimezone } = usePanelTimezone();
  const [now, setNow] = useState<Date | null>(null);
  const activeTimezone = timezone === "auto" ? ctxTimezone : timezone;

  const fmts = useMemo(
    () => ({
      time: new Intl.DateTimeFormat("en-GB", {
        timeZone: activeTimezone,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }),
      date: new Intl.DateTimeFormat("en-GB", {
        timeZone: activeTimezone,
        weekday: "short",
        day: "numeric",
        month: "short",
      }),
      zone: new Intl.DateTimeFormat("en-GB", {
        timeZone: activeTimezone,
        timeZoneName: "short",
      }),
    }),
    [activeTimezone],
  );

  useEffect(() => {
    const offset = initialServerMs - Date.now();
    const tick = () => setNow(new Date(Date.now() + offset));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [initialServerMs]);

  if (!now) return <span className={styles.serverClock} aria-hidden />;

  const zone = zoneAbbr(fmts.zone, now);
  return (
    <span
      className={styles.serverClock}
      title={`Local time (${activeTimezone} · ${zone})`}
    >
      <span className={styles.serverClockDate}>{fmts.date.format(now)}</span>
      <span className={styles.serverClockTime}>{fmts.time.format(now)}</span>
      <span className={styles.serverClockZone}>{zone}</span>
    </span>
  );
}

function zoneAbbr(fmt: Intl.DateTimeFormat, d: Date): string {
  const parts = fmt.formatToParts(d);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
}
