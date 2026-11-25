"use server";

import { revalidatePath } from "next/cache";
import { agent, type ScaleProfileId, type ScaleStatus } from "@/lib/agent";
import { requirePermission } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

export type ApplyScaleResult =
  | { ok: true; status: ScaleStatus; message: string }
  | { ok: false; error: string };

const ALLOWED_PROFILES = new Set<string>([
  "kernel_bbr",
  "nginx_cache",
  "mariadb_tune",
  "postgresql_tune",
  "all",
]);

export async function applyScaleProfileAction(
  _prev: ApplyScaleResult | null,
  fd: FormData,
): Promise<ApplyScaleResult> {
  const s = await requirePermission("services");
  const profile = String(fd.get("profile") ?? "").trim();
  const enableRaw = String(fd.get("enable") ?? "true").trim().toLowerCase();
  const enable = enableRaw !== "false" && enableRaw !== "0";

  if (!ALLOWED_PROFILES.has(profile)) {
    return { ok: false, error: "Invalid tuning profile." };
  }

  try {
    const status = await agent.scale.apply(
      profile as ScaleProfileId | "all",
      enable,
    );
    writeAudit({
      actorId: s.userId,
      action: "scale.apply",
      target: profile,
      result: "ok",
      message: enable ? "enabled" : "disabled",
    });
    revalidatePath("/scale");
    return {
      ok: true,
      status,
      message:
        profile === "all"
          ? enable
            ? "All available high-scale optimizations enabled."
            : "High-scale tuning drop-ins removed."
          : `${profile} ${enable ? "enabled" : "disabled"}.`,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    writeAudit({
      actorId: s.userId,
      action: "scale.apply",
      target: profile,
      result: "error",
      message: msg,
    });
    return { ok: false, error: msg };
  }
}
