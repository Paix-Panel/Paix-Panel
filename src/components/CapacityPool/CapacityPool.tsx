import { Cpu, HardDrive, MemoryStick, Server } from "lucide-react";
import type { HostCapacitySummary } from "@/lib/provisioning";
import pageStyles from "@/components/page.module.css";
import styles from "./CapacityPool.module.css";

function fmtRam(mb: number): string {
  if (mb >= 1024) {
    const gb = mb / 1024;
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
  }
  return `${mb} MB`;
}

function pct(used: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((used / total) * 100));
}

function fillClass(p: number): string {
  if (p >= 90) return `${styles.fill} ${styles.fillDanger}`;
  if (p >= 75) return `${styles.fill} ${styles.fillWarn}`;
  return styles.fill;
}

export default function CapacityPool({
  capacity,
  title = "Host Capacity Pool & Real-Time Deductions",
}: {
  capacity: HostCapacitySummary;
  title?: string;
}) {
  const cpuUsed = capacity.allocated.cpuCores + capacity.reserved.cpuCores;
  const cpuPct = pct(cpuUsed, capacity.hardware.cpuCores);
  const ramUsed = capacity.allocated.ramMb + capacity.reserved.ramMb;
  const ramPct = pct(ramUsed, capacity.hardware.ramMb);
  const diskUsed = capacity.allocated.storageGb + capacity.reserved.storageGb;
  const diskPct = pct(diskUsed, capacity.hardware.storageGb);

  return (
    <div className={pageStyles.section}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <h2 className={pageStyles.sectionTitle} style={{ margin: 0 }}>
          {title}
        </h2>
        <span className={styles.poolMeta}>
          Primary IP {capacity.serverIp} · Active VPS {capacity.allocated.activeVpsCount} · Active
          Hosting {capacity.allocated.activeHostingCount}
        </span>
      </div>

      <div className={styles.poolGrid}>
        <div className={styles.poolCard}>
          <div className={styles.poolTop}>
            <span className={styles.poolLabel}>
              <Cpu size={14} aria-hidden="true" />
              CPU Pool Available
            </span>
            <span className={styles.poolPct}>{cpuPct}% allocated</span>
          </div>
          <div className={styles.poolValue}>
            {capacity.available.cpuCores} / {capacity.hardware.cpuCores} vCPU
          </div>
          <div className={styles.track}>
            <div className={fillClass(cpuPct)} style={{ width: `${cpuPct}%` }} />
          </div>
          <div className={styles.poolMeta}>
            VPS {capacity.allocated.vpsCpuCores} · Hosting {capacity.allocated.hostingCpuCores}
            {capacity.reserved.cpuCores > 0 ? ` · OS Reserve ${capacity.reserved.cpuCores}` : ""}
          </div>
        </div>

        <div className={styles.poolCard}>
          <div className={styles.poolTop}>
            <span className={styles.poolLabel}>
              <MemoryStick size={14} aria-hidden="true" />
              RAM Pool Available
            </span>
            <span className={styles.poolPct}>{ramPct}% allocated</span>
          </div>
          <div className={styles.poolValue}>
            {fmtRam(capacity.available.ramMb)} / {fmtRam(capacity.hardware.ramMb)}
          </div>
          <div className={styles.track}>
            <div className={fillClass(ramPct)} style={{ width: `${ramPct}%` }} />
          </div>
          <div className={styles.poolMeta}>
            VPS {fmtRam(capacity.allocated.vpsRamMb)} · Hosting {fmtRam(capacity.allocated.hostingRamMb)}
            {capacity.reserved.ramMb > 0 ? ` · OS Reserve ${fmtRam(capacity.reserved.ramMb)}` : ""}
          </div>
        </div>

        <div className={styles.poolCard}>
          <div className={styles.poolTop}>
            <span className={styles.poolLabel}>
              <HardDrive size={14} aria-hidden="true" />
              Storage Pool Available
            </span>
            <span className={styles.poolPct}>{diskPct}% allocated</span>
          </div>
          <div className={styles.poolValue}>
            {capacity.available.storageGb} / {capacity.hardware.storageGb} GB
          </div>
          <div className={styles.track}>
            <div className={fillClass(diskPct)} style={{ width: `${diskPct}%` }} />
          </div>
          <div className={styles.poolMeta}>
            VPS {capacity.allocated.vpsStorageGb} GB · Hosting{" "}
            {capacity.allocated.hostingStorageGb} GB · Physical free{" "}
            {capacity.hardware.storageFreeOnDiskGb} GB
          </div>
        </div>

        <div className={styles.poolCard}>
          <div className={styles.poolTop}>
            <span className={styles.poolLabel}>
              <Server size={14} aria-hidden="true" />
              Bandwidth & Tenants
            </span>
            <span className={styles.poolPct}>Quota Guard ON</span>
          </div>
          <div className={styles.poolValue}>
            {capacity.allocated.activeVpsCount + capacity.allocated.activeHostingCount} active
          </div>
          <div className={styles.track}>
            <div
              className={styles.fill}
              style={{
                width: `${Math.min(100, (capacity.allocated.activeVpsCount + capacity.allocated.activeHostingCount) * 15)}%`,
              }}
            />
          </div>
          <div className={styles.poolMeta}>
            Allocated BW {capacity.allocated.bandwidthGb} GB/mo · Suspended{" "}
            {capacity.allocated.suspendedVpsCount + capacity.allocated.suspendedHostingCount}
          </div>
        </div>
      </div>
    </div>
  );
}
