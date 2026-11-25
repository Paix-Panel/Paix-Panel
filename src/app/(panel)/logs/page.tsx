import AccessRestricted from "@/components/AccessRestricted/AccessRestricted";
import { agent } from "@/lib/agent";
import { requireSession } from "@/lib/auth";
import { hasPermission, isAdminRole, isAppAllowed } from "@/lib/permissions";
import styles from "@/components/page.module.css";
import LogTailer from "./LogTailer";

export const dynamic = "force-dynamic";

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ unit?: string }>;
}) {
  const s = await requireSession();
  if (!hasPermission(s, "logs")) {
    return (
      <AccessRestricted
        title="Logs access restricted"
        message="You do not have permission to read live service logs."
      />
    );
  }
  const services = await agent.services.list().catch(() => []);
  const sp = await searchParams;
  const initial = sp?.unit;
  const hasAppScope = !isAdminRole(s.role) && (s.permissions.scopes?.apps?.length ?? 0) > 0;
  const unitOptions = services
    .map((svc) => svc.unit)
    .filter((u) => {
      if (!u.endsWith(".service")) return false;
      if (!hasAppScope) return true;
      const m = u.match(/^vps-app-(.+)\.service$/);
      return m ? isAppAllowed(s, m[1]) : false;
    })
    .sort();
  return (
    <div>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Logs</h1>
          <div className={styles.subtitle}>Live tail from journald.</div>
        </div>
      </div>
      <LogTailer units={unitOptions} initial={initial} />
    </div>
  );
}
