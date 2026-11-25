import { redirect } from "next/navigation";
import { REMEMBER_TTL_SECONDS, requireSession, resolveSessionTtl } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { getPanelTimezoneMode, resolvePanelTimezone } from "@/lib/audit";
import Sidebar from "@/components/Sidebar/Sidebar";
import Topbar from "@/components/Topbar/Topbar";
import RefreshKeepAlive from "@/components/RefreshKeepAlive/RefreshKeepAlive";
import { TimezoneProvider } from "@/components/TimezoneSync/TimezoneContext";
import styles from "./layout.module.css";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  if (getSetting("panel.setup_complete", "false") !== "true") {
    redirect("/setup");
  }
  const timezoneMode = getPanelTimezoneMode();
  const resolvedTimezone = await resolvePanelTimezone();
  const ttlSeconds = s.remember ? REMEMBER_TTL_SECONDS : resolveSessionTtl().accessSeconds;
  return (
    <TimezoneProvider mode={timezoneMode} initialTimezone={resolvedTimezone}>
      <div className={styles.shell}>
        <RefreshKeepAlive ttlSeconds={ttlSeconds} />
        <Sidebar />
        <div className={styles.main}>
          <Topbar email={s.email} timezone={timezoneMode === "auto" ? "auto" : resolvedTimezone} />
          <main className={styles.content}>{children}</main>
        </div>
      </div>
    </TimezoneProvider>
  );
}
