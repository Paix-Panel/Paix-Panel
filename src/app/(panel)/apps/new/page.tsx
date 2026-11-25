import Link from "next/link";
import { ArrowLeft, Container, FolderCode, GitBranch } from "lucide-react";
import AccessRestricted from "@/components/AccessRestricted/AccessRestricted";
import { requireSession } from "@/lib/auth";
import { hasPermission, isAdminRole, isDomainAllowed } from "@/lib/permissions";
import DeployForm from "./DeployForm";
import DockerForm from "./DockerForm";
import {
  checkAppSourceStateAction,
  deployAppAction,
  dockerBuildInfoAction,
  dockerImageInfoAction,
} from "@/server-actions/apps";
import { quickInstallAction } from "@/server-actions/quickInstall";
import { agent } from "@/lib/agent";
import { freeSlotsFor } from "@/lib/appSlots";
import styles from "@/components/page.module.css";

export const metadata = { title: "Deploy app" };

export const dynamic = "force-dynamic";

type PortSiteRow = {
  domain: string;
  upstream_port: number;
};

function ModeSwitcher({
  active,
  runtime,
}: {
  active: "github" | "manual" | "docker";
  runtime?: string;
}) {
  const runtimeQuery = runtime ? `&runtime=${encodeURIComponent(runtime)}` : "";
  const tabs: {
    key: "github" | "manual" | "docker";
    label: string;
    href: string;
    icon: React.ReactNode;
  }[] = [
    {
      key: "github",
      label: "GitHub / Git Repo",
      href: `/apps/new?method=github${runtimeQuery}`,
      icon: <GitBranch size={14} />,
    },
    {
      key: "manual",
      label: "Manual Folder",
      href: `/apps/new?method=manual${runtimeQuery}`,
      icon: <FolderCode size={14} />,
    },
    {
      key: "docker",
      label: "Docker Container",
      href: "/apps/new?method=docker",
      icon: <Container size={14} />,
    },
  ];

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
      {tabs.map((t) => {
        const isActive = active === t.key;
        return (
          <Link
            key={t.key}
            href={t.href}
            className={isActive ? styles.btn : styles.btnGhost}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              textDecoration: "none",
            }}
          >
            {t.icon}
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

export default async function NewAppPage({
  searchParams,
}: {
  searchParams: Promise<{ method?: string; runtime?: string }>;
}) {
  const session = await requireSession();
  if (!hasPermission(session, "apps")) {
    return (
      <AccessRestricted
        title="App deployment restricted"
        message="You do not have permission to deploy applications. Ask an administrator to grant Apps & Deployments access."
      />
    );
  }

  const sp = await searchParams;
  const sourceMethod = sp.method === "github" ? "github" : "manual";
  const isDocker = sp.method === "docker";
  const activeMode: "github" | "manual" | "docker" = isDocker
    ? "docker"
    : sourceMethod;

  const hasDomainScope =
    !isAdminRole(session.role) &&
    (session.permissions.scopes?.domains?.length ?? 0) > 0;
  const portSites: PortSiteRow[] = freeSlotsFor("")
    .filter((s) => !hasDomainScope || isDomainAllowed(session, s.domain))
    .map((s) => ({
      domain: s.domain,
      upstream_port: s.port,
    }));

  const rootKeypairs =
    sourceMethod === "github" || isDocker
      ? await agent.ssh
          .list("root")
          .then((rows) =>
            rows
              .filter((r) => r.authorized)
              .map((r) => r.keypair_name)
              .filter((n): n is string => !!n),
          )
          .catch(() => [])
      : [];

  if (isDocker) {
    const docker = await agent.docker
      .status()
      .catch(() => ({ installed: false, running: false, version: null }));
    return (
      <div>
        <Link href="/apps" className={styles.backArrow} aria-label="Back to apps">
          <ArrowLeft size={16} />
        </Link>
        <div className={styles.head}>
          <div>
            <h1 className={styles.title}>Deploy with Docker</h1>
            <div className={styles.subtitle}>
              Runs an image from a registry, or one built from your repository&apos;s
              Dockerfile, as a container with its own systemd service, published on 127.0.0.1
              and served on a port-mode site from{" "}
              <Link href="/domains">/domains</Link>.
            </div>
          </div>
        </div>
        <ModeSwitcher active="docker" runtime={sp.runtime} />
        <div className={styles.section}>
          <DockerForm
            mode="new"
            action={deployAppAction}
            imageInfo={dockerImageInfoAction}
            buildInfo={dockerBuildInfoAction}
            rootKeypairs={rootKeypairs}
            installDocker={quickInstallAction}
            portSites={portSites}
            docker={docker}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link href="/apps" className={styles.backArrow} aria-label="Back to apps">
        <ArrowLeft size={16} />
      </Link>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Deploy app</h1>
          <div className={styles.subtitle}>
            {sourceMethod === "github" ? (
              <>
                Cloning code from a GitHub repository into{" "}
                <span className={styles.code}>/srv/apps/&lt;name&gt;</span>,
                then starting it as a systemd unit attached to a port-mode
                site from <Link href="/domains">/domains</Link>.
              </>
            ) : (
              <>
                Pick a port-mode site from <Link href="/domains">/domains</Link>{" "}
                and the panel will deploy a systemd unit that fills it.
              </>
            )}
          </div>
        </div>
      </div>
      <ModeSwitcher active={activeMode} runtime={sp.runtime} />
      <div className={styles.section}>
        <DeployForm
          action={deployAppAction}
          checkSourceState={checkAppSourceStateAction}
          portSites={portSites}
          sourceMethod={sourceMethod}
          rootKeypairs={rootKeypairs}
          initialRuntime={sp.runtime}
        />
      </div>
    </div>
  );
}
