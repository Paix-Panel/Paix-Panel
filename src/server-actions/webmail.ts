"use server";

import { revalidatePath } from "next/cache";
import {
  agent,
  type WebmailFolderSummary,
  type WebmailMessageDetail,
  type WebmailMessageSummary,
} from "@/lib/agent";
import { requirePermission } from "@/lib/auth";
import { isDomainAllowed } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { agentErrorMessage } from "@/lib/redirects";

export type WebmailResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function emailDomainAllowed(s: Awaited<ReturnType<typeof requirePermission>>, email: string): boolean {
  const domain = email.split("@")[1] ?? "";
  return Boolean(domain && isDomainAllowed(s, domain));
}

export async function listWebmailFoldersAction(
  email: string,
): Promise<WebmailResult<WebmailFolderSummary[]>> {
  const s = await requirePermission("mail");
  if (!emailDomainAllowed(s, email)) {
    return { ok: false, error: "Forbidden: domain not assigned to your account." };
  }
  try {
    const folders = await agent.webmail.folders(email);
    return { ok: true, data: folders };
  } catch (e) {
    return { ok: false, error: agentErrorMessage(e) };
  }
}

export async function listWebmailMessagesAction(
  email: string,
  folder: string,
  q = "",
): Promise<WebmailResult<WebmailMessageSummary[]>> {
  const s = await requirePermission("mail");
  if (!emailDomainAllowed(s, email)) {
    return { ok: false, error: "Forbidden: domain not assigned to your account." };
  }
  try {
    const msgs = await agent.webmail.messages(email, folder, q);
    return { ok: true, data: msgs };
  } catch (e) {
    return { ok: false, error: agentErrorMessage(e) };
  }
}

export async function readWebmailMessageAction(
  email: string,
  id: string,
  folder: string,
): Promise<WebmailResult<WebmailMessageDetail>> {
  const s = await requirePermission("mail");
  if (!emailDomainAllowed(s, email)) {
    return { ok: false, error: "Forbidden: domain not assigned to your account." };
  }
  try {
    const msg = await agent.webmail.readMessage(email, id, folder);
    return { ok: true, data: msg };
  } catch (e) {
    return { ok: false, error: agentErrorMessage(e) };
  }
}

export async function sendWebmailMessageAction(
  email: string,
  input: { to: string; cc?: string; subject: string; body: string; in_reply_to?: string },
): Promise<WebmailResult<{ message_id: string }>> {
  const s = await requirePermission("mail");
  if (!emailDomainAllowed(s, email)) {
    return { ok: false, error: "Forbidden: domain not assigned to your account." };
  }
  if (!input.to.trim()) return { ok: false, error: "Recipient (To) is required." };
  if (!input.subject.trim()) return { ok: false, error: "Subject is required." };
  try {
    const res = await agent.webmail.send(email, input);
    writeAudit({
      actorId: s.userId,
      action: "webmail.send",
      target: `${email} -> ${input.to}`,
      result: "ok",
      message: input.subject.slice(0, 120),
    });
    revalidatePath("/mailboxes/webmail");
    revalidatePath("/mailboxes");
    return { ok: true, data: { message_id: res.message_id } };
  } catch (e) {
    const err = agentErrorMessage(e);
    writeAudit({
      actorId: s.userId,
      action: "webmail.send",
      target: email,
      result: "error",
      message: err,
    });
    return { ok: false, error: err };
  }
}

export async function webmailMessageAction(
  email: string,
  input: {
    folder: string;
    message_id: string;
    action: "mark_read" | "mark_unread" | "flag" | "move" | "delete";
    target_folder?: string;
  },
): Promise<WebmailResult<{ ok: true }>> {
  const s = await requirePermission("mail");
  if (!emailDomainAllowed(s, email)) {
    return { ok: false, error: "Forbidden: domain not assigned to your account." };
  }
  try {
    await agent.webmail.action(email, input);
    if (input.action === "delete" || input.action === "move") {
      writeAudit({
        actorId: s.userId,
        action: `webmail.${input.action}`,
        target: `${email} (${input.folder})`,
        result: "ok",
      });
    }
    revalidatePath("/mailboxes/webmail");
    return { ok: true, data: { ok: true } };
  } catch (e) {
    return { ok: false, error: agentErrorMessage(e) };
  }
}
