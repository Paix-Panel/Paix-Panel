import { NextRequest, NextResponse } from "next/server";
import {
  buildGoogleAuthUrl,
  createSignedOAuthState,
  getGoogleAuthConfig,
  resolveRequestOrigin,
} from "@/lib/googleAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cfg = getGoogleAuthConfig();
  if (!cfg.clientId || !cfg.clientSecret) {
    return NextResponse.json(
      {
        error:
          "Google Sign-In is not configured yet. Ask an Admin or Super Admin to add Google OAuth credentials under Settings → Security.",
      },
      { status: 400 },
    );
  }
  if (!cfg.enabled) {
    return NextResponse.json(
      { error: "Google Sign-In is currently disabled by an administrator." },
      { status: 403 },
    );
  }

  const remember = req.nextUrl.searchParams.get("remember") === "1";
  const origin = resolveRequestOrigin(req);
  const redirectUri = `${origin}/api/auth/google/callback`;
  const state = createSignedOAuthState({ remember, origin });
  const url = buildGoogleAuthUrl({
    clientId: cfg.clientId,
    redirectUri,
    state,
  });

  return NextResponse.json({ url, redirectUri });
}
