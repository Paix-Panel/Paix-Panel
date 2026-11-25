"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "@/components/page.module.css";

type Result = { ok: true } | { ok: false; error: string };

type Props = {
  clientId: string;
  hasSecret: boolean;
  enabled: boolean;
  source: "database" | "env" | "none";
  saveAction: (prev: Result | null, fd: FormData) => Promise<Result>;
  clearAction: () => Promise<Result>;
};

export default function GoogleAuthForm({
  clientId,
  hasSecret,
  enabled,
  source,
  saveAction,
  clearAction,
}: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<Result | null, FormData>(saveAction, null);
  const [clearPending, startClear] = useTransition();
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  const callbackUrl = origin
    ? `${origin}/api/auth/google/callback`
    : "https://<your-panel-domain>/api/auth/google/callback";

  const copyCallback = async () => {
    try {
      await navigator.clipboard.writeText(callbackUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard restrictions
    }
  };

  return (
    <form action={formAction}>
      <div
        style={{
          padding: "10px 12px",
          background: "var(--bg-elev-2)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          fontSize: 12,
          marginBottom: 14,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div>
          <strong>Authorized Redirect URI</strong> (add this to Google Cloud Console → OAuth 2.0 Client):
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <code className={styles.code} style={{ wordBreak: "break-all" }}>
            {callbackUrl}
          </code>
          <button
            type="button"
            onClick={copyCallback}
            className={styles.btnGhost}
            style={{ fontSize: 11, padding: "2px 8px" }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <div className={styles.muted}>
          Source: <strong>{source === "database" ? "Saved in panel settings" : source === "env" ? "Environment variables" : "Not configured"}</strong>
        </div>
      </div>

      <div className={styles.formRow}>
        <label className={styles.field}>
          Google OAuth Client ID
          <input
            name="client_id"
            className={styles.input}
            defaultValue={clientId}
            placeholder="1234567890-abc.apps.googleusercontent.com"
            autoComplete="off"
            required
          />
        </label>
        <label className={styles.field}>
          Google OAuth Client Secret {hasSecret ? "(leave blank to keep existing)" : ""}
          <input
            name="client_secret"
            type="password"
            className={styles.input}
            placeholder={hasSecret ? "••••••••••••••••" : "GOCSPX-..."}
            autoComplete="new-password"
          />
        </label>
      </div>

      <label className={styles.checkbox} style={{ marginBottom: 12 }}>
        <input type="checkbox" name="enabled" defaultChecked={enabled || !hasSecret} />
        Enable &ldquo;Sign in with Google&rdquo; on /login (authorized panel users only)
      </label>

      {state?.ok === false && (
        <div className={styles.error} style={{ marginBottom: 10 }}>
          {state.error}
        </div>
      )}
      {state?.ok === true && (
        <div className={styles.notice} style={{ marginBottom: 10 }}>
          Google Sign-In configuration saved.
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="submit" className={styles.btn} disabled={pending || clearPending}>
          {pending ? "Saving..." : "Save Google SSO"}
        </button>
        {source === "database" && (
          <button
            type="button"
            className={styles.btnGhost}
            disabled={pending || clearPending}
            onClick={() => {
              startClear(async () => {
                await clearAction();
                router.refresh();
              });
            }}
          >
            {clearPending ? "Clearing..." : "Clear stored keys"}
          </button>
        )}
      </div>
    </form>
  );
}
