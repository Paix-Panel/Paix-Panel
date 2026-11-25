"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { QuickInstallRecipe, ScaleStatus } from "@/lib/agent";
import StatusBadge from "@/components/StatusBadge/StatusBadge";
import QuickInstallStrip from "@/components/QuickInstallStrip/QuickInstallStrip";
import { applyScaleProfileAction, type ApplyScaleResult } from "@/server-actions/scale";
import {
  quickInstallAction,
  setBindAction,
  getRoundcubeSettingsAction,
  updateRoundcubeSettingsAction,
  getN8nSettingsAction,
  updateN8nSettingsAction,
  getPhpMyAdminSettingsAction,
  updatePhpMyAdminSettingsAction,
} from "@/server-actions/quickInstall";
import shared from "@/components/page.module.css";
import styles from "./scale.module.css";

type Props = {
  initialScale: ScaleStatus | null;
  initialError: string | null;
  recipes: QuickInstallRecipe[];
  serverAddress: string | null;
};

const SCALE_ADDON_SET = new Set([
  "valkey",
  "memcached",
  "redis",
  "minio",
  "clickhouse",
  "meilisearch",
  "qdrant",
  "k3s",
  "docker",
]);

function formatMb(mb: number): string {
  if (mb >= 1024) {
    const gb = mb / 1024;
    return `${gb % 1 === 0 ? gb.toFixed(0) : gb.toFixed(1)} GB`;
  }
  return `${mb} MB`;
}

export default function ScaleClient({
  initialScale,
  initialError,
  recipes,
  serverAddress,
}: Props) {
  const [scaleState, formAction, isPending] = useActionState<
    ApplyScaleResult | null,
    FormData
  >(applyScaleProfileAction, null);
  const [activeProfile, setActiveProfile] = useState<string | null>(null);

  const scale = scaleState?.ok ? scaleState.status : initialScale;
  const addonRecipes = recipes.filter((r) => SCALE_ADDON_SET.has(r.slug));
  const installedAddons = addonRecipes.filter((r) => r.installed);

  const isInstalled = (slug: string) =>
    recipes.some((r) => r.slug === slug && r.installed);

  const enabledProfilesCount =
    scale?.profiles.filter((p) => p.enabled).length ?? 0;

  return (
    <div>
      <div className={shared.head}>
        <div>
          <h1 className={shared.title}>Performance, Scale &amp; Addons</h1>
          <div className={shared.subtitle}>
            High-concurrency kernel tuning, Nginx micro-caching, ultra-fast
            in-memory caches, and massive big-data / S3 object storage addons.
          </div>
        </div>
        <div className={shared.actions}>
          <form
            action={formAction}
            onSubmit={() => setActiveProfile("all")}
          >
            <input type="hidden" name="profile" value="all" />
            <input type="hidden" name="enable" value="true" />
            <button
              type="submit"
              className={shared.btn}
              disabled={isPending || !scale}
            >
              {isPending && activeProfile === "all"
                ? "Applying tuning..."
                : "Enable all turbo profiles"}
            </button>
          </form>
        </div>
      </div>

      {initialError && (
        <div className={shared.error}>{initialError}</div>
      )}
      {scaleState?.ok === false && (
        <div className={shared.error}>{scaleState.error}</div>
      )}
      {scaleState?.ok === true && (
        <div className={shared.notice}>{scaleState.message}</div>
      )}

      {scale && (
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Host compute</div>
            <div className={styles.statValue}>
              {scale.cpu_cores} vCPU · {formatMb(scale.ram_total_mb)}
            </div>
            <div className={styles.statHint}>
              {enabledProfilesCount} of {scale.profiles.filter((p) => p.available).length} host turbo profiles active
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statLabel}>Network congestion</div>
            <div className={styles.statValue}>
              {scale.tcp_congestion_control.toUpperCase()}
            </div>
            <div className={styles.statHint}>
              {scale.tcp_congestion_control === "bbr"
                ? "TCP BBR high-throughput active"
                : scale.bbr_available
                  ? "BBR supported — enable Kernel BBR below"
                  : "Kernel congestion control"}
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statLabel}>Socket backlog &amp; files</div>
            <div className={styles.statValue}>
              {scale.somaxconn.toLocaleString()}
            </div>
            <div className={styles.statHint}>
              fs.file-max: {scale.file_max.toLocaleString()}
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statLabel}>Speed &amp; data addons</div>
            <div className={styles.statValue}>
              {installedAddons.length} / {addonRecipes.length}
            </div>
            <div className={styles.statHint}>
              Cache, S3 object, columnar analytics, search &amp; K3s
            </div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 20 }}>
        <QuickInstallStrip
          recipes={addonRecipes}
          serverAddress={serverAddress}
          heading="One-click speed & massive storage addons"
          hint="Install high-speed caches (Valkey, Redis, Memcached), S3 storage (MinIO), ClickHouse big-data analytics, Meilisearch, Qdrant, and K3s cluster."
          installAction={quickInstallAction}
          bindAction={setBindAction}
          getRoundcubeSettings={getRoundcubeSettingsAction}
          updateRoundcubeSettings={updateRoundcubeSettingsAction}
          getN8nSettings={getN8nSettingsAction}
          updateN8nSettings={updateN8nSettingsAction}
          getPhpMyAdminSettings={getPhpMyAdminSettingsAction}
          updatePhpMyAdminSettings={updatePhpMyAdminSettingsAction}
          showRouteButton={true}
        />
      </div>

      {scale && (
        <section className={shared.section}>
          <h2 className={shared.sectionTitle}>
            System, Edge &amp; Database Turbo Tuning
          </h2>
          <div className={styles.profileGrid}>
            {scale.profiles.map((p) => {
              const busyThis = isPending && activeProfile === p.id;
              return (
                <div key={p.id} className={styles.profileCard}>
                  <div>
                    <div className={styles.profileTop}>
                      <div className={styles.profileTitle}>{p.label}</div>
                      <StatusBadge
                        text={!p.available ? "not installed" : p.enabled ? "active" : "default"}
                        tone={!p.available ? "muted" : p.enabled ? "ok" : "warn"}
                      />
                    </div>
                    <div className={styles.profileSummary}>{p.summary}</div>
                  </div>
                  <div>
                    <div className={styles.profileMeta}>{p.detail}</div>
                    <div className={styles.profileFoot} style={{ marginTop: 10 }}>
                      <span className={shared.muted} style={{ fontSize: 12 }}>
                        {!p.available
                          ? "Install engine first"
                          : p.enabled
                            ? "Managed drop-in active"
                            : "Stock OS defaults"}
                      </span>
                      {p.available && (
                        <form
                          action={formAction}
                          onSubmit={() => setActiveProfile(p.id)}
                        >
                          <input type="hidden" name="profile" value={p.id} />
                          <input
                            type="hidden"
                            name="enable"
                            value={p.enabled ? "false" : "true"}
                          />
                          <button
                            type="submit"
                            className={p.enabled ? shared.btnGhost : shared.btn}
                            disabled={isPending}
                          >
                            {busyThis
                              ? "Working..."
                              : p.enabled
                                ? "Disable"
                                : "Enable"}
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <pre className={styles.codeBlock}>
{`# Optional: enable Nginx shared micro-cache inside any custom vhost location block (zone: paix_cache)
proxy_cache paix_cache;
proxy_cache_valid 200 301 302 1m;
proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
add_header X-Cache-Status $upstream_cache_status;`}
          </pre>
        </section>
      )}

      <section className={shared.section}>
        <h2 className={shared.sectionTitle}>
          20M+ Users &amp; Massive Data Blueprint
        </h2>
        <div className={styles.blueprintGrid}>
          <div className={styles.blueprintCard}>
            <div className={styles.blueprintHead}>
              <span className={styles.blueprintStep}>Layer 1 · Edge &amp; Network</span>
              <StatusBadge
                text={scale?.tcp_congestion_control === "bbr" ? "BBR on" : "Ready"}
                tone={scale?.tcp_congestion_control === "bbr" ? "ok" : "muted"}
              />
            </div>
            <div className={styles.blueprintTitle}>CDN + TCP BBR + Nginx Cache</div>
            <div className={styles.blueprintDesc}>
              Serve 90%+ of static media and cacheable API GET traffic at the edge (Cloudflare CDN) + Nginx <code className={shared.code}>paix_cache</code> so origin CPUs only process uncached requests.
            </div>
          </div>

          <div className={styles.blueprintCard}>
            <div className={styles.blueprintHead}>
              <span className={styles.blueprintStep}>Layer 2 · Sub-ms Cache</span>
              <StatusBadge
                text={
                  isInstalled("valkey") || isInstalled("redis") || isInstalled("memcached")
                    ? "Active"
                    : "Install"
                }
                tone={
                  isInstalled("valkey") || isInstalled("redis") || isInstalled("memcached")
                    ? "ok"
                    : "warn"
                }
              />
            </div>
            <div className={styles.blueprintTitle}>Valkey · Redis · Memcached</div>
            <div className={styles.blueprintDesc}>
              Keep sessions, rate limits, queues, and hot database queries in RAM for &lt;1ms response times under heavy spikes.
            </div>
            <div className={styles.endpointList}>
              <div className={styles.endpointRow}>
                <span>Valkey</span>
                <code className={shared.code}>127.0.0.1:6380</code>
              </div>
              <div className={styles.endpointRow}>
                <span>Redis</span>
                <code className={shared.code}>127.0.0.1:6379</code>
              </div>
              <div className={styles.endpointRow}>
                <span>Memcached</span>
                <code className={shared.code}>127.0.0.1:11211</code>
              </div>
            </div>
          </div>

          <div className={styles.blueprintCard}>
            <div className={styles.blueprintHead}>
              <span className={styles.blueprintStep}>Layer 3 · Massive Data</span>
              <StatusBadge
                text={
                  isInstalled("minio") || isInstalled("clickhouse") || isInstalled("meilisearch")
                    ? "Active"
                    : "Install"
                }
                tone={
                  isInstalled("minio") || isInstalled("clickhouse") || isInstalled("meilisearch")
                    ? "ok"
                    : "warn"
                }
              />
            </div>
            <div className={styles.blueprintTitle}>MinIO S3 · ClickHouse · Meilisearch</div>
            <div className={styles.blueprintDesc}>
              Offload TB-scale media to MinIO S3, store billions of analytics events in ClickHouse columnar tables, and run sub-50ms search in Meilisearch.
            </div>
            <div className={styles.endpointList}>
              <div className={styles.endpointRow}>
                <span>MinIO S3 API / UI</span>
                <code className={shared.code}>:9000 / :9001</code>
              </div>
              <div className={styles.endpointRow}>
                <span>ClickHouse HTTP / TCP</span>
                <code className={shared.code}>:8123 / :9004</code>
              </div>
              <div className={styles.endpointRow}>
                <span>Meilisearch</span>
                <code className={shared.code}>127.0.0.1:7700</code>
              </div>
            </div>
          </div>

          <div className={styles.blueprintCard}>
            <div className={styles.blueprintHead}>
              <span className={styles.blueprintStep}>Layer 4 · Horizontal Scale</span>
              <StatusBadge
                text={isInstalled("k3s") ? "K3s Active" : "Multi-Node"}
                tone={isInstalled("k3s") ? "ok" : "muted"}
              />
            </div>
            <div className={styles.blueprintTitle}>K3s Cluster + My Networks</div>
            <div className={styles.blueprintDesc}>
              A single VPS handles thousands of req/sec cleanly; reaching 20M+ global users scales horizontally by linking extra nodes over <Link href="/networks" className={shared.code}>My Networks</Link> and running replicas on K3s.
            </div>
            <div className={styles.endpointList}>
              <div className={styles.endpointRow}>
                <span>K3s API</span>
                <code className={shared.code}>:6443</code>
              </div>
              <div className={styles.endpointRow}>
                <span>Qdrant Vectors</span>
                <code className={shared.code}>:6333 / :6334</code>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
