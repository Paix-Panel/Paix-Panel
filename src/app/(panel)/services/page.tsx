import AccessRestricted from "@/components/AccessRestricted/AccessRestricted";
import { requireSession } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { agent } from "@/lib/agent";
import styles from "@/components/page.module.css";
import ServicesView from "./ServicesView";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const session = await requireSession();
  if (!hasPermission(session, "services")) {
    return (
      <AccessRestricted
        title="Services access restricted"
        message="You do not have permission to view or restart system services."
      />
    );
  }

  const services = await agent.services.list().catch(() => []);

  return (
    <div>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>System services</h1>
          <div className={styles.subtitle}>Core services this panel depends on.</div>
        </div>
      </div>

      <ServicesView services={services} />
    </div>
  );
}
