import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import AccessRestricted from "@/components/AccessRestricted/AccessRestricted";
import { agent, AgentError, type TaskState } from "@/lib/agent";
import { requireSession } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import StatusBadge from "@/components/StatusBadge/StatusBadge";
import LocalTime from "@/components/LocalTime/LocalTime";
import LiveTaskLog from "./LiveTaskLog";
import styles from "@/components/page.module.css";

export const dynamic = "force-dynamic";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const s = await requireSession();
  if (!hasPermission(s, "logs")) {
    return (
      <AccessRestricted
        title="Task log restricted"
        message="You do not have permission to read background task logs."
        backHref="/dashboard"
        backLabel="Back to dashboard"
      />
    );
  }

  let task: TaskState;
  try {
    task = await agent.tasks.get(id);
  } catch (e) {
    if (e instanceof AgentError && e.status === 404) notFound();
    throw e;
  }

  const isLive = task.status === "pending" || task.status === "running";

  return (
    <div>
      <Link href="/tasks" className={styles.backArrow} aria-label="Back to tasks">
        <ArrowLeft size={16} />
      </Link>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>
            <span className={styles.code}>{task.kind}</span>
          </h1>
          <div className={styles.subtitle}>
            <StatusBadge text={task.status} />{" "}
            <span>started <LocalTime value={task.started_at} /></span>
            {task.finished_at && <span> &middot; finished <LocalTime value={task.finished_at} /></span>}
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Log</h2>
        {isLive ? (
          <LiveTaskLog taskId={task.id} />
        ) : (
          <pre className={styles.log}>
            {task.log.length > 0 ? task.log.join("\n") : "(no output)"}
          </pre>
        )}
      </div>
    </div>
  );
}
