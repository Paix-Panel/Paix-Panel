import { requireSession, isSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getHostCapacity, listServicePackages } from "@/lib/provisioning";
import AccessRestricted from "@/components/AccessRestricted/AccessRestricted";
import CapacityPool from "@/components/CapacityPool/CapacityPool";
import pageStyles from "@/components/page.module.css";
import PackagesClient from "./PackagesClient";

export const dynamic = "force-dynamic";

export default async function PackagesPage() {
  const session = await requireSession();
  if (!isSuperAdmin(session.role)) {
    return (
      <AccessRestricted
        title="Super Admin Package Builder"
        message="Only the Super Admin can create, modify, or delete VPS and Web Hosting packages."
      />
    );
  }

  const [packages, capacity] = await Promise.all([
    Promise.resolve(listServicePackages()),
    getHostCapacity(),
  ]);

  const vpsCounts = db()
    .prepare(
      `SELECT package_id, COUNT(*) AS c FROM vps_instances WHERE status != 'terminated' GROUP BY package_id`,
    )
    .all() as { package_id: number; c: number }[];
  const hostingCounts = db()
    .prepare(
      `SELECT package_id, COUNT(*) AS c FROM hosting_accounts WHERE status != 'terminated' GROUP BY package_id`,
    )
    .all() as { package_id: number; c: number }[];

  const vpsMap = new Map(vpsCounts.map((r) => [r.package_id, r.c]));
  const hostMap = new Map(hostingCounts.map((r) => [r.package_id, r.c]));

  const packagesWithCounts = packages.map((p) => ({
    ...p,
    vps_count: vpsMap.get(p.id) ?? 0,
    hosting_count: hostMap.get(p.id) ?? 0,
  }));

  return (
    <div>
      <div className={pageStyles.head}>
        <div>
          <h1 className={pageStyles.title}>Packages &amp; Resource Plans</h1>
          <div className={pageStyles.subtitle}>
            Super Admin studio for building VPS and Web Hosting plans with CPU, RAM, storage,
            bandwidth, and hosting quotas.
          </div>
        </div>
      </div>

      <CapacityPool capacity={capacity} />
      <PackagesClient packages={packagesWithCounts} capacity={capacity} />
    </div>
  );
}
