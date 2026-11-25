"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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

function isTrustedOrigin(origin: string): boolean {
  if (typeof window === "undefined") return false;
  if (origin === window.location.origin) return true;
  if (origin.endsWith(".run.app") || origin.startsWith("http://localhost")) return true;
  return false;
}

export default function LoginForm({
  action,
  defaultEmail = "",
  defaultPassword = "",
  googleEnabled = false,
  googleConfigured = false,
}: Props) {
  const router = useRouter();
  const [state, formAction, pending, formRef] = useFormActionState<ActionResult | null>(action, null);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [googleAuthUrl, setGoogleAuthUrl] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);

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

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!isTrustedOrigin(event.origin)) return;
      const data = event.data as
        | { type?: string; redirectTo?: string; error?: string }
        | null;
      if (!data || typeof data.type !== "string") return;

      if (data.type === "GOOGLE_OAUTH_SUCCESS") {
        setGoogleBusy(false);
        setGoogleError(null);
        router.push(data.redirectTo || "/dashboard");
        router.refresh();
      } else if (data.type === "GOOGLE_OAUTH_ERROR") {
        setGoogleBusy(false);
        setGoogleError(data.error || "Google sign-in was denied.");
        preloadGoogleUrl(remember);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [router, preloadGoogleUrl, remember]);

  // Reset busy indicator if user manually closes the popup without finishing
  useEffect(() => {
    if (!googleBusy) return;
    const timer = window.setInterval(() => {
      if (popupRef.current && popupRef.current.closed) {
        setGoogleBusy(false);
        preloadGoogleUrl(remember);
      }
    }, 600);
    return () => window.clearInterval(timer);
  }, [googleBusy, preloadGoogleUrl, remember]);

  const handleGoogleClick = async () => {
    setGoogleError(null);
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
