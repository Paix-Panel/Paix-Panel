"use server";

import { revalidatePath } from "next/cache";
import { isIP } from "node:net";
import { agent, type SecurityOverview } from "@/lib/agent";
import { requireAdmin } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { agentErrorMessage } from "@/lib/redirects";

export type SecurityActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export async function fetchSecurityOverviewAction(
  lines = 300,
): Promise<SecurityActionResult<SecurityOverview>> {
  await requireAdmin();
  try {
    const data = await agent.security.overview(lines);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: agentErrorMessage(e) };
  }
}

export async function banIpSecurityAction(ip: string): Promise<SecurityActionResult> {
  const s = await requireAdmin();
  const clean = ip.trim();
  if (!isIP(clean)) {
    return { ok: false, error: "Invalid IP address." };
  }
  try {
    await agent.security.banIp(clean);
    writeAudit({
      actorId: s.userId,
      action: "security.ban_ip",
      target: clean,
      result: "ok",
    });
    revalidatePath("/security");
    revalidatePath("/firewall");
    return { ok: true };
  } catch (e) {
    const err = agentErrorMessage(e);
    writeAudit({
      actorId: s.userId,
      action: "security.ban_ip",
      target: clean,
      result: "error",
      message: err,
    });
    return { ok: false, error: err };
  }
}

export async function unbanIpSecurityAction(ip: string): Promise<SecurityActionResult> {
  const s = await requireAdmin();
  const clean = ip.trim();
  if (!isIP(clean)) {
    return { ok: false, error: "Invalid IP address." };
  }
  try {
    await agent.security.unbanIp(clean);
    writeAudit({
      actorId: s.userId,
      action: "security.unban_ip",
      target: clean,
      result: "ok",
    });
    revalidatePath("/security");
    revalidatePath("/firewall");
    return { ok: true };
  } catch (e) {
    const err = agentErrorMessage(e);
    writeAudit({
      actorId: s.userId,
      action: "security.unban_ip",
      target: clean,
      result: "error",
      message: err,
    });
    return { ok: false, error: err };
  }
}
