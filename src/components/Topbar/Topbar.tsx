import { logoutAction } from "@/server-actions/auth";
import { isAdminRole, roleDisplayLabel, type UserRole } from "@/lib/permissions";
import StatusBadge from "@/components/StatusBadge/StatusBadge";
import HamburgerButton from "./HamburgerButton";
import ServerClock from "./ServerClock";
import UpdateButton from "./UpdateButton";
import styles from "./Topbar.module.css";

type Props = {
  email: string;
  role: UserRole;
  timezone: string;
};

export default function Topbar({ email, role, timezone }: Props) {
  const initialServerMs = Date.now();
  const isAdmin = isAdminRole(role);
  return (
    <header className={styles.bar}>
      <HamburgerButton />
      <ServerClock initialServerMs={initialServerMs} timezone={timezone} />
      <div className={styles.spacer} />
      <div className={styles.user}>
        {isAdmin && <UpdateButton />}
        <StatusBadge
          text={roleDisplayLabel(role)}
          tone={
            role === "super_admin"
              ? "info"
              : role === "admin" || role === "vps_admin"
                ? "ok"
                : role === "hosting_admin"
                  ? "warn"
                  : "muted"
          }
        />
        <span className={styles.email}>{email}</span>
        <form action={logoutAction}>
          <button type="submit" className={styles.signOut}>
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
