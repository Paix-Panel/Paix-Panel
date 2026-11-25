import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { issueSession, setAuthCookies, syncAdminFromEnv } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { checkLogin, markLoginSucceeded, recordLoginAttempt } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/getClientIp";
import {
  exchangeGoogleCode,
  getGoogleAuthConfig,
  resolveRequestOrigin,
  verifySignedOAuthState,
} from "@/lib/googleAuth";
import { contentSecurityPolicy, newNonce } from "@/lib/csp";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AuthorizedUserRow = {
  id: number;
  email: string;
  display_name: string;
  role: string;
  totp_enabled: number;
  google_enabled: number;
  google_sub: string | null;
  is_active: number;
};

function popupResultHtml(opts: {
  ok: boolean;
  redirectTo?: string;
  error?: string;
  targetOrigin: string;
}): NextResponse {
  const nonce = newNonce();
  const payload = JSON.stringify(
    opts.ok
      ? { type: "GOOGLE_OAUTH_SUCCESS", redirectTo: opts.redirectTo ?? "/dashboard" }
      : { type: "GOOGLE_OAUTH_ERROR", error: opts.error ?? "Google sign-in failed" },
  );
  const safeTargetOrigin = JSON.stringify(opts.targetOrigin || "*");
  const statusText = opts.ok
    ? "Signed in! Redirecting to dashboard..."
    : (opts.error ?? "Sign in denied.");
  const safeEscapedStatus = statusText
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Google Sign-In</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      font-family: system-ui, -apple-system, sans-serif;
      background: #0d1117;
      color: #e6edf3;
      padding: 24px;
    }
    .box {
      max-width: 420px;
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 12px;
      padding: 24px;
      text-align: center;
    }
    .title { font-size: 16px; font-weight: 700; margin: 0 0 8px; }
    .msg { font-size: 14px; color: ${opts.ok ? "#7ee787" : "#ff7b72"}; line-height: 1.5; margin: 0 0 16px; }
    .btn {
      display: inline-block;
      padding: 8px 14px;
      border-radius: 8px;
      background: #238636;
      color: #fff;
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
      border: 0;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="box">
    <h1 class="title">${opts.ok ? "Authentication Complete" : "Access Denied"}</h1>
    <p class="msg">${safeEscapedStatus}</p>
    <button id="close-btn" type="button" class="btn">Close window</button>
  </div>
  <script nonce="${nonce}">
    (function () {
      var closeBtn = document.getElementById("close-btn");
      if (closeBtn) {
        closeBtn.addEventListener("click", function () { window.close(); });
      }
      var data = ${payload};
      var targetOrigin = ${safeTargetOrigin};
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(data, targetOrigin);
          if (targetOrigin !== "*") {
            window.opener.postMessage(data, "*");
          }
        }
      } catch (e) {}
      try {
        if (typeof BroadcastChannel !== "undefined") {
          var ch = new BroadcastChannel("paix_google_oauth");
          ch.postMessage(data);
          ch.close();
        }
      } catch (e) {}
      try {
        localStorage.setItem(
          "paix_google_oauth_result",
          JSON.stringify({
            type: data.type,
            redirectTo: data.redirectTo,
            error: data.error,
            ts: Date.now()
          })
        );
      } catch (e) {}
      if (data.type === "GOOGLE_OAUTH_SUCCESS") {
        var dest = (typeof data.redirectTo === "string" && data.redirectTo.indexOf("/") === 0 && data.redirectTo.indexOf("//") !== 0)
          ? data.redirectTo
          : "/dashboard";
        if (!window.opener) {
          window.location.replace(dest);
          return;
        }
        setTimeout(function () { window.close(); }, 300);
        setTimeout(function () {
          if (!window.closed) {
            window.location.replace(dest);
          }
        }, 900);
      }
    })();
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    status: opts.ok ? 200 : 403,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": contentSecurityPolicy(nonce),
    },
  });
}

export async function GET(req: NextRequest) {
  await syncAdminFromEnv();
  const origin = resolveRequestOrigin(req);
  const stateParam = req.nextUrl.searchParams.get("state");
  const code = req.nextUrl.searchParams.get("code");
  const oauthErr = req.nextUrl.searchParams.get("error");

  const verifiedState = verifySignedOAuthState(stateParam);
  const targetOrigin = verifiedState?.origin || origin;

  if (oauthErr) {
    return popupResultHtml({
      ok: false,
      targetOrigin,
      error: `Google sign-in was cancelled or refused (${oauthErr}).`,
    });
  }

  if (!verifiedState || !code) {
    return popupResultHtml({
      ok: false,
      targetOrigin,
      error: "Invalid or expired Google Sign-In state. Please try again.",
    });
  }

  const cfg = getGoogleAuthConfig();
  if (!cfg.clientId || !cfg.clientSecret || !cfg.enabled) {
    return popupResultHtml({
      ok: false,
      targetOrigin,
      error: "Google Sign-In is disabled or not configured on this server.",
    });
  }

  const ip = await getClientIp();
  const rate = checkLogin(ip, "google-oauth");
  if (!rate.allowed) {
    return popupResultHtml({
      ok: false,
      targetOrigin,
      error: rate.reason,
    });
  }
  const attempt = recordLoginAttempt(ip, "google-oauth", false);

  try {
    const redirectUri = `${verifiedState.origin}/api/auth/google/callback`;
    const profile = await exchangeGoogleCode({
      code,
      clientId: cfg.clientId,
      clientSecret: cfg.clientSecret,
      redirectUri,
    });

    const user = db()
      .prepare(
        `SELECT id, email, display_name, role, totp_enabled, google_enabled, google_sub, is_active
           FROM users
          WHERE LOWER(email) = ?`,
      )
      .get(profile.email) as AuthorizedUserRow | undefined;

    if (!user) {
      writeAudit({
        actorId: null,
        action: "login.google.denied",
        target: profile.email,
        result: "error",
        message: "google account not pre-authorized in panel.db",
      });
      return popupResultHtml({
        ok: false,
        targetOrigin,
        error: `Access denied: ${profile.email} is not an authorized panel user. Ask a Super Admin or Admin to add your email first.`,
      });
    }

    if (!user.is_active) {
      writeAudit({
        actorId: user.id,
        action: "login.google.denied",
        target: user.email,
        result: "error",
        message: "account suspended",
      });
      return popupResultHtml({
        ok: false,
        targetOrigin,
        error: "Your panel account is suspended. Contact an administrator.",
      });
    }

    if (!user.google_enabled) {
      writeAudit({
        actorId: user.id,
        action: "login.google.denied",
        target: user.email,
        result: "error",
        message: "google sign-in disabled for user",
      });
      return popupResultHtml({
        ok: false,
        targetOrigin,
        error: "Google Sign-In is disabled for your account. Use email & password instead.",
      });
    }

    if (user.google_sub && user.google_sub !== profile.sub) {
      writeAudit({
        actorId: user.id,
        action: "login.google.denied",
        target: user.email,
        result: "error",
        message: "google_sub mismatch",
      });
      return popupResultHtml({
        ok: false,
        targetOrigin,
        error: "Google identity mismatch for this email. Contact an administrator.",
      });
    }

    // Bind google_sub on first successful Google login and update display_name if blank
    db()
      .prepare(
        `UPDATE users
            SET google_sub = COALESCE(google_sub, ?),
                display_name = CASE WHEN TRIM(display_name) = '' THEN ? ELSE display_name END,
                last_login_at = datetime('now')
          WHERE id = ?`,
      )
      .run(profile.sub, (profile.name ?? "").slice(0, 80), user.id);

    markLoginSucceeded(attempt);

    const needsTotp = Boolean(user.totp_enabled);
    const issued = await issueSession(
      user.id,
      user.email,
      user.role,
      needsTotp,
      verifiedState.remember,
    );
    await setAuthCookies(
      issued.access,
      issued.refresh,
      issued.accessSeconds,
      issued.refreshSeconds,
    );
    (await cookies()).delete("vps_panel_preview_signed_out");

    writeAudit({
      actorId: user.id,
      action: "login.google.ok",
      target: user.email,
      result: "ok",
      message: `role=${user.role}`,
    });

    return popupResultHtml({
      ok: true,
      targetOrigin,
      redirectTo: needsTotp ? "/totp" : "/dashboard",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    writeAudit({
      actorId: null,
      action: "login.google.error",
      result: "error",
      message: msg.slice(0, 200),
    });
    return popupResultHtml({
      ok: false,
      targetOrigin,
      error: msg,
    });
  }
}
