import { agent } from "@/lib/agent";
import { requireSession } from "@/lib/auth";
import { getServerAddress } from "@/lib/serverAddress";
import shared from "@/components/page.module.css";
import ScaleClient from "./ScaleClient";

export const dynamic = "force-dynamic";

export default async function ScalePage() {
  const s = await requireSession();
  if (s.role !== "admin") {
    return (
      <div className={shared.head}>
        <div>
          <h1 className={shared.title}>Performance, Scale &amp; Addons</h1>
          <div className={shared.subtitle}>
            Only admins can tune kernel/network settings and install infrastructure addons.
          </div>
        </div>
      </div>
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
