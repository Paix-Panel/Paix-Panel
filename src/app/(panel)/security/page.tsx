import AccessRestricted from "@/components/AccessRestricted/AccessRestricted";
import { requireSession } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { agent } from "@/lib/agent";
import SecurityClient from "./SecurityClient";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const s = await requireSession();
  if (!hasPermission(s, "security")) {
    return (
      <AccessRestricted
        title="Security access restricted"
        message="You do not have permission to inspect SSH security posture and intrusion logs."
      />
    );
  }

  let overview = null;
  let initialError: string | null = null;

  try {
    overview = await agent.security.overview(300);
  } catch (e) {
    initialError = e instanceof Error ? e.message : "Could not load SSH security telemetry.";
  }

  return <SecurityClient initial={overview} initialError={initialError} />;
}
