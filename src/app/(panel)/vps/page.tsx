import { isSuperAdmin, requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isVpsAdmin } from "@/lib/permissions";
import {
  getHostCapacity,
  listAllVpsInstances,
  listServicePackages,
  listVpsInstancesForUser,
} from "@/lib/provisioning";
import AccessRestricted from "@/components/AccessRestricted/AccessRestricted";
import CapacityPool from "@/components/CapacityPool/CapacityPool";
import pageStyles from "@/components/page.module.css";
import VpsSuperAdminClient from "./VpsSuperAdminClient";
import VpsTenantCard from "./VpsTenantCard";

export const dynamic = "force-dynamic";

export default async function VpsPage() {
  const session = await requireSession();
  const superAdmin = isSuperAdmin(session.role);
  const vpsAdmin = isVpsAdmin(session.role);

  if (!superAdmin && !vpsAdmin) {
    return (
      <AccessRestricted
        title="VPS Workspace Restricted"
        message="VPS provisioning is restricted to Super Admins, and VPS dashboards are visible to assigned VPS Admin owners."
      />
    );
  }

  if (superAdmin) {
    const [capacity, instances, vpsPackages] = await Promise.all([
      getHostCapacity(),
      Promise.resolve(listAllVpsInstances()),
      Promise.resolve(listServicePackages("vps")),
    ]);
    const users = db()
      .prepare(`SELECT id, email, display_name, role FROM users WHERE is_active = 1 ORDER BY id ASC`)
      .all() as { id: number; email: string; display_name: string; role: string }[];

    return (
      <div>
        <div className={pageStyles.head}>
          <div>
            <h1 className={pageStyles.title}>VPS Provisioning &amp; Fleet</h1>
            <div className={pageStyles.subtitle}>
              Register VPS servers from your hardware pool, allocate CPU/RAM/Storage packages, and
              deliver SSH credentials with free Paix Panel or custom panel choice.
            </div>
          </div>
        </div>

        <CapacityPool capacity={capacity} />
        <VpsSuperAdminClient
          instances={instances}
          vpsPackages={vpsPackages}
          capacity={capacity}
          users={users}
        />
      </div>
    );
  }

  // VPS Admin owner view: strictly scoped to their own VPS instance(s).
  const myInstances = listVpsInstancesForUser(session.userId);

  return (
    <div>
      <div className={pageStyles.head}>
        <div>
          <h1 className={pageStyles.title}>My VPS &amp; Control Panel Choice</h1>
          <div className={pageStyles.subtitle}>
            Manage your allocated VPS resources, SSH access credentials, and choose Paix Panel
            (Free) or install your own control panel via SSH.
          </div>
        </div>
      </div>

      {myInstances.length === 0 ? (
        <div className={pageStyles.empty}>
          No VPS instance is currently assigned to your account. Contact the Super Admin to
          provision one.
        </div>
      ) : (
        myInstances.map((vps) => <VpsTenantCard key={vps.id} vps={vps} />)
      )}
    </div>
  );
}
