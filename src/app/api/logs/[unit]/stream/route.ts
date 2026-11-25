import { NextRequest } from "next/server";
import http from "node:http";
import { config } from "@/lib/config";
import { getSession, hasPermission } from "@/lib/auth";
import { isAppAllowed } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ unit: string }> },
) {
  const session = await getSession();
  if (!session || session.needsTotp)
    return new Response("unauthorized", { status: 401 });
  const { unit } = await params;
  if (!/^[a-zA-Z0-9_.@:\-]{1,200}$/.test(unit)) {
    return new Response("invalid unit", { status: 400 });
  }
  const appMatch = unit.match(/^vps-app-([a-z0-9-]+)\.service$/);
  const canViewAppLog = appMatch ? isAppAllowed(session, appMatch[1]) : false;
  if (!hasPermission(session, "logs") && !canViewAppLog) {
    return new Response("forbidden", { status: 403 });
  }
  const lines = req.nextUrl.searchParams.get("lines") || "200";
  const path = `/logs/${encodeURIComponent(unit)}/stream?lines=${encodeURIComponent(lines)}`;

  if (config.isPreviewMock) {
    const encoder = new TextEncoder();
    const now = new Date().toISOString();
    const sample = [
      `${now} systemd[1]: Started ${unit}.`,
      `${now} ${unit}: listening on loopback interface, TLS proxy active.`,
      `${now} ${unit}: health probe ok (200 in 4ms).`,
    ];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const line of sample) {
          controller.enqueue(encoder.encode(`data: ${line}\n\n`));
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  }

  // The upstream agent request, so a closed browser tab can end it. Without
  // cancel() every log view left an agent connection and a journalctl -f
  // running on the server.
  let upstream: http.ClientRequest | null = null;
  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      upstream?.destroy();
    },
    start(controller) {
      const r = http.request(
        {
          socketPath: config.agentSocket,
          method: "GET",
          path,
          headers: {
            Authorization: `Bearer ${config.agentToken}`,
            Accept: "text/event-stream",
          },
        },
        (res) => {
          if ((res.statusCode ?? 500) >= 400) {
            controller.enqueue(
              new TextEncoder().encode(`event: error\ndata: agent ${res.statusCode}\n\n`),
            );
            controller.close();
            // Discard the error body, or the agent connection stays open.
            res.resume();
            return;
          }
          res.on("data", (chunk: Buffer) => {
            try {
              controller.enqueue(new Uint8Array(chunk));
            } catch {
              // closed
            }
          });
          res.on("end", () => {
            try { controller.close(); } catch { /* */ }
          });
          res.on("error", (e) => {
            try { controller.error(e); } catch { /* */ }
          });
        },
      );
      r.on("error", (e) => {
        try { controller.error(e); } catch { /* */ }
      });
      upstream = r;
      req.signal.addEventListener("abort", () => r.destroy(), { once: true });
      r.end();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
