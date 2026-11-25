import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { COOKIE_NAME } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const jar = await cookies();
  if (!jar.get(COOKIE_NAME)?.value) {
    return NextResponse.json(
      { authenticated: false },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }
  const s = await getSession();
  if (!s) {
    return NextResponse.json(
      { authenticated: false },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(
    {
      authenticated: true,
      redirectTo: s.needsTotp ? "/totp" : "/dashboard",
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
