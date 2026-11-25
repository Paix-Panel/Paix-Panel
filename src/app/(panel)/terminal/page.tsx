import AccessRestricted from "@/components/AccessRestricted/AccessRestricted";
import { agent } from "@/lib/agent";
import { requireSession } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { config } from "@/lib/config";
import { historyForPath, normalizePath } from "@/lib/terminalHistory";
import styles from "@/components/page.module.css";
import TerminalConsole from "./TerminalConsole";

export const dynamic = "force-dynamic";

const DEFAULT_PATH = "/srv/apps";

export default async function TerminalPage({
  searchParams,
}: {
  searchParams: Promise<{ path?: string }>;
}) {
  const session = await requireSession();
  if (!hasPermission(session, "terminal")) {
    return (
      <AccessRestricted
        title="Terminal access restricted"
        message="You do not have permission to use the web terminal."
      />
    );
  }
  const sp = await searchParams;
  const path = normalizePath(
    sp.path && sp.path.startsWith("/") ? sp.path : DEFAULT_PATH,
  );

  // Rendered into the prompt so the console reads like a real one, and so it's
  // obvious WHICH box you're typing at when several panels are open.
  const hostname = config.panelHost || "server";

  // "Run as" options: root, plus `apps` (the account app tooling should use —
  // see apps::run_npm) and any human account. Service users are left out; the
  // list is for choosing a sensible identity, not enumerating /etc/passwd.
  const systemUsers = await agent.system.users().catch(() => []);
  const users = [
    "root",
    ...systemUsers
      .filter((u) => u.name !== "root" && (u.is_human || u.name === "apps"))
      .map((u) => u.name),
  ];

  return (
    <div>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Terminal</h1>
          <div className={styles.subtitle}>
            Shell commands as root, in the folder you pick on the left. Every command is
            recorded in the audit log.
          </div>
        </div>
      </div>

      <TerminalConsole
        initialPath={path}
        initialHistory={historyForPath(session.userId, path)}
        hostname={hostname}
        users={users}
      />
    </div>
  );
}
