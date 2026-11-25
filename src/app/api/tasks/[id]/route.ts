import { NextRequest } from "next/server";
import { agent, AgentError } from "@/lib/agent";
import { getSession, isAdminRole } from "@/lib/auth";
import { hasAnyPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * One-shot JSON state of a task. Fallback surface for TaskProgress when the
 * SSE stream dies (connection drop, or the proxied agent stream errored):
 * the client polls this until the status is terminal instead of sitting on
 * "pending" forever. Reads through agent GET /tasks/{id}, which serves
 * finished tasks from the persisted DB row.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session || session.needsTotp)
    return new Response("unauthorized", { status: 401 });
  if (
    !isAdminRole(session.role) &&
    !hasAnyPermission(session, ["logs", "apps", "domains", "databases", "backups", "mail", "services", "security"])
  ) {
    return new Response("forbidden", { status: 403 });
  }
  const { id } = await params;
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(id)) {
    return new Response("invalid id", { status: 400 });
  }
  try {
    const task = await agent.tasks.get(id);
    return Response.json(task);
  } catch (e) {
    if (e instanceof AgentError) {
      return new Response(e.body || "agent error", { status: e.status });
    }
    return new Response(e instanceof Error ? e.message : String(e), {
      status: 502,
    });
  }
}
