import Link from "next/link";
import { notFound } from "next/navigation";
import AccessRestricted from "@/components/AccessRestricted/AccessRestricted";
import { agent } from "@/lib/agent";
import { requireSession } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { uploadLimitMb } from "@/lib/uploadLimit";
import { agentErrorMessage } from "@/lib/redirects";
import styles from "@/components/page.module.css";
import FileBrowser from "./FileBrowser";

export const dynamic = "force-dynamic";

export default async function FilesRootPage({
  params,
  searchParams,
}: {
  params: Promise<{ root: string }>;
  searchParams: Promise<{ path?: string }>;
}) {
  const s = await requireSession();
  if (!hasPermission(s, "files")) {
    return (
      <AccessRestricted
        title="Files access restricted"
        message="You do not have permission to browse or edit server files."
      />
    );
  }
  const { root: rootId } = await params;
  const sp = await searchParams;
  const path = sp.path ?? "";

  const roots = await agent.files.roots().catch(() => []);
  const root = roots.find((r) => r.id === rootId);
  if (!root) notFound();

  let listing;
  try {
    listing = await agent.files.list(rootId, path);
  } catch (e: unknown) {
    const message = agentErrorMessage(e).replace(/^(conflict|invalid input): /, "");
    return (
      <div>
        <Link href="/files" className={styles.backArrow} aria-label="Back to Files">
          ←
        </Link>
        <div className={styles.head}>
          <div>
            <h1 className={styles.title}>{root.label}</h1>
            <div className={styles.subtitle}>{root.path}</div>
          </div>
        </div>
        <div className={styles.error}>Couldn&apos;t open {path || root.path}: {message}</div>
        {path !== "" && (
          <Link href={`/files/${rootId}`} className={styles.btnGhost}>
            Back to {root.path}
          </Link>
        )}
      </div>
    );
  }

  // Keyed on the path so browser back/forward — which re-runs this server
  // component with a different `?path=` — remounts the client browser with
  // the right listing instead of leaving its own state stale.
  return <FileBrowser key={path} initial={listing} maxUploadMb={uploadLimitMb()} />;
}
