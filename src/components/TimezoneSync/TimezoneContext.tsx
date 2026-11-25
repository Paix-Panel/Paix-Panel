"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type TimezoneCtx = {
  /** Saved setting: "auto" or an explicit IANA name like "Africa/Dar_es_Salaam". */
  mode: string;
  /** Resolved IANA zone currently active in the browser. */
  timezone: string;
};

const Context = createContext<TimezoneCtx>({
  mode: "auto",
  timezone: "UTC",
});

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      try {
        return decodeURIComponent(trimmed.slice(prefix.length));
      } catch {
        return trimmed.slice(prefix.length);
      }
    }
  }
  return null;
}

export function detectBrowserTimezone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz) return null;
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

export function TimezoneProvider({
  mode,
  initialTimezone,
  children,
}: {
  mode: string;
  initialTimezone: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [resolved, setResolved] = useState<string>(initialTimezone || "UTC");

  useEffect(() => {
    const browserTz = detectBrowserTimezone();
    if (browserTz) {
      const prevCookie = readCookie("paix_tz");
      if (prevCookie !== browserTz) {
        document.cookie = `paix_tz=${encodeURIComponent(browserTz)}; path=/; max-age=31536000; SameSite=Lax`;
        if (mode === "auto") {
          router.refresh();
        }
      }
    }
    if (mode === "auto") {
      setResolved(browserTz ?? (initialTimezone || "UTC"));
    } else {
      setResolved(mode);
    }
  }, [mode, initialTimezone, router]);

  return (
    <Context.Provider value={{ mode, timezone: resolved }}>
      {children}
    </Context.Provider>
  );
}

export function usePanelTimezone(): TimezoneCtx {
  return useContext(Context);
}
