"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionResult } from "@/server-actions/auth";
import { useFormActionState } from "@/lib/useFormActionState";
import PasswordInput from "@/components/PasswordInput/PasswordInput";
import styles from "./page.module.css";

type Props = {
  action: (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  defaultEmail?: string;
  defaultPassword?: string;
  googleEnabled?: boolean;
  googleConfigured?: boolean;
};

type OAuthMessage = {
  type?: string;
  redirectTo?: string;
  error?: string;
};

const OAUTH_CHANNEL = "paix_google_oauth";
const OAUTH_STORAGE_KEY = "paix_google_oauth_result";

function isTrustedOrigin(origin: string): boolean {
  if (typeof window === "undefined") return false;
  if (origin === window.location.origin) return true;
  if (
    origin.endsWith(".run.app") ||
    origin.startsWith("http://localhost") ||
    origin.startsWith("http://127.0.0.1")
  ) {
    return true;
  }
  return false;
}

function safeRedirectTarget(raw?: string): string {
  if (typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//")) {
    return raw;
  }
  return "/dashboard";
}

export default function LoginForm({
  action,
  defaultEmail = "",
  defaultPassword = "",
  googleEnabled = false,
  googleConfigured = false,
}: Props) {
  const [state, formAction, pending, formRef] = useFormActionState<ActionResult | null>(action, null);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [googleAuthUrl, setGoogleAuthUrl] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const redirectedRef = useRef(false);

  const preloadGoogleUrl = useCallback(async (rememberMe: boolean) => {
    if (!googleEnabled) {
      setGoogleAuthUrl(null);
      return;
    }
    try {
      const res = await fetch(`/api/auth/google/url?remember=${rememberMe ? "1" : "0"}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setGoogleAuthUrl(null);
        return;
      }
      const data = (await res.json()) as { url?: string };
      setGoogleAuthUrl(data.url ?? null);
    } catch {
      setGoogleAuthUrl(null);
    }
  }, [googleEnabled]);

  useEffect(() => {
    preloadGoogleUrl(remember);
  }, [remember, preloadGoogleUrl]);

  const finishGoogleSuccess = useCallback((redirectTo?: string) => {
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    try {
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }
    } catch {
      // ignore cross-window close errors
    }
    try {
      localStorage.removeItem(OAUTH_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
    setGoogleBusy(false);
    setGoogleError(null);
    window.location.replace(safeRedirectTarget(redirectTo));
  }, []);

  const handleOAuthPayload = useCallback(
    (data: OAuthMessage | null | undefined) => {
      if (!data || typeof data.type !== "string") return;
      if (data.type === "GOOGLE_OAUTH_SUCCESS") {
        finishGoogleSuccess(data.redirectTo);
      } else if (data.type === "GOOGLE_OAUTH_ERROR") {
        setGoogleBusy(false);
        setGoogleError(data.error || "Google sign-in was denied.");
        preloadGoogleUrl(remember);
      }
    },
    [finishGoogleSuccess, preloadGoogleUrl, remember],
  );

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!isTrustedOrigin(event.origin)) return;
      handleOAuthPayload(event.data as OAuthMessage | null);
    };
    window.addEventListener("message", onMessage);

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      try {
        channel = new BroadcastChannel(OAUTH_CHANNEL);
        channel.onmessage = (event) => {
          handleOAuthPayload(event.data as OAuthMessage | null);
        };
      } catch {
        channel = null;
      }
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key !== OAUTH_STORAGE_KEY || !event.newValue) return;
      try {
        const parsed = JSON.parse(event.newValue) as OAuthMessage;
        handleOAuthPayload(parsed);
      } catch {
        // ignore malformed storage payload
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("storage", onStorage);
      if (channel) channel.close();
    };
  }, [handleOAuthPayload]);

  const checkEstablishedSession = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      if (!res.ok) return false;
      const data = (await res.json()) as { authenticated?: boolean; redirectTo?: string };
      if (data.authenticated) {
        finishGoogleSuccess(data.redirectTo);
        return true;
      }
    } catch {
      // ignore transient errors
    }
    return false;
  }, [finishGoogleSuccess]);

  // Verify session if popup closes (handles COOP/blocked postMessage) or window regains focus
  useEffect(() => {
    if (!googleBusy) return;
    let cancelled = false;

    const onFocus = () => {
      if (!cancelled) {
        void checkEstablishedSession();
      }
    };
    window.addEventListener("focus", onFocus);

    let ticks = 0;
    const timer = window.setInterval(async () => {
      ticks += 1;
      if (popupRef.current && popupRef.current.closed) {
        window.clearInterval(timer);
        const ok = await checkEstablishedSession();
        if (!cancelled && !ok) {
          setGoogleBusy(false);
          preloadGoogleUrl(remember);
        }
        return;
      }
      if (ticks % 3 === 0 && !cancelled) {
        const ok = await checkEstablishedSession();
        if (ok) {
          window.clearInterval(timer);
        }
      }
    }, 500);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [googleBusy, checkEstablishedSession, preloadGoogleUrl, remember]);

  const handleGoogleClick = async () => {
    setGoogleError(null);
    redirectedRef.current = false;
    try {
      localStorage.removeItem(OAUTH_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
    if (!googleConfigured || !googleEnabled) {
      setGoogleError(
        "Google Sign-In is not configured yet. Sign in with email & password, then configure Google OAuth under Settings → Security.",
      );
      return;
    }

    let url = googleAuthUrl;
    if (!url) {
      setGoogleBusy(true);
      try {
        const res = await fetch(`/api/auth/google/url?remember=${remember ? "1" : "0"}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || !data.url) {
          setGoogleBusy(false);
          setGoogleError(data.error || "Could not start Google Sign-In.");
          return;
        }
        url = data.url;
      } catch {
        setGoogleBusy(false);
        setGoogleError("Network error preparing Google Sign-In.");
        return;
      }
    }

    const w = 520;
    const h = 640;
    const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - w) / 2));
    const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - h) / 2));
    const popup = window.open(
      url,
      "paix_google_oauth",
      `width=${w},height=${h},left=${left},top=${top},popup=yes,resizable=yes,scrollbars=yes`,
    );
    if (!popup) {
      setGoogleBusy(false);
      setGoogleError("Popup was blocked by your browser. Allow popups for this panel and try again.");
      return;
    }
    popupRef.current = popup;
    setGoogleBusy(true);
    // Single-use nonce: refresh URL in background for next attempt if needed
    setGoogleAuthUrl(null);
  };

  return (
    <div>
      <form ref={formRef} action={formAction} className={styles.form}>
        <label className={styles.label}>
          Email
          <input
            name="email"
            type="email"
            autoComplete="username"
            defaultValue={defaultEmail}
            required
            autoFocus
            className={styles.input}
          />
        </label>
        <label className={styles.label}>
          Password
          <PasswordInput
            name="password"
            autoComplete="current-password"
            defaultValue={defaultPassword}
            visible={showPassword}
            onToggle={() => setShowPassword((v) => !v)}
            className={styles.input}
          />
        </label>
        <label className={styles.rememberRow}>
          <input
            type="checkbox"
            name="remember"
            className={styles.checkbox}
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          <span>Remember me for 30 days</span>
        </label>
        {state && state.ok === false && (
          <div className={styles.error}>{state.error}</div>
        )}
        <button type="submit" className={styles.submit} disabled={pending || googleBusy}>
          {pending ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <div className={styles.divider}>
        <span>or</span>
      </div>

      {googleError && (
        <div className={styles.error} style={{ marginBottom: 10 }}>
          {googleError}
        </div>
      )}

      <button
        type="button"
        onClick={handleGoogleClick}
        disabled={pending || googleBusy}
        className={styles.googleBtn}
      >
        <GoogleGMark />
        <span>{googleBusy ? "Waiting for Google..." : "Sign in with Google"}</span>
      </button>
      <p className={styles.ssoNote}>
        {googleEnabled
          ? "Authorized panel accounts only — unapproved Google accounts are blocked."
          : "Authorized accounts only · Admins can enable Google OAuth under Settings → Security."}
      </p>
    </div>
  );
}

function GoogleGMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
      />
    </svg>
  );
}
