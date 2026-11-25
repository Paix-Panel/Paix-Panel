import AccessRestricted from "@/components/AccessRestricted/AccessRestricted";
import { agent } from "@/lib/agent";
import { requireSession } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getServerAddress } from "@/lib/serverAddress";
import ScaleClient from "./ScaleClient";

export const dynamic = "force-dynamic";

export default async function ScalePage() {
  const s = await requireSession();
  if (!hasPermission(s, "services")) {
    return (
      <AccessRestricted
        title="Scale & Addons restricted"
        message="You do not have permission to tune scaling settings or install infrastructure addons."
      />
    );
  }

  let initialError: string | null = null;
  const [scaleStatus, recipes, addr] = await Promise.all([
    agent.scale.status().catch((e: unknown) => {
      initialError = e instanceof Error ? e.message : "Could not load scale status.";
      return null;
    }),
    agent.quickInstall.list().catch(() => []),
    getServerAddress(),
  ]);

  const serverAddress = addr.domain ?? addr.ip ?? null;

  return (
    <ScaleClient
      initialScale={scaleStatus}
      initialError={initialError}
      recipes={recipes}
      serverAddress={serverAddress}
    />
  );
}
