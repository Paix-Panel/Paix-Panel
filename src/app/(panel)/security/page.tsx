import { requireSession } from "@/lib/auth";
import { agent } from "@/lib/agent";
import styles from "@/components/page.module.css";
import SecurityClient from "./SecurityClient";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const s = await requireSession();
  if (s.role !== "admin") {
    return (
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Security &amp; SSH Monitor</h1>
          <div className={styles.subtitle}>
            Only admins can inspect SSH intrusion logs and security posture.
          </div>
        </div>
      </div>
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
