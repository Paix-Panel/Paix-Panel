import { isSuperAdmin, requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isHostingAdmin } from "@/lib/permissions";
import {
  getHostCapacity,
  listAllHostingAccounts,
  listHostingAccountsForUser,
  listServicePackages,
} from "@/lib/provisioning";
import { getSetting } from "@/lib/settings";
import AccessRestricted from "@/components/AccessRestricted/AccessRestricted";
import CapacityPool from "@/components/CapacityPool/CapacityPool";
import pageStyles from "@/components/page.module.css";
import HostingSuperAdminClient from "./HostingSuperAdminClient";
import HostingTenantCard from "./HostingTenantCard";

export const dynamic = "force-dynamic";

export default async function HostingPage() {
  const session = await requireSession();
  const superAdmin = isSuperAdmin(session.role);
  const hostingAdmin = isHostingAdmin(session.role);

  if (!superAdmin && !hostingAdmin) {
    return (
      <AccessRestricted
        title="Web Hosting Workspace Restricted"
        message="Web Hosting provisioning is restricted to Super Admins, and Hosting Control Centers are visible to Hosting Admin account owners."
      />
    );
  }

  const capacity = await getHostCapacity();
  const nameservers =
    getSetting("dns.ns_pair", "") ||
    (capacity.serverHost ? `ns1.${capacity.serverHost}, ns2.${capacity.serverHost}` : `ns1 / ns2 (${capacity.serverIp})`);

  if (superAdmin) {
    const accounts = listAllHostingAccounts();
    const hostingPackages = listServicePackages("hosting");
    const users = db()
      .prepare(`SELECT id, email, display_name, role FROM users WHERE is_active = 1 ORDER BY id ASC`)
      .all() as { id: number; email: string; display_name: string; role: string }[];

    return (
      <div>
        <div className={pageStyles.head}>
          <div>
            <h1 className={pageStyles.title}>Web Hosting Provisioning</h1>
            <div className={pageStyles.subtitle}>
              Register domain hosting accounts bound to Hosting Packages, deduct storage/quotas
              from host capacity, and grant full Hosting Admin controls.
            </div>
          </div>
        </div>

        <CapacityPool capacity={capacity} />
        <HostingSuperAdminClient
          accounts={accounts}
          hostingPackages={hostingPackages}
          capacity={capacity}
          users={users}
          nameservers={nameservers}
        />
      </div>
    );
  }

  const myAccounts = listHostingAccountsForUser(session.userId);

  return (
    <div>
      <div className={pageStyles.head}>
        <div>
          <h1 className={pageStyles.title}>My Web Hosting Control Center</h1>
          <div className={pageStyles.subtitle}>
            Manage your domains, DNS, Auto-SSL, files, databases, mailboxes, apps, backups, and
            scheduled cron tasks.
          </div>
        </div>
      </div>

      {myAccounts.length === 0 ? (
        <div className={pageStyles.empty}>
          No hosting account is assigned to your user yet. Contact the Super Admin to register your
          domain package.
        </div>
      ) : (
        myAccounts.map((acc) => (
          <HostingTenantCard
            key={acc.id}
            account={acc}
            serverIp={capacity.serverIp}
            nameservers={nameservers}
          />
        ))
      )}
    </div>
  );
}
