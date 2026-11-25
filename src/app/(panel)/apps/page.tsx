import Link from "next/link";
import AccessRestricted from "@/components/AccessRestricted/AccessRestricted";
import { agent, type AppRow, type DockerImageStatus, type GitStatusResp } from "@/lib/agent";
import StatusBadge from "@/components/StatusBadge/StatusBadge";
import QuickInstallStrip from "@/components/QuickInstallStrip/QuickInstallStrip";
import ActionForm from "@/components/ActionForm/ActionForm";
import {
  quickInstallAction,
  setBindAction,
  getRoundcubeSettingsAction,
  updateRoundcubeSettingsAction,
  getN8nSettingsAction,
  updateN8nSettingsAction,
  updateN8nAction,
  getN8nAutoCheck,
  setN8nAutoCheckAction,
  getPhpMyAdminSettingsAction,
  updatePhpMyAdminSettingsAction,
} from "@/server-actions/quickInstall";
import {
  restartExternalAppAction,
  updateAppAction,
  getAutoCheckUpdates,
  setAutoCheckUpdatesAction,
  refreshGitStatusAction,
  refreshImageStatusAction,
} from "@/server-actions/apps";
import {
  createAppFolderAction,
  deleteAppFolderAction,
  listAppFolders,
  listAppFolderAssignments,
  renameAppFolderAction,
  setAppFolderAction,
  toggleAppFolderCollapsedAction,
} from "@/server-actions/appFolders";
import { getServerAddress } from "@/lib/serverAddress";
import { requireSession } from "@/lib/auth";
import { hasPermission, isAdminRole, isAppAllowed } from "@/lib/permissions";
import { tailscaleCard } from "@/lib/tailscale";
import styles from "@/components/page.module.css";
import DeployMethodButton from "./DeployMethodButton";
import GitStatusBadge from "./GitStatusBadge";
import ImageStatusBadge from "./ImageStatusBadge";
import CommentCell from "./CommentCell";
import { listAppComments, setAppCommentAction } from "@/server-actions/appComments";
import AutoUpdateCheckToggle from "./AutoUpdateCheckToggle";
import CheckStatusCell from "./CheckStatusCell";
import AppFolderSection from "./AppFolderSection";
import MoveToFolderButton from "./MoveToFolderButton";
import NewFolderButton from "./NewFolderButton";

export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "name", label: "Name" },
  { key: "comment", label: "Comment", width: "200px" },
  { key: "subdomain", label: "Subdomain" },
  { key: "port", label: "Port", width: "70px" },
  { key: "git", label: "Updates", width: "180px" },
  { key: "status", label: "Status", width: "160px" },
  { key: "actions", label: "", width: "150px" },
];

/**
 * Build the row data for one app. Extracted so every bucket (named
 * folders, ungrouped, external) renders rows with the same cell layout.
 * `folderMeta` is null for external apps (they can't be foldered) and
 * carries the folder picker context for panel-managed apps.
 */
function buildAppRow(
  a: AppRow,
  gitStatuses: Map<string, GitStatusResp>,
  imageStatuses: Map<string, DockerImageStatus>,
  comments: Record<string, string>,
  folderMeta: {
    currentFolderId: number | null;
    folders: { id: number; name: string }[];
  } | null,
  autoCheck: boolean,
) {
  const isExternal = a.kind === "external";
  const isDocker = a.runtime === "docker";
  // A Docker app pulled from a registry: no checkout, its updates come from
  // the registry. One built from Git is checked like a Node app.
  const isImageApp = isDocker && !a.docker_build;
  const hasUnit = !!a.active;
  const statusText = a.sub || a.active || (isExternal ? "no unit" : "unknown");
  return {
    // Row key for AppFolderSection (not a column): the Updates and Comment
    // cells hold per-app state that must not slide to another app's row.
    _key: a.name,
    name: (
      <Link href={`/apps/${encodeURIComponent(a.name)}`}>
        <strong style={{ whiteSpace: "nowrap" }}>{a.name}</strong>
      </Link>
    ),
    comment: (
      <CommentCell
        appName={a.name}
        comment={comments[a.name] ?? ""}
        saveAction={setAppCommentAction}
      />
    ),
    subdomain: a.subdomain ? (
      <a
        href={`https://${a.subdomain}`}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.code}
        title={`Open https://${a.subdomain} in a new tab`}
      >
        {a.subdomain}
      </a>
    ) : isExternal ? (
      <span className={styles.code}>-</span>
    ) : (
      <span title="Unassigned - stopped until a routing slot is picked on the app page">
        <StatusBadge text="no domain" tone="warn" />
      </span>
    ),
    port: a.port || "-",
    git: autoCheck && isImageApp ? (
      <ImageStatusBadge
        appName={a.name}
        status={imageStatuses.get(a.name)}
        updateAction={updateAppAction}
      />
    ) : autoCheck ? (
      <GitStatusBadge
        appName={a.name}
        status={gitStatuses.get(a.name)}
        isExternal={isExternal}
        updateAction={updateAppAction}
        refreshAction={refreshGitStatusAction}
        docker={a.docker_build}
      />
    ) : isExternal ? (
      <span className={styles.muted}>—</span>
    ) : (
      <CheckStatusCell
        appName={a.name}
        imageApp={isImageApp}
        docker={a.docker_build}
        updateAction={updateAppAction}
        refreshGitAction={refreshGitStatusAction}
        refreshImageAction={refreshImageStatusAction}
      />
    ),
    status: <StatusBadge text={statusText} />,
    actions: isExternal ? (
      hasUnit ? (
        <div style={{ display: "flex", gap: 6 }}>
          <ActionForm action={restartExternalAppAction.bind(null, a.name)}>
            <button type="submit" className={styles.btnGhost}>
              Restart
            </button>
          </ActionForm>
          <Link
            href={`/apps/${encodeURIComponent(a.name)}`}
            className={styles.btnGhost}
          >
            Open
          </Link>
        </div>
      ) : (
        <Link
          href={`/apps/${encodeURIComponent(a.name)}`}
          className={styles.btnGhost}
          title="Set up panel management for this folder"
        >
          Open
        </Link>
      )
    ) : (
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <Link
          href={`/apps/${encodeURIComponent(a.name)}`}
          className={styles.btnGhost}
        >
          Open
        </Link>
        {folderMeta && (
          <MoveToFolderButton
            appName={a.name}
            currentFolderId={folderMeta.currentFolderId}
            folders={folderMeta.folders}
            moveAction={setAppFolderAction.bind(null, a.name)}
          />
        )}
      </div>
    ),
  };
}

export default async function AppsPage() {
  const session = await requireSession();
  if (!hasPermission(session, "apps")) {
    return (
      <AccessRestricted
        title="Apps access restricted"
        message="You do not have permission to view or deploy applications. Ask an administrator to grant Apps & Deployments access."
      />
    );
  }

  const isAdmin = isAdminRole(session.role);
  const isScopedApps = !isAdmin && (session.permissions.scopes?.apps?.length ?? 0) > 0;

  const [autoCheck, n8nAutoCheck] = await Promise.all([
    getAutoCheckUpdates(),
    getN8nAutoCheck(),
  ]);

  const [rawApps, recipes, addr, folders, folderAssignments, tsStatus, comments] =
    await Promise.all([
      agent.apps.list().catch(() => []),
      isAdmin
        ? agent.quickInstall.list({ checkUpdates: n8nAutoCheck }).catch(() => [])
        : Promise.resolve([]),
      getServerAddress(),
      listAppFolders(),
      listAppFolderAssignments(),
      isAdmin ? agent.tailscale.status().catch(() => null) : Promise.resolve(null),
      listAppComments(),
    ]);

  const apps = rawApps.filter((a) => isAppAllowed(session, a.name));
  const serverAddress = addr.domain ?? addr.ip ?? null;
  const tailscale =
    isAdmin && recipes.some((r) => r.slug === "tailscale" && r.installed)
      ? { card: tailscaleCard(tsStatus), canManage: true }
      : null;

  const gitStatuses = new Map<string, GitStatusResp>();
  const imageStatuses = new Map<string, DockerImageStatus>();
  if (autoCheck) {
    const imageFetches = apps
      .filter((a) => a.runtime === "docker" && !a.docker_build)
      .map(async (a) => {
        try {
          imageStatuses.set(a.name, await agent.apps.imageStatus(a.name));
        } catch {
          // leave unset
        }
      });
    const fetches = apps
      .filter((a) => a.kind !== "external" && !(a.runtime === "docker" && !a.docker_build) && a.source_dir)
      .map(async (a) => {
        try {
          const status = await agent.apps.gitStatus(a.name);
          gitStatuses.set(a.name, status);
        } catch {
          // leave unset
        }
      });
    await Promise.all([...fetches, ...imageFetches]);
  }

  const orphans = apps.filter(
    (a) =>
      a.kind !== "external" &&
      !(a.runtime === "docker" && !a.docker_build) &&
      (a.source_dir_state === "missing" || a.source_dir_state === "empty"),
  );

  const panelApps = apps.filter((a) => a.kind !== "external");
  const externalApps = apps.filter((a) => a.kind === "external");
  const folderList = isScopedApps
    ? []
    : folders.map((f) => ({ id: f.id, name: f.name }));

  const inFolder = (folderId: number) =>
    panelApps.filter((a) => folderAssignments[a.name] === folderId);
  const visibleFolders = isScopedApps
    ? folders.filter((f) => inFolder(f.id).length > 0)
    : folders;
  const ungrouped = panelApps.filter(
    (a) =>
      folderAssignments[a.name] === null ||
      folderAssignments[a.name] === undefined,
  );

  return (
    <div>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Apps</h1>
          <div className={styles.subtitle}>
            Node.js, Python, PHP, Go, Bun, Rust, Java, Ruby, .NET &amp; Docker apps — managed by systemd, served by nginx.
          </div>
          {isAdmin && (
            <AutoUpdateCheckToggle
              enabled={autoCheck}
              action={setAutoCheckUpdatesAction}
            />
          )}
        </div>
        <div className={styles.actions}>
          {!isScopedApps && <NewFolderButton action={createAppFolderAction} />}
          <DeployMethodButton />
        </div>
      </div>

      {orphans.length > 0 && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            background: "rgba(255, 196, 0, 0.08)",
            border: "1px solid rgba(255, 196, 0, 0.32)",
            borderRadius: 8,
            fontSize: 13,
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>⚠️</span>
          <div>
            <strong>
              {orphans.length === 1
                ? `1 app has no source code on disk`
                : `${orphans.length} apps have no source code on disk`}
            </strong>{" "}
            ({orphans.map((a) => a.name).join(", ")}). Their systemd unit
            won&apos;t start until code is back in place: re-deploy each one under
            the same name from <strong>+ Deploy app</strong> (the pull stage clones
            into the empty folder), or copy the code back into its folder.
          </div>
        </div>
      )}

      {panelApps.length === 0 && externalApps.length === 0 && visibleFolders.length === 0 ? (
        <div className={styles.empty}>
          No apps deployed yet. Click <strong>+ Deploy app</strong> to add one.
        </div>
      ) : (
        <>
          {visibleFolders.map((f) => {
            const folderApps = inFolder(f.id);
            return (
              <AppFolderSection
                key={f.id}
                folder={{ id: f.id, name: f.name, collapsed: f.collapsed }}
                columns={COLUMNS}
                rows={folderApps.map((a) =>
                  buildAppRow(
                    a,
                    gitStatuses,
                    imageStatuses,
                    comments,
                    isScopedApps ? null : { currentFolderId: f.id, folders: folderList },
                    autoCheck,
                  ),
                )}
                empty="No apps in this folder. Use the folder picker on any panel-managed app to move it here."
                renameAction={renameAppFolderAction.bind(null, f.id)}
                deleteAction={deleteAppFolderAction.bind(null, f.id)}
                toggleCollapsedAction={toggleAppFolderCollapsedAction.bind(null, f.id)}
              />
            );
          })}

          {(ungrouped.length > 0 || visibleFolders.length === 0) && (
            <AppFolderSection
              folder={null}
              fallbackLabel="Ungrouped"
              columns={COLUMNS}
              rows={ungrouped.map((a) =>
                buildAppRow(
                  a,
                  gitStatuses,
                  imageStatuses,
                  comments,
                  isScopedApps ? null : { currentFolderId: null, folders: folderList },
                  autoCheck,
                ),
              )}
              empty={
                visibleFolders.length === 0
                  ? "No panel-managed apps yet. Click + Deploy app to add one."
                  : "Every panel-managed app is in a folder."
              }
            />
          )}

          {externalApps.length > 0 && (
            <AppFolderSection
              folder={null}
              fallbackLabel="External"
              columns={COLUMNS}
              rows={externalApps.map((a) =>
                buildAppRow(a, gitStatuses, imageStatuses, comments, null, autoCheck),
              )}
              empty="No external apps."
            />
          )}
        </>
      )}

      {isAdmin && (
        <div style={{ marginTop: 24 }}>
          <QuickInstallStrip
            recipes={recipes}
            serverAddress={serverAddress}
            heading="1-Click App Store & Services"
            hint="Install runtimes, CMS, AI, analytics, monitoring & database apps in 1 click — then click Deploy App → or Route →."
            installAction={quickInstallAction}
            bindAction={setBindAction}
            getRoundcubeSettings={getRoundcubeSettingsAction}
            updateRoundcubeSettings={updateRoundcubeSettingsAction}
            getN8nSettings={getN8nSettingsAction}
            updateN8nSettings={updateN8nSettingsAction}
            updateN8n={updateN8nAction}
            n8nAutoCheck={n8nAutoCheck}
            setN8nAutoCheck={setN8nAutoCheckAction}
            getPhpMyAdminSettings={getPhpMyAdminSettingsAction}
            updatePhpMyAdminSettings={updatePhpMyAdminSettingsAction}
            showRouteButton={true}
            tailscale={tailscale}
          />
        </div>
      )}
    </div>
  );
}
