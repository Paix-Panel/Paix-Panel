"use client";

import { useEffect, useRef, useState } from "react";

type Props = { slug: string; size?: number };

// Render priority:
//   1. Try /public/icons/<slug>.svg — drop the vendor's official logo there
//      and it gets served instead of the inline stylized mark below.
//   2. If that 404s (file absent), fall back to the inline geometric icon
//      defined in this file.
// No manual registry to keep in sync — adding or removing a file in
// /public/icons/ flips the icon automatically.

export default function ServiceIcon({ slug, size = 36 }: Props) {
  const [staticFailed, setStaticFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // A 404 that lands before hydration never reaches onError (React attaches it
  // too late), which left a broken-image box: check the image once mounted.
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth === 0) setStaticFailed(true);
  }, []);

  if (!staticFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        ref={imgRef}
        src={`/icons/${slug}.svg`}
        alt=""
        width={size}
        height={size}
        style={{ display: "block", objectFit: "contain" }}
        onError={() => setStaticFailed(true)}
      />
    );
  }

  switch (slug) {
    case "mariadb":
      return <Cylinder size={size} color="#7fc4a8" />;
    case "postgresql":
      return <PostgresMark size={size} />;
    case "redis":
      return <Stacked size={size} color="#ff6a55" />;
    case "qdrant":
      return <VectorField size={size} />;
    case "docker":
      return <DockerMark size={size} />;
    case "nginx":
      return <NginxMark size={size} />;
    case "pgadmin":
      return <PgAdminMark size={size} />;
    case "phpmyadmin":
      return <PhpMyAdminMark size={size} />;
    case "roundcube":
      return <RoundcubeMark size={size} />;
    case "n8n":
      return <N8nMark size={size} />;
    case "pgvector":
      return <PgVectorMark size={size} />;
    case "tailscale":
      return <TailscaleMark size={size} />;
    case "valkey":
      return <ValkeyMark size={size} />;
    case "memcached":
      return <MemcachedMark size={size} />;
    case "minio":
      return <MinioMark size={size} />;
    case "clickhouse":
      return <ClickHouseMark size={size} />;
    case "meilisearch":
      return <MeiliMark size={size} />;
    case "k3s":
      return <K3sMark size={size} />;
    case "wordpress":
      return <WordPressMark size={size} />;
    case "ghost":
      return <GhostMark size={size} />;
    case "directus":
      return <DirectusMark size={size} />;
    case "nocodb":
      return <NocoDbMark size={size} />;
    case "nextcloud":
      return <NextcloudMark size={size} />;
    case "gitea":
      return <GiteaMark size={size} />;
    case "portainer":
      return <PortainerMark size={size} />;
    case "uptimekuma":
      return <UptimeKumaMark size={size} />;
    case "grafana":
      return <GrafanaMark size={size} />;
    case "prometheus":
      return <PrometheusMark size={size} />;
    case "dozzle":
      return <DozzleMark size={size} />;
    case "metabase":
      return <MetabaseMark size={size} />;
    case "openwebui":
      return <OpenWebUIMark size={size} />;
    case "ollama":
      return <OllamaMark size={size} />;
    case "flowise":
      return <FlowiseMark size={size} />;
    case "vaultwarden":
      return <VaultwardenMark size={size} />;
    case "filebrowser":
      return <FileBrowserMark size={size} />;
    case "jellyfin":
      return <JellyfinMark size={size} />;
    case "memos":
      return <MemosMark size={size} />;
    case "mongodb":
      return <MongoMark size={size} />;
    case "rabbitmq":
      return <RabbitMqMark size={size} />;
    case "adminer":
      return <AdminerMark size={size} />;
    case "ittools":
      return <ItToolsMark size={size} />;
    case "stirlingpdf":
      return <StirlingPdfMark size={size} />;
    case "nodejs":
      return <NodeJsMark size={size} />;
    case "python":
      return <PythonMark size={size} />;
    case "php":
      return <PhpMark size={size} />;
    case "golang":
      return <GoMark size={size} />;
    case "java":
      return <JavaMark size={size} />;
    case "ruby":
      return <RubyMark size={size} />;
    case "rust":
      return <RustMark size={size} />;
    case "bun":
      return <BunMark size={size} />;
    case "deno":
      return <DenoMark size={size} />;
    case "dotnet":
      return <DotnetMark size={size} />;
    case "pm2":
      return <Pm2Mark size={size} />;
    case "supervisor":
      return <SupervisorMark size={size} />;
    case "codeserver":
      return <CodeServerMark size={size} />;
    case "mailpit":
      return <MailpitMark size={size} />;
    case "pocketbase":
      return <PocketBaseMark size={size} />;
    case "syncthing":
      return <SyncthingMark size={size} />;
    case "homepage":
      return <HomepageMark size={size} />;
    case "dockerregistry":
      return <DockerRegistryMark size={size} />;
    default:
      return <Cylinder size={size} color="var(--text-dim)" />;
  }
}

function TailscaleMark({ size }: { size: number }) {
  // Tailscale's nine dots: the T (top row + middle column) solid, the rest faint.
  const solid = new Set(["0,0", "1,0", "2,0", "1,1", "1,2"]);
  const dots = [0, 1, 2].flatMap((y) => [0, 1, 2].map((x) => [x, y] as const));
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      {dots.map(([x, y]) => (
        <circle
          key={`${x},${y}`}
          cx={7 + x * 9}
          cy={7 + y * 9}
          r="3.4"
          fill="var(--text)"
          opacity={solid.has(`${x},${y}`) ? 1 : 0.25}
        />
      ))}
    </svg>
  );
}

function PgVectorMark({ size }: { size: number }) {
  // Postgres blue (matches PostgresMark) + an embedding-vector arrow with
  // scattered points, so it reads as "Postgres vectors" and stays visually
  // distinct from Qdrant's magenta VectorField.
  const color = "#6aa1ff";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <line
        x1="6"
        y1="26"
        x2="22"
        y2="8"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M22 8 l-5 1 M22 8 l-1 5"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="6" cy="26" r="2.4" fill={color} />
      <circle cx="12" cy="12" r="1.8" fill={color} opacity="0.7" />
      <circle cx="25" cy="20" r="1.8" fill={color} opacity="0.7" />
      <circle cx="26" cy="27" r="1.8" fill={color} opacity="0.5" />
    </svg>
  );
}

function N8nMark({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flex: "none", lineHeight: 1 }}
      aria-label="n8n"
      role="img"
    >
      <title>n8n</title>
      <path
        clipRule="evenodd"
        fillRule="evenodd"
        fill="#EA4B71"
        d="M24 8.4c0 1.325-1.102 2.4-2.462 2.4-1.146 0-2.11-.765-2.384-1.8h-3.436c-.602 0-1.115.424-1.214 1.003l-.101.592a2.38 2.38 0 01-.8 1.405c.412.354.704.844.8 1.405l.1.592A1.222 1.222 0 0015.719 15h.975c.273-1.035 1.237-1.8 2.384-1.8 1.36 0 2.461 1.075 2.461 2.4S20.436 18 19.078 18c-1.147 0-2.11-.765-2.384-1.8h-.975c-1.204 0-2.23-.848-2.428-2.005l-.101-.592a1.222 1.222 0 00-1.214-1.003H10.97c-.308.984-1.246 1.7-2.356 1.7-1.11 0-2.048-.716-2.355-1.7H4.817c-.308.984-1.246 1.7-2.355 1.7C1.102 14.3 0 13.225 0 11.9s1.102-2.4 2.462-2.4c1.183 0 2.172.815 2.408 1.9h1.337c.236-1.085 1.225-1.9 2.408-1.9 1.184 0 2.172.815 2.408 1.9h.952c.601 0 1.115-.424 1.213-1.003l.102-.592c.198-1.157 1.225-2.005 2.428-2.005h3.436c.274-1.035 1.238-1.8 2.384-1.8C22.898 6 24 7.075 24 8.4zm-1.23 0c0 .663-.552 1.2-1.232 1.2-.68 0-1.23-.537-1.23-1.2 0-.663.55-1.2 1.23-1.2.68 0 1.231.537 1.231 1.2zM2.461 13.1c.68 0 1.23-.537 1.23-1.2 0-.663-.55-1.2-1.23-1.2-.68 0-1.231.537-1.231 1.2 0 .663.55 1.2 1.23 1.2zm6.153 0c.68 0 1.231-.537 1.231-1.2 0-.663-.55-1.2-1.23-1.2-.68 0-1.231.537-1.231 1.2 0 .663.55 1.2 1.23 1.2zm10.462 3.7c.68 0 1.23-.537 1.23-1.2 0-.663-.55-1.2-1.23-1.2-.68 0-1.23.537-1.23 1.2 0 .663.55 1.2 1.23 1.2z"
      />
    </svg>
  );
}

function Cylinder({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <ellipse cx="16" cy="7" rx="10" ry="3" stroke={color} strokeWidth="2" />
      <path
        d="M6 7v18c0 1.66 4.48 3 10 3s10-1.34 10-3V7"
        stroke={color}
        strokeWidth="2"
      />
      <ellipse cx="16" cy="16" rx="10" ry="3" stroke={color} strokeWidth="1.5" opacity="0.5" />
      <ellipse cx="16" cy="22" rx="10" ry="3" stroke={color} strokeWidth="1.5" opacity="0.3" />
    </svg>
  );
}

function PostgresMark({ size }: { size: number }) {
  const color = "#6aa1ff";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="12" stroke={color} strokeWidth="2" />
      <path
        d="M12 9.5v13M12 9.5h6a3.5 3.5 0 010 7h-6"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Stacked({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M4 9l12-5 12 5-12 5L4 9z"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M4 16l12 5 12-5"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        opacity="0.7"
      />
      <path
        d="M4 23l12 5 12-5"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        opacity="0.4"
      />
    </svg>
  );
}

function VectorField({ size }: { size: number }) {
  const color = "var(--accent-glow)";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <line x1="8" y1="8" x2="16" y2="16" stroke={color} strokeWidth="1" opacity="0.5" />
      <line x1="24" y1="8" x2="16" y2="16" stroke={color} strokeWidth="1" opacity="0.5" />
      <line x1="8" y1="24" x2="16" y2="16" stroke={color} strokeWidth="1" opacity="0.5" />
      <line x1="24" y1="24" x2="16" y2="16" stroke={color} strokeWidth="1" opacity="0.5" />
      <circle cx="8" cy="8" r="2.5" fill={color} />
      <circle cx="24" cy="8" r="2.5" fill={color} />
      <circle cx="16" cy="16" r="3" fill={color} />
      <circle cx="8" cy="24" r="2.5" fill={color} />
      <circle cx="24" cy="24" r="2.5" fill={color} />
    </svg>
  );
}

function DockerMark({ size }: { size: number }) {
  const color = "#2496ed";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="6" y="14" width="3.5" height="3.5" fill={color} />
      <rect x="10.5" y="14" width="3.5" height="3.5" fill={color} />
      <rect x="15" y="14" width="3.5" height="3.5" fill={color} />
      <rect x="19.5" y="14" width="3.5" height="3.5" fill={color} />
      <rect x="10.5" y="9.5" width="3.5" height="3.5" fill={color} />
      <rect x="15" y="9.5" width="3.5" height="3.5" fill={color} />
      <rect x="19.5" y="9.5" width="3.5" height="3.5" fill={color} />
      <rect x="15" y="5" width="3.5" height="3.5" fill={color} />
      <path
        d="M25 19c1.5 0 2.5 1 2.5 2.5 0 2-1.5 4-5 4H8c-2.5 0-4-2-4-4.5"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function NginxMark({ size }: { size: number }) {
  const color = "#009639";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <polygon
        points="16,3 27,9.5 27,22.5 16,29 5,22.5 5,9.5"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M11 22 L11 10 L21 22 L21 10"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PgAdminMark({ size }: { size: number }) {
  const color = "#336791";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="4" y="6" width="24" height="20" rx="2" stroke={color} strokeWidth="2" />
      <line x1="4" y1="11" x2="28" y2="11" stroke={color} strokeWidth="1.5" />
      <circle cx="7" cy="8.5" r="0.8" fill={color} />
      <circle cx="9.5" cy="8.5" r="0.8" fill={color} />
      <circle cx="12" cy="8.5" r="0.8" fill={color} />
      <path
        d="M12 16v6M12 16h4a2.5 2.5 0 010 5h-4"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RoundcubeMark({ size }: { size: number }) {
  const color = "#37beff";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect
        x="4"
        y="8"
        width="24"
        height="17"
        rx="2"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M4 10 L16 19 L28 10"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="16.5" r="2.5" fill={color} opacity="0.25" />
    </svg>
  );
}

function PhpMyAdminMark({ size }: { size: number }) {
  const color = "#f29111";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="4" y="6" width="24" height="20" rx="2" stroke={color} strokeWidth="2" />
      <line x1="4" y1="11" x2="28" y2="11" stroke={color} strokeWidth="1.5" />
      <circle cx="7" cy="8.5" r="0.8" fill={color} />
      <circle cx="9.5" cy="8.5" r="0.8" fill={color} />
      <circle cx="12" cy="8.5" r="0.8" fill={color} />
      <ellipse cx="16" cy="15" rx="6" ry="1.5" stroke={color} strokeWidth="1.5" />
      <path
        d="M10 15v6c0 0.83 2.69 1.5 6 1.5s6-0.67 6-1.5v-6"
        stroke={color}
        strokeWidth="1.5"
      />
      <ellipse
        cx="16"
        cy="18"
        rx="6"
        ry="1.5"
        stroke={color}
        strokeWidth="1"
        opacity="0.6"
      />
    </svg>
  );
}

function ValkeyMark({ size }: { size: number }) {
  const color = "#7c9bff";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <polygon
        points="16,4 27,10 27,22 16,28 5,22 5,10"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M10.5 11.5L16 22l5.5-10.5" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MemcachedMark({ size }: { size: number }) {
  const color = "#38d9a9";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="4" y="6" width="24" height="20" rx="3" stroke={color} strokeWidth="2" />
      <path d="M9 20v-8l4.5 5 4.5-5v8" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 12v8" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function MinioMark({ size }: { size: number }) {
  const color = "#c72c48";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="4" y="6" width="24" height="20" rx="2.5" stroke={color} strokeWidth="2" />
      <path d="M9 21v-8l4 5 4-5v8M21 13v8" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="23.5" cy="10" r="1.5" fill={color} />
    </svg>
  );
}

function ClickHouseMark({ size }: { size: number }) {
  const color = "#ffcc00";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="5" y="7" width="3" height="18" rx="1" fill={color} />
      <rect x="10.5" y="7" width="3" height="18" rx="1" fill={color} />
      <rect x="16" y="7" width="3" height="18" rx="1" fill={color} />
      <rect x="21.5" y="7" width="3" height="18" rx="1" fill={color} opacity="0.7" />
      <rect x="26" y="12.5" width="2.5" height="7" rx="1" fill="#ff5555" />
    </svg>
  );
}

function MeiliMark({ size }: { size: number }) {
  const color = "#ff5caa";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="14" cy="14" r="8" stroke={color} strokeWidth="2" />
      <path d="M20 20l6.5 6.5" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M10.5 14l2.5-3.5L15.5 14l2.5-3.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function K3sMark({ size }: { size: number }) {
  const color = "#ffc61c";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <polygon
        points="16,3.5 27,9.5 27,22.5 16,28.5 5,22.5 5,9.5"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="16" r="4" stroke={color} strokeWidth="1.8" />
      <path d="M16 3.5V12M16 20V28.5M5 9.5L12.5 14M19.5 18L27 22.5M27 9.5L19.5 14M12.5 18L5 22.5" stroke={color} strokeWidth="1.4" opacity="0.75" />
    </svg>
  );
}

function WordPressMark({ size }: { size: number }) {
  const color = "#3897d3";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="12" stroke={color} strokeWidth="2" />
      <path d="M8.5 11.5L12.5 23L16 13.5L19.5 23L23.5 11.5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GhostMark({ size }: { size: number }) {
  const color = "#d2d8e6";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="6" y="7" width="9" height="4" rx="1.5" fill={color} />
      <rect x="17" y="7" width="9" height="4" rx="1.5" fill={color} opacity="0.6" />
      <rect x="6" y="14" width="20" height="4" rx="1.5" fill={color} opacity="0.85" />
      <rect x="6" y="21" width="13" height="4" rx="1.5" fill={color} opacity="0.6" />
      <rect x="21" y="21" width="5" height="4" rx="1.5" fill={color} />
    </svg>
  );
}

function DirectusMark({ size }: { size: number }) {
  const color = "#a855f7";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M6 18c2.5-6 8-9 14-8l4-3-1 5c2.5 2 3.5 5 3 8-2.5 3-7 5-13 5-3.5 0-6-2.5-7-7z" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <circle cx="19" cy="13.5" r="1.4" fill={color} />
    </svg>
  );
}

function NocoDbMark({ size }: { size: number }) {
  const color = "#6366f1";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="5" y="6" width="22" height="20" rx="2.5" stroke={color} strokeWidth="2" />
      <path d="M5 12.5H27M13 12.5V26M20 12.5V26" stroke={color} strokeWidth="1.6" />
    </svg>
  );
}

function NextcloudMark({ size }: { size: number }) {
  const color = "#0082c9";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="9.5" cy="16" r="4" stroke={color} strokeWidth="2" />
      <circle cx="16" cy="16" r="5.5" stroke={color} strokeWidth="2.2" />
      <circle cx="22.5" cy="16" r="4" stroke={color} strokeWidth="2" />
    </svg>
  );
}

function GiteaMark({ size }: { size: number }) {
  const color = "#609926";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M8 10h13a4 4 0 014 4v5a6 6 0 01-6 6h-5a6 6 0 01-6-6V10z" stroke={color} strokeWidth="2" />
      <path d="M25 12h2a2 2 0 010 4h-2" stroke={color} strokeWidth="2" />
      <circle cx="15" cy="18" r="2.5" stroke={color} strokeWidth="1.6" />
    </svg>
  );
}

function PortainerMark({ size }: { size: number }) {
  const color = "#13bef9";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="6" y="13" width="5" height="5" stroke={color} strokeWidth="1.8" />
      <rect x="13" y="13" width="5" height="5" stroke={color} strokeWidth="1.8" />
      <rect x="13" y="6" width="5" height="5" stroke={color} strokeWidth="1.8" />
      <path d="M5 21h22c-1 3.5-4.5 5.5-9.5 5.5h-4C9 26.5 6 24 5 21z" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function UptimeKumaMark({ size }: { size: number }) {
  const color = "#5cdd8b";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="11.5" stroke={color} strokeWidth="2" />
      <path d="M7 16h4.5l2.5-5 4 10 2.5-5H25" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GrafanaMark({ size }: { size: number }) {
  const color = "#f46800";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="10.5" stroke={color} strokeWidth="2" strokeDasharray="4 2" />
      <circle cx="16" cy="16" r="4.5" stroke={color} strokeWidth="2" />
      <path d="M16 5.5V9M16 23v3.5M5.5 16H9M23 16h3.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PrometheusMark({ size }: { size: number }) {
  const color = "#e6522c";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="11.5" stroke={color} strokeWidth="2" />
      <path d="M16 8c-2 2.8-4 5-4 8a4 4 0 008 0c0-3-2-5.2-4-8z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M10.5 23h11" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function DozzleMark({ size }: { size: number }) {
  const color = "#38bdf8";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="4" y="6" width="24" height="20" rx="2.5" stroke={color} strokeWidth="2" />
      <path d="M9 13l4 3-4 3M15 19h8" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MetabaseMark({ size }: { size: number }) {
  const color = "#509ee3";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="5" y="17" width="4.5" height="9" rx="1.5" fill={color} opacity="0.6" />
      <rect x="11.5" y="11" width="4.5" height="15" rx="1.5" fill={color} opacity="0.85" />
      <rect x="18" y="6" width="4.5" height="20" rx="1.5" fill={color} />
      <circle cx="25.5" cy="10" r="2.2" fill={color} />
    </svg>
  );
}

function OpenWebUIMark({ size }: { size: number }) {
  const color = "#a7f3d0";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M16 5l3 6.5L25.5 14 19 16.5 16 23l-3-6.5L6.5 14 13 11.5z" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <circle cx="24" cy="24" r="2.2" fill={color} />
    </svg>
  );
}

function OllamaMark({ size }: { size: number }) {
  const color = "#e2e8f0";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="8" y="10" width="16" height="15" rx="7" stroke={color} strokeWidth="2" />
      <path d="M11 10V6.5a1.5 1.5 0 013 0V10M18 10V6.5a1.5 1.5 0 013 0V10" stroke={color} strokeWidth="1.8" />
      <circle cx="13" cy="17" r="1.4" fill={color} />
      <circle cx="19" cy="17" r="1.4" fill={color} />
    </svg>
  );
}

function FlowiseMark({ size }: { size: number }) {
  const color = "#60a5fa";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="5" y="6" width="8" height="7" rx="2" stroke={color} strokeWidth="2" />
      <rect x="19" y="6" width="8" height="7" rx="2" stroke={color} strokeWidth="2" />
      <rect x="12" y="19" width="8" height="7" rx="2" stroke={color} strokeWidth="2" />
      <path d="M9 13v3h14v-3M16 16v3" stroke={color} strokeWidth="1.8" />
    </svg>
  );
}

function VaultwardenMark({ size }: { size: number }) {
  const color = "#4f8df9";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M16 4l10 4v8c0 6.2-4.2 10.6-10 12.5C10.2 26.6 6 22.2 6 16V8l10-4z" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <path d="M16 10v11M12 13h8" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function FileBrowserMark({ size }: { size: number }) {
  const color = "#22d3ee";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M4 9a2 2 0 012-2h6l2.5 3H26a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V9z" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <path d="M11 17h10" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function JellyfinMark({ size }: { size: number }) {
  const color = "#aa5cc3";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M16 4c-5 0-12 15-10 19s22 4 20 0S21 4 16 4z" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <polygon points="14,13 21,17 14,21" fill={color} />
    </svg>
  );
}

function MemosMark({ size }: { size: number }) {
  const color = "#fbbf24";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="6" y="5" width="20" height="22" rx="3" stroke={color} strokeWidth="2" />
      <path d="M10 11h12M10 16h12M10 21h7" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function MongoMark({ size }: { size: number }) {
  const color = "#47a248";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M16 4c5 5.5 7 11 7 15.5 0 4-3 7-7 8.5-4-1.5-7-4.5-7-8.5C9 15 11 9.5 16 4z" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <path d="M16 11v17" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function RabbitMqMark({ size }: { size: number }) {
  const color = "#ff6600";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M6 25V7h4v8h4V7h4v8h7v10H6z" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <circle cx="20.5" cy="19.5" r="1.5" fill={color} />
    </svg>
  );
}

function AdminerMark({ size }: { size: number }) {
  const color = "#7dd3fc";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <ellipse cx="16" cy="8" rx="9" ry="3" stroke={color} strokeWidth="2" />
      <path d="M7 8v15c0 1.7 4 3 9 3s9-1.3 9-3V8" stroke={color} strokeWidth="2" />
      <path d="M12 16l4 4 4-4" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ItToolsMark({ size }: { size: number }) {
  const color = "#10b981";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="4" y="6" width="24" height="20" rx="3" stroke={color} strokeWidth="2" />
      <path d="M10 13l-3 3 3 3M22 13l3 3-3 3M17.5 11l-3 10" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StirlingPdfMark({ size }: { size: number }) {
  const color = "#ef4444";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M8 4h11l5 5v19H8V4z" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <path d="M19 4v5h5" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M11 19h10M11 23h7" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function NodeJsMark({ size }: { size: number }) {
  const color = "#5fa04e";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <polygon points="16,3.5 27,9.5 27,22.5 16,28.5 5,22.5 5,9.5" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <path d="M11.5 20.5v-9l9 9v-9" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PythonMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M16 5c-4.5 0-4.5 2-4.5 4v2.5h9v1.5H9c-2.5 0-4.5 1.8-4.5 4.8s2 4.7 4.5 4.7h2V19c0-2 1.5-3.5 3.5-3.5h5c1.7 0 3-1.3 3-3V9c0-2-2-4-6.5-4z" stroke="#3776ab" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M16 27c4.5 0 4.5-2 4.5-4v-2.5h-9V19H23c2.5 0 4.5-1.8 4.5-4.8s-2-4.7-4.5-4.7h-2V13c0 2-1.5 3.5-3.5 3.5h-5c-1.7 0-3 1.3-3 3V23c0 2 2 4 6.5 4z" stroke="#ffd343" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="13.5" cy="8.5" r="1" fill="#3776ab" />
      <circle cx="18.5" cy="23.5" r="1" fill="#ffd343" />
    </svg>
  );
}

function PhpMark({ size }: { size: number }) {
  const color = "#777bb4";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <ellipse cx="16" cy="16" rx="13" ry="8" stroke={color} strokeWidth="2" />
      <path d="M8.5 19v-6h2.2a1.7 1.7 0 010 3.4H8.5M14 19v-6M14 16h3.5M17.5 13v6M21 19v-6h2.2a1.7 1.7 0 010 3.4H21" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GoMark({ size }: { size: number }) {
  const color = "#00add8";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M15 11.5a5.5 5.5 0 10-1 8.5h-3v-3h4" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <ellipse cx="22.5" cy="16" rx="4.5" ry="5.2" stroke={color} strokeWidth="2" />
      <path d="M5 13h4M4 16h3" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function JavaMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M9 17h12v4a5 5 0 01-5 5h-2a5 5 0 01-5-5v-4z" stroke="#f89820" strokeWidth="2" strokeLinejoin="round" />
      <path d="M21 18h2.5a2 2 0 010 4H21" stroke="#f89820" strokeWidth="1.8" />
      <path d="M13 13c0-2 2-2.5 2-4.5M17 13c0-2 2-2.5 2-4.5" stroke="#5382a1" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function RubyMark({ size }: { size: number }) {
  const color = "#cc342d";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <polygon points="9,7 23,7 28,13 16,26 4,13" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <path d="M4 13h24M9 7l3 6 4 13 4-13 3-6" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function RustMark({ size }: { size: number }) {
  const color = "#dea584";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="9.5" stroke={color} strokeWidth="2" strokeDasharray="3 2" />
      <path d="M12 21V11h5a3 3 0 010 6h-5M16 17l4 4" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BunMark({ size }: { size: number }) {
  const color = "#fbf0df";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <ellipse cx="16" cy="17.5" rx="11" ry="8" stroke={color} strokeWidth="2" />
      <path d="M12 10.5c1.5-2 6.5-2 8 0" stroke="#f472b6" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12.5" cy="16.5" r="1.3" fill={color} />
      <circle cx="19.5" cy="16.5" r="1.3" fill={color} />
      <path d="M14.5 19.5c1 .8 2 .8 3 0" stroke="#f472b6" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function DenoMark({ size }: { size: number }) {
  const color = "#70ffaf";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="11.5" stroke={color} strokeWidth="2" />
      <path d="M12 24v-6a4.5 4.5 0 019 0v1.5H17" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="17.5" cy="13.5" r="1.1" fill={color} />
    </svg>
  );
}

function DotnetMark({ size }: { size: number }) {
  const color = "#a78bfa";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="4" y="7" width="24" height="18" rx="3" stroke={color} strokeWidth="2" />
      <circle cx="9.5" cy="19" r="1.4" fill={color} />
      <path d="M13 20v-8l5 8v-8M21 12h4M23 12v8" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Pm2Mark({ size }: { size: number }) {
  const color = "#38bdf8";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="4" y="6" width="24" height="20" rx="3" stroke={color} strokeWidth="2" />
      <path d="M8 20v-7h3a2 2 0 010 4H8M15 20v-7l2.5 4 2.5-4v7M23 14.5a2 2 0 012 2c0 1.5-2.5 2-2.5 3.5H25" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SupervisorMark({ size }: { size: number }) {
  const color = "#fb923c";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="5" y="6" width="22" height="6" rx="1.5" stroke={color} strokeWidth="1.8" />
      <rect x="5" y="14" width="22" height="6" rx="1.5" stroke={color} strokeWidth="1.8" />
      <rect x="5" y="22" width="22" height="5" rx="1.5" stroke={color} strokeWidth="1.8" opacity="0.7" />
      <circle cx="9" cy="9" r="1.2" fill="#4ade80" />
      <circle cx="9" cy="17" r="1.2" fill="#4ade80" />
    </svg>
  );
}

function CodeServerMark({ size }: { size: number }) {
  const color = "#007acc";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M23 5l5 2.5v17L23 27l-13-11 13-11z" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <path d="M5 11l18 16M5 21L23 5" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function MailpitMark({ size }: { size: number }) {
  const color = "#fb7185";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="4" y="8" width="24" height="16" rx="2.5" stroke={color} strokeWidth="2" />
      <path d="M4 10l12 8 12-8" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24" cy="9" r="3" fill="#4ade80" />
    </svg>
  );
}

function PocketBaseMark({ size }: { size: number }) {
  const color = "#b8d0eb";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M5 8a2 2 0 012-2h18a2 2 0 012 2v10c0 5-5 8-11 8S5 23 5 18V8z" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 13v8M12 13h4a2.5 2.5 0 010 5h-4" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SyncthingMark({ size }: { size: number }) {
  const color = "#26b6db";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="11" stroke={color} strokeWidth="2" />
      <circle cx="16" cy="16" r="2.2" fill={color} />
      <circle cx="9" cy="12" r="2" fill={color} />
      <circle cx="23" cy="11" r="2" fill={color} />
      <circle cx="21" cy="23" r="2" fill={color} />
      <path d="M10.5 13l4 2M21.5 12l-4 3M19.8 21.3L17 17.5" stroke={color} strokeWidth="1.6" />
    </svg>
  );
}

function HomepageMark({ size }: { size: number }) {
  const color = "#38bdf8";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="5" y="6" width="9" height="9" rx="2" stroke={color} strokeWidth="2" />
      <rect x="18" y="6" width="9" height="9" rx="2" stroke={color} strokeWidth="2" />
      <rect x="5" y="18" width="9" height="8" rx="2" stroke={color} strokeWidth="2" />
      <rect x="18" y="18" width="9" height="8" rx="2" stroke={color} strokeWidth="2" opacity="0.65" />
    </svg>
  );
}

function DockerRegistryMark({ size }: { size: number }) {
  const color = "#60a5fa";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="5" y="6" width="22" height="6" rx="1.5" stroke={color} strokeWidth="1.8" />
      <rect x="5" y="14" width="22" height="6" rx="1.5" stroke={color} strokeWidth="1.8" />
      <rect x="5" y="22" width="22" height="5" rx="1.5" stroke={color} strokeWidth="1.8" />
      <path d="M21 9h3M21 17h3" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
