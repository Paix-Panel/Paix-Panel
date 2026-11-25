import Link from "next/link";
import AccessRestricted from "@/components/AccessRestricted/AccessRestricted";
import { agent, type TrashRow } from "@/lib/agent";
import { requireSession } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import styles from "@/components/page.module.css";
import TrashTable from "./TrashTable";

export const dynamic = "force-dynamic";

export default async function TrashPage() {
  const s = await requireSession();
  if (!hasPermission(s, "files")) {
    return (
      <AccessRestricted
        title="Trash access restricted"
        message="You do not have permission to browse or restore deleted files."
      />
    );
  }
  let rows: TrashRow[];
  let error: string | null = null;
  try {
    rows = await agent.files.listTrash();
  } catch (e: unknown) {
    rows = [];
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div>
      <Link href="/files" className={styles.backArrow} aria-label="Back to Files">
        ←
      </Link>

      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Trash</h1>
          <div className={styles.subtitle}>
            Items deleted from Files. Purged automatically 30 days after deletion.
          </div>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <TrashTable rows={rows} />
    </div>
  );
}
