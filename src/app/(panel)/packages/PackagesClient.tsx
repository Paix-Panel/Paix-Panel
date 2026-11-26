"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Edit3, Plus, ShieldCheck, Trash2 } from "lucide-react";
import type { HostCapacitySummary, ServicePackageRow } from "@/lib/provisioning";
import type { PackageKind } from "@/lib/panelOffers";
import {
  createPackageAction,
  deletePackageAction,
  togglePackageActiveAction,
  updateHostReserveAction,
  updatePackageAction,
  type ActionResult,
} from "@/server-actions/packages";
import { useFormActionState } from "@/lib/useFormActionState";
import StatusBadge from "@/components/StatusBadge/StatusBadge";
import ConfirmDialog from "@/components/ConfirmDialog/ConfirmDialog";
import pageStyles from "@/components/page.module.css";
import styles from "./packages.module.css";

type PackageWithCounts = ServicePackageRow & {
  vps_count: number;
  hosting_count: number;
};

type FormDraft = {
  id: number | null;
  kind: PackageKind;
  name: string;
  slug: string;
  description: string;
  cpu_cores: string;
  ram_mb: string;
  storage_gb: string;
  swap_mb: string;
  bandwidth_gb: string;
  port_speed_mbps: string;
  max_domains: string;
  max_subdomains: string;
  max_apps: string;
  max_databases: string;
  max_mailboxes: string;
  mailbox_quota_mb: string;
  max_ftp_accounts: string;
  backup_slots: string;
  ssh_access: boolean;
  ssl_included: boolean;
  dedicated_ip: boolean;
  price_label: string;
  billing_cycle: string;
  is_active: boolean;
};

const EMPTY_VPS_DRAFT: FormDraft = {
  id: null,
  kind: "vps",
  name: "",
  slug: "",
  description: "",
  cpu_cores: "1",
  ram_mb: "2048",
  storage_gb: "60",
  swap_mb: "1024",
  bandwidth_gb: "2000",
  port_speed_mbps: "1000",
  max_domains: "0",
  max_subdomains: "0",
  max_apps: "0",
  max_databases: "0",
  max_mailboxes: "0",
  mailbox_quota_mb: "2048",
  max_ftp_accounts: "0",
  backup_slots: "5",
  ssh_access: true,
  ssl_included: true,
  dedicated_ip: true,
  price_label: "$15 / mo",
  billing_cycle: "monthly",
  is_active: true,
};

const TEMPLATES: { label: string; draft: Partial<FormDraft> }[] = [
  {
    label: "Starter VPS (0.5 vCPU · 1 GB · 40 GB)",
    draft: {
      kind: "vps",
      name: "Starter VPS",
      slug: "starter-vps",
      description: "Entry VPS with full SSH access and free Paix Panel or custom panel install.",
      cpu_cores: "0.5",
      ram_mb: "1024",
      storage_gb: "40",
      swap_mb: "512",
      bandwidth_gb: "1000",
      port_speed_mbps: "1000",
      max_domains: "0",
      max_subdomains: "0",
      max_apps: "0",
      max_databases: "0",
      max_mailboxes: "0",
      mailbox_quota_mb: "2048",
      max_ftp_accounts: "0",
      backup_slots: "5",
      ssh_access: true,
      ssl_included: true,
      dedicated_ip: true,
      price_label: "$9 / mo",
      billing_cycle: "monthly",
    },
  },
  {
    label: "Cloud VPS (1 vCPU · 4 GB · 100 GB)",
    draft: {
      kind: "vps",
      name: "Cloud VPS 4G",
      slug: "cloud-vps-4g",
      description: "Full-power VPS for cPanel/WHM, aaPanel, CyberPanel, or Paix Panel workloads.",
      cpu_cores: "1",
      ram_mb: "4096",
      storage_gb: "100",
      swap_mb: "2048",
      bandwidth_gb: "4000",
      port_speed_mbps: "1000",
      max_domains: "0",
      max_subdomains: "0",
      max_apps: "0",
      max_databases: "0",
      max_mailboxes: "0",
      mailbox_quota_mb: "5120",
      max_ftp_accounts: "0",
      backup_slots: "10",
      ssh_access: true,
      ssl_included: true,
      dedicated_ip: true,
      price_label: "$29 / mo",
      billing_cycle: "monthly",
    },
  },
  {
    label: "Shared Hosting Basic (20 GB · 2 Domains)",
    draft: {
      kind: "hosting",
      name: "Shared Hosting Basic",
      slug: "shared-hosting-basic",
      description: "Managed web hosting with Domains, SSL, Databases, Mailboxes & File Manager.",
      cpu_cores: "0.25",
      ram_mb: "256",
      storage_gb: "20",
      swap_mb: "0",
      bandwidth_gb: "500",
      port_speed_mbps: "1000",
      max_domains: "2",
      max_subdomains: "10",
      max_apps: "3",
      max_databases: "5",
      max_mailboxes: "10",
      mailbox_quota_mb: "1024",
      max_ftp_accounts: "3",
      backup_slots: "3",
      ssh_access: false,
      ssl_included: true,
      dedicated_ip: false,
      price_label: "$5 / mo",
      billing_cycle: "monthly",
    },
  },
  {
    label: "Business Hosting Pro (50 GB · SSH + 10 Domains)",
    draft: {
      kind: "hosting",
      name: "Business Hosting Pro",
      slug: "business-hosting-pro",
      description: "High-quota hosting with Node/Python/PHP apps, SSH terminal, backups & mailboxes.",
      cpu_cores: "0.5",
      ram_mb: "512",
      storage_gb: "50",
      swap_mb: "0",
      bandwidth_gb: "2500",
      port_speed_mbps: "1000",
      max_domains: "10",
      max_subdomains: "50",
      max_apps: "10",
      max_databases: "20",
      max_mailboxes: "50",
      mailbox_quota_mb: "2048",
      max_ftp_accounts: "10",
      backup_slots: "7",
      ssh_access: true,
      ssl_included: true,
      dedicated_ip: false,
      price_label: "$14 / mo",
      billing_cycle: "monthly",
    },
  },
];

function fmtLimit(val: string, unit = ""): string {
  const n = Number(val);
  if (!Number.isFinite(n) || n <= 0) return "Unlimited";
  return unit ? `${n} ${unit}` : String(n);
}

function fmtRam(mbStr: string): string {
  const mb = Number(mbStr);
  if (!Number.isFinite(mb) || mb <= 0) return "0 MB";
  if (mb >= 1024) {
    const gb = mb / 1024;
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
  }
  return `${mb} MB`;
}

function rowToDraft(pkg: PackageWithCounts, asCopy = false): FormDraft {
  return {
    id: asCopy ? null : pkg.id,
    kind: pkg.kind,
    name: asCopy ? `${pkg.name} Copy` : pkg.name,
    slug: asCopy ? `${pkg.slug}-copy` : pkg.slug,
    description: pkg.description,
    cpu_cores: String(pkg.cpu_cores),
    ram_mb: String(pkg.ram_mb),
    storage_gb: String(pkg.storage_gb),
    swap_mb: String(pkg.swap_mb),
    bandwidth_gb: String(pkg.bandwidth_gb),
    port_speed_mbps: String(pkg.port_speed_mbps),
    max_domains: String(pkg.max_domains),
    max_subdomains: String(pkg.max_subdomains),
    max_apps: String(pkg.max_apps),
    max_databases: String(pkg.max_databases),
    max_mailboxes: String(pkg.max_mailboxes),
    mailbox_quota_mb: String(pkg.mailbox_quota_mb),
    max_ftp_accounts: String(pkg.max_ftp_accounts),
    backup_slots: String(pkg.backup_slots),
    ssh_access: Boolean(pkg.ssh_access),
    ssl_included: Boolean(pkg.ssl_included),
    dedicated_ip: Boolean(pkg.dedicated_ip),
    price_label: pkg.price_label,
    billing_cycle: pkg.billing_cycle,
    is_active: Boolean(pkg.is_active),
  };
}

export default function PackagesClient({
  packages,
  capacity,
}: {
  packages: PackageWithCounts[];
  capacity: HostCapacitySummary;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<FormDraft>(EMPTY_VPS_DRAFT);
  const [filterKind, setFilterKind] = useState<"all" | PackageKind>("all");
  const [deleteTarget, setDeleteTarget] = useState<PackageWithCounts | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [reserveOpen, setReserveOpen] = useState(false);
  const [mutating, startMutate] = useTransition();

  const boundSave = useMemo(() => {
    if (draft.id !== null) {
      return updatePackageAction.bind(null, draft.id);
    }
    return createPackageAction;
  }, [draft.id]);

  const formRef = useRef<HTMLFormElement>(null);
  const [saveState, saveFormAction, savePending, keepRef] = useFormActionState<ActionResult | null>(
    boundSave,
    null,
    formRef,
  );

  const reserveRef = useRef<HTMLFormElement>(null);
  const [reserveState, reserveAction, reservePending, keepReserveRef] = useFormActionState<ActionResult | null>(
    updateHostReserveAction,
    null,
    reserveRef,
  );

  useEffect(() => {
    if (saveState?.ok === true) {
      router.refresh();
      if (draft.id === null) {
        setDraft((d) => ({ ...EMPTY_VPS_DRAFT, kind: d.kind }));
      }
    }
  }, [saveState, router, draft.id]);

  useEffect(() => {
    if (reserveState?.ok === true) {
      router.refresh();
      setReserveOpen(false);
    }
  }, [reserveState, router]);

  const reqCpu = Math.max(0, Number(draft.cpu_cores) || 0);
  const reqRam = Math.max(0, Number(draft.ram_mb) || 0);
  const reqStorage = Math.max(0, Number(draft.storage_gb) || 0);

  const fitCountCpu = reqCpu > 0 ? Math.floor(capacity.available.cpuCores / reqCpu) : 999;
  const fitCountRam = reqRam > 0 ? Math.floor(capacity.available.ramMb / reqRam) : 999;
  const fitCountDisk = reqStorage > 0 ? Math.floor(capacity.available.storageGb / reqStorage) : 999;
  const maxAccountsFit = Math.max(0, Math.min(fitCountCpu, fitCountRam, fitCountDisk));
  const exceedsRemaining =
    reqCpu > capacity.available.cpuCores + 1e-6 ||
    reqRam > capacity.available.ramMb ||
    reqStorage > capacity.available.storageGb;

  const filteredPackages = useMemo(() => {
    if (filterKind === "all") return packages;
    return packages.filter((p) => p.kind === filterKind);
  }, [packages, filterKind]);

  const updateField = <K extends keyof FormDraft>(key: K, value: FormDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div>
      {/* Guided Package Builder + Live Preview */}
      <div className={styles.studioGrid}>
        <div className={pageStyles.section}>
          <div className={styles.filterRow}>
            <div>
              <h2 className={pageStyles.sectionTitle} style={{ margin: 0 }}>
                {draft.id ? `Editing Package: ${draft.name}` : "Guided Package Builder"}
              </h2>
              <div className={pageStyles.muted} style={{ fontSize: 12, marginTop: 2 }}>
                Define compute, storage, bandwidth, and control-panel quotas for VPS or Hosting plans.
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {draft.id !== null && (
                <button
                  type="button"
                  className={pageStyles.btnGhost}
                  onClick={() => setDraft(EMPTY_VPS_DRAFT)}
                >
                  <Plus size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
                  New Package
                </button>
              )}
              <button
                type="button"
                className={pageStyles.btnGhost}
                onClick={() => setReserveOpen(true)}
              >
                <ShieldCheck size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
                OS Reserve
              </button>
            </div>
          </div>

          <div className={styles.presetRow}>
            {TEMPLATES.map((tpl) => (
              <button
                key={tpl.label}
                type="button"
                className={pageStyles.btnGhost}
                style={{ fontSize: 11, padding: "4px 9px" }}
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    ...tpl.draft,
                    id: prev.id,
                  }))
                }
              >
                Preset: {tpl.label}
              </button>
            ))}
          </div>

          <form ref={keepRef} action={saveFormAction}>
            <input type="hidden" name="kind" value={draft.kind} />
            {draft.id !== null && (
              <input type="hidden" name="is_active" value={draft.is_active ? "on" : ""} />
            )}

            {/* Step 1: Identity & Type */}
            <div className={styles.stepHeader}>
              <span className={styles.stepTitle}>01. Package Identity &amp; Type</span>
              <span className={styles.stepHint}>Choose VPS or Web Hosting plan</span>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div className={styles.segmented} role="group" aria-label="Package type">
                <button
                  type="button"
                  disabled={draft.id !== null}
                  className={`${styles.segBtn} ${draft.kind === "vps" ? styles.segBtnActive : ""}`}
                  onClick={() => updateField("kind", "vps")}
                >
                  VPS Server Package
                </button>
                <button
                  type="button"
                  disabled={draft.id !== null}
                  className={`${styles.segBtn} ${draft.kind === "hosting" ? styles.segBtnActive : ""}`}
                  onClick={() => updateField("kind", "hosting")}
                >
                  Web Hosting Package
                </button>
              </div>
            </div>

            <div className={pageStyles.formRow}>
              <label className={pageStyles.field}>
                Package Name
                <input
                  name="name"
                  className={pageStyles.input}
                  value={draft.name}
                  onChange={(e) => {
                    const nextName = e.target.value;
                    setDraft((prev) => ({
                      ...prev,
                      name: nextName,
                      slug:
                        prev.id === null
                          ? nextName
                              .toLowerCase()
                              .replace(/[^a-z0-9]+/g, "-")
                              .replace(/^-+|-+$/g, "")
                              .slice(0, 48)
                          : prev.slug,
                    }));
                  }}
                  placeholder={draft.kind === "vps" ? "e.g. VPS Gold 4G" : "e.g. Hosting Pro"}
                  required
                />
              </label>
              <label className={pageStyles.field}>
                Slug Identifier
                <input
                  name="slug"
                  className={`${pageStyles.input} ${styles.mono}`}
                  value={draft.slug}
                  readOnly={draft.id !== null}
                  onChange={(e) => updateField("slug", e.target.value)}
                  placeholder="vps-gold-4g"
                  required
                />
              </label>
            </div>

            <div className={pageStyles.formRow}>
              <label className={pageStyles.field}>
                Display Price Label
                <input
                  name="price_label"
                  className={pageStyles.input}
                  value={draft.price_label}
                  onChange={(e) => updateField("price_label", e.target.value)}
                  placeholder="e.g. $20 / mo or TZS 45,000 / mo"
                />
              </label>
              <label className={pageStyles.field}>
                Billing Cycle
                <select
                  name="billing_cycle"
                  className={pageStyles.select}
                  value={draft.billing_cycle}
                  onChange={(e) => updateField("billing_cycle", e.target.value)}
                >
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                  <option value="free">Free / Internal</option>
                  <option value="one-time">One-time</option>
                </select>
              </label>
            </div>

            <label className={pageStyles.field} style={{ marginBottom: 12 }}>
              Description
              <input
                name="description"
                className={pageStyles.input}
                value={draft.description}
                onChange={(e) => updateField("description", e.target.value)}
                placeholder="What this package includes and recommended workloads"
              />
            </label>

            {/* Step 2: Hardware & Compute */}
            <div className={styles.stepCard}>
              <div className={styles.stepHeader}>
                <span className={styles.stepTitle}>02. Hardware Pool Allocation (Deducted from Host)</span>
                <span className={styles.stepHint}>
                  Available: {capacity.available.cpuCores} vCPU · {fmtRam(String(capacity.available.ramMb))} ·{" "}
                  {capacity.available.storageGb} GB
                </span>
              </div>

              <div className={pageStyles.formRow}>
                <label className={pageStyles.field}>
                  CPU Cores (vCPU)
                  <input
                    name="cpu_cores"
                    type="number"
                    step="0.25"
                    min={draft.kind === "vps" ? "0.25" : "0"}
                    max="256"
                    className={`${pageStyles.input} ${styles.mono}`}
                    value={draft.cpu_cores}
                    onChange={(e) => updateField("cpu_cores", e.target.value)}
                    required
                  />
                  <div className={styles.miniChips}>
                    {["0.25", "0.5", "1", "2", "4"].map((v) => (
                      <button
                        key={v}
                        type="button"
                        className={styles.miniBtn}
                        onClick={() => updateField("cpu_cores", v)}
                      >
                        {v} vCPU
                      </button>
                    ))}
                  </div>
                </label>

                <label className={pageStyles.field}>
                  RAM Memory (MB)
                  <input
                    name="ram_mb"
                    type="number"
                    step="128"
                    min="64"
                    className={`${pageStyles.input} ${styles.mono}`}
                    value={draft.ram_mb}
                    onChange={(e) => updateField("ram_mb", e.target.value)}
                    required
                  />
                  <div className={styles.miniChips}>
                    {[
                      ["256", "256M"],
                      ["512", "512M"],
                      ["1024", "1G"],
                      ["2048", "2G"],
                      ["4096", "4G"],
                      ["8192", "8G"],
                    ].map(([val, lbl]) => (
                      <button
                        key={val}
                        type="button"
                        className={styles.miniBtn}
                        onClick={() => updateField("ram_mb", val)}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </label>

                <label className={pageStyles.field}>
                  Storage Quota (GB)
                  <input
                    name="storage_gb"
                    type="number"
                    min="1"
                    className={`${pageStyles.input} ${styles.mono}`}
                    value={draft.storage_gb}
                    onChange={(e) => updateField("storage_gb", e.target.value)}
                    required
                  />
                  <div className={styles.miniChips}>
                    {["10", "20", "40", "80", "100", "250"].map((v) => (
                      <button
                        key={v}
                        type="button"
                        className={styles.miniBtn}
                        onClick={() => updateField("storage_gb", v)}
                      >
                        {v}G
                      </button>
                    ))}
                  </div>
                </label>

                <label className={pageStyles.field}>
                  Swap Allocation (MB)
                  <input
                    name="swap_mb"
                    type="number"
                    min="0"
                    step="256"
                    className={`${pageStyles.input} ${styles.mono}`}
                    value={draft.swap_mb}
                    onChange={(e) => updateField("swap_mb", e.target.value)}
                  />
                </label>
              </div>
            </div>

            {/* Step 3: Bandwidth & Network */}
            <div className={styles.stepCard}>
              <div className={styles.stepHeader}>
                <span className={styles.stepTitle}>03. Bandwidth &amp; Network</span>
                <span className={styles.stepHint}>Enter 0 GB for Unlimited Bandwidth</span>
              </div>

              <div className={pageStyles.formRow}>
                <label className={pageStyles.field}>
                  Monthly Bandwidth (GB, 0 = Unlimited)
                  <input
                    name="bandwidth_gb"
                    type="number"
                    min="0"
                    className={`${pageStyles.input} ${styles.mono}`}
                    value={draft.bandwidth_gb}
                    onChange={(e) => updateField("bandwidth_gb", e.target.value)}
                    required
                  />
                  <div className={styles.miniChips}>
                    {[
                      ["500", "500 GB"],
                      ["1000", "1 TB"],
                      ["3000", "3 TB"],
                      ["0", "Unlimited"],
                    ].map(([val, lbl]) => (
                      <button
                        key={val}
                        type="button"
                        className={styles.miniBtn}
                        onClick={() => updateField("bandwidth_gb", val)}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </label>

                <label className={pageStyles.field}>
                  Network Port Speed (Mbps)
                  <input
                    name="port_speed_mbps"
                    type="number"
                    min="10"
                    className={`${pageStyles.input} ${styles.mono}`}
                    value={draft.port_speed_mbps}
                    onChange={(e) => updateField("port_speed_mbps", e.target.value)}
                  />
                  <div className={styles.miniChips}>
                    {[
                      ["100", "100 Mbps"],
                      ["1000", "1 Gbps"],
                      ["10000", "10 Gbps"],
                    ].map(([val, lbl]) => (
                      <button
                        key={val}
                        type="button"
                        className={styles.miniBtn}
                        onClick={() => updateField("port_speed_mbps", val)}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </label>
              </div>
            </div>

            {/* Step 4: Hosting & Control Panel Quotas */}
            <div className={styles.stepCard}>
              <div className={styles.stepHeader}>
                <span className={styles.stepTitle}>04. Account Quotas &amp; Panel Capabilities</span>
                <span className={styles.stepHint}>0 = Unlimited for domains/apps/DBs/mail</span>
              </div>

              <div className={pageStyles.formRow}>
                <label className={pageStyles.field}>
                  Max Domains
                  <input
                    name="max_domains"
                    type="number"
                    min="0"
                    className={`${pageStyles.input} ${styles.mono}`}
                    value={draft.max_domains}
                    onChange={(e) => updateField("max_domains", e.target.value)}
                  />
                </label>
                <label className={pageStyles.field}>
                  Max Subdomains
                  <input
                    name="max_subdomains"
                    type="number"
                    min="0"
                    className={`${pageStyles.input} ${styles.mono}`}
                    value={draft.max_subdomains}
                    onChange={(e) => updateField("max_subdomains", e.target.value)}
                  />
                </label>
                <label className={pageStyles.field}>
                  Max Apps / Runtimes
                  <input
                    name="max_apps"
                    type="number"
                    min="0"
                    className={`${pageStyles.input} ${styles.mono}`}
                    value={draft.max_apps}
                    onChange={(e) => updateField("max_apps", e.target.value)}
                  />
                </label>
                <label className={pageStyles.field}>
                  Max Databases
                  <input
                    name="max_databases"
                    type="number"
                    min="0"
                    className={`${pageStyles.input} ${styles.mono}`}
                    value={draft.max_databases}
                    onChange={(e) => updateField("max_databases", e.target.value)}
                  />
                </label>
                <label className={pageStyles.field}>
                  Max Mailboxes
                  <input
                    name="max_mailboxes"
                    type="number"
                    min="0"
                    className={`${pageStyles.input} ${styles.mono}`}
                    value={draft.max_mailboxes}
                    onChange={(e) => updateField("max_mailboxes", e.target.value)}
                  />
                </label>
                <label className={pageStyles.field}>
                  Mailbox Quota (MB each)
                  <input
                    name="mailbox_quota_mb"
                    type="number"
                    min="50"
                    className={`${pageStyles.input} ${styles.mono}`}
                    value={draft.mailbox_quota_mb}
                    onChange={(e) => updateField("mailbox_quota_mb", e.target.value)}
                  />
                </label>
                <label className={pageStyles.field}>
                  FTP / SFTP Accounts
                  <input
                    name="max_ftp_accounts"
                    type="number"
                    min="0"
                    className={`${pageStyles.input} ${styles.mono}`}
                    value={draft.max_ftp_accounts}
                    onChange={(e) => updateField("max_ftp_accounts", e.target.value)}
                  />
                </label>
                <label className={pageStyles.field}>
                  Backup Snapshot Slots
                  <input
                    name="backup_slots"
                    type="number"
                    min="0"
                    className={`${pageStyles.input} ${styles.mono}`}
                    value={draft.backup_slots}
                    onChange={(e) => updateField("backup_slots", e.target.value)}
                  />
                </label>
              </div>

              <div className={styles.togglesRow}>
                <label className={pageStyles.checkbox}>
                  <input
                    type="checkbox"
                    name="ssh_access"
                    checked={draft.ssh_access}
                    onChange={(e) => updateField("ssh_access", e.target.checked)}
                  />
                  SSH &amp; Web Terminal Access
                </label>
                <label className={pageStyles.checkbox}>
                  <input
                    type="checkbox"
                    name="ssl_included"
                    checked={draft.ssl_included}
                    onChange={(e) => updateField("ssl_included", e.target.checked)}
                  />
                  Auto-SSL (Let&apos;s Encrypt) Included
                </label>
                <label className={pageStyles.checkbox}>
                  <input
                    type="checkbox"
                    name="dedicated_ip"
                    checked={draft.dedicated_ip}
                    onChange={(e) => updateField("dedicated_ip", e.target.checked)}
                  />
                  Dedicated IPv4 Allocation
                </label>
              </div>
            </div>

            {saveState?.ok === false && (
              <div className={pageStyles.error} style={{ marginTop: 12 }}>
                {saveState.error}
              </div>
            )}
            {saveState?.ok === true && (
              <div className={pageStyles.notice} style={{ marginTop: 12 }}>
                Package saved and ready for provisioning.
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button type="submit" className={pageStyles.btn} disabled={savePending}>
                {savePending
                  ? "Saving..."
                  : draft.id
                    ? "Save Package Changes"
                    : "Create Package"}
              </button>
              {draft.id !== null && (
                <button
                  type="button"
                  className={pageStyles.btnGhost}
                  onClick={() => setDraft(EMPTY_VPS_DRAFT)}
                >
                  Cancel Edit
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Right Column: Live Summary & Host Capacity Impact */}
        <aside className={styles.previewCard}>
          <div className={styles.previewHead}>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                {draft.kind === "vps" ? "VPS Compute Package" : "Web Hosting Package"} ·{" "}
                {draft.billing_cycle}
              </div>
              <div className={styles.previewTitle}>{draft.name || "Untitled Package"}</div>
            </div>
            <div className={styles.previewPrice}>{draft.price_label || "Custom"}</div>
          </div>

          <p className={pageStyles.muted} style={{ fontSize: 12, marginBottom: 12 }}>
            {draft.description || "Configure limits on the left to preview exact resource deductions."}
          </p>

          <div className={styles.specList}>
            <div className={styles.specBox}>
              <div className={styles.specLabel}>CPU Allocation</div>
              <div className={styles.specVal}>{reqCpu} vCPU</div>
            </div>
            <div className={styles.specBox}>
              <div className={styles.specLabel}>RAM Memory</div>
              <div className={styles.specVal}>{fmtRam(draft.ram_mb)}</div>
            </div>
            <div className={styles.specBox}>
              <div className={styles.specLabel}>Storage Quota</div>
              <div className={styles.specVal}>{reqStorage} GB</div>
            </div>
            <div className={styles.specBox}>
              <div className={styles.specLabel}>Bandwidth</div>
              <div className={styles.specVal}>
                {fmtLimit(draft.bandwidth_gb, "GB/mo")} · {draft.port_speed_mbps || "1000"} Mbps
              </div>
            </div>
            <div className={styles.specBox}>
              <div className={styles.specLabel}>Domains / Subdomains</div>
              <div className={styles.specVal}>
                {fmtLimit(draft.max_domains)} / {fmtLimit(draft.max_subdomains)}
              </div>
            </div>
            <div className={styles.specBox}>
              <div className={styles.specLabel}>Apps &amp; Databases</div>
              <div className={styles.specVal}>
                {fmtLimit(draft.max_apps)} apps · {fmtLimit(draft.max_databases)} DBs
              </div>
            </div>
            <div className={styles.specBox}>
              <div className={styles.specLabel}>Mailboxes &amp; FTP</div>
              <div className={styles.specVal}>
                {fmtLimit(draft.max_mailboxes)} mail · {fmtLimit(draft.max_ftp_accounts)} FTP
              </div>
            </div>
            <div className={styles.specBox}>
              <div className={styles.specLabel}>Control Panel Offer</div>
              <div className={styles.specVal}>
                {draft.kind === "vps"
                  ? "Paix Free or SSH BYOP"
                  : draft.ssh_access
                    ? "Hosting + SSH"
                    : "Hosting Essentials"}
              </div>
            </div>
          </div>

          <div className={styles.fitBox}>
            <div>
              <strong>Capacity Forecast on This Server:</strong>{" "}
              <span className={styles.mono}>
                {exceedsRemaining
                  ? "0 accounts fit right now (exceeds remaining pool)"
                  : `Up to ${maxAccountsFit} more account(s) fit`}
              </span>
            </div>
            <div>
              Remaining pool: <span className={styles.mono}>{capacity.available.cpuCores} vCPU</span> ·{" "}
              <span className={styles.mono}>{fmtRam(String(capacity.available.ramMb))} RAM</span> ·{" "}
              <span className={styles.mono}>{capacity.available.storageGb} GB Disk</span>
            </div>
            {exceedsRemaining && (
              <div className={pageStyles.error} style={{ marginTop: 4, marginBottom: 0 }}>
                1 unit of this package exceeds remaining hardware capacity on this server. You can
                save it as a catalog tier, but provisioning requires freeing resources first.
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Existing Packages List */}
      <div className={pageStyles.section}>
        <div className={styles.filterRow}>
          <h2 className={pageStyles.sectionTitle} style={{ margin: 0 }}>
            Configured Packages ({filteredPackages.length})
          </h2>
          <div className={styles.segmented}>
            <button
              type="button"
              className={`${styles.segBtn} ${filterKind === "all" ? styles.segBtnActive : ""}`}
              onClick={() => setFilterKind("all")}
            >
              All ({packages.length})
            </button>
            <button
              type="button"
              className={`${styles.segBtn} ${filterKind === "vps" ? styles.segBtnActive : ""}`}
              onClick={() => setFilterKind("vps")}
            >
              VPS ({packages.filter((p) => p.kind === "vps").length})
            </button>
            <button
              type="button"
              className={`${styles.segBtn} ${filterKind === "hosting" ? styles.segBtnActive : ""}`}
              onClick={() => setFilterKind("hosting")}
            >
              Hosting ({packages.filter((p) => p.kind === "hosting").length})
            </button>
          </div>
        </div>

        {actionErr && <div className={pageStyles.error}>{actionErr}</div>}

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--text-dim)" }}>
                <th style={{ padding: "8px 10px" }}>Package</th>
                <th style={{ padding: "8px 10px" }}>Type</th>
                <th style={{ padding: "8px 10px" }}>Hardware Pool</th>
                <th style={{ padding: "8px 10px" }}>Bandwidth</th>
                <th style={{ padding: "8px 10px" }}>Quotas</th>
                <th style={{ padding: "8px 10px" }}>Active Users</th>
                <th style={{ padding: "8px 10px" }}>Status</th>
                <th style={{ padding: "8px 10px", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPackages.map((pkg) => {
                const count = pkg.kind === "vps" ? pkg.vps_count : pkg.hosting_count;
                return (
                  <tr key={pkg.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px" }}>
                      <strong>{pkg.name}</strong>
                      <div className={pageStyles.muted} style={{ fontSize: 12 }}>
                        <span className={styles.mono}>{pkg.slug}</span> · {pkg.price_label}
                      </div>
                    </td>
                    <td style={{ padding: "10px" }}>
                      <StatusBadge
                        text={pkg.kind === "vps" ? "VPS" : "Hosting"}
                        tone={pkg.kind === "vps" ? "info" : "ok"}
                      />
                    </td>
                    <td style={{ padding: "10px" }} className={styles.mono}>
                      {pkg.cpu_cores} vCPU · {fmtRam(String(pkg.ram_mb))} · {pkg.storage_gb} GB
                    </td>
                    <td style={{ padding: "10px" }} className={styles.mono}>
                      {pkg.bandwidth_gb > 0 ? `${pkg.bandwidth_gb} GB` : "Unlimited"} ·{" "}
                      {pkg.port_speed_mbps}M
                    </td>
                    <td style={{ padding: "10px", fontSize: 12 }}>
                      {pkg.max_domains === 0 ? "∞" : pkg.max_domains} dom ·{" "}
                      {pkg.max_databases === 0 ? "∞" : pkg.max_databases} DB ·{" "}
                      {pkg.max_mailboxes === 0 ? "∞" : pkg.max_mailboxes} mail ·{" "}
                      {pkg.ssh_access ? "SSH" : "No SSH"}
                    </td>
                    <td style={{ padding: "10px" }} className={styles.mono}>
                      {count}
                    </td>
                    <td style={{ padding: "10px" }}>
                      <StatusBadge
                        text={pkg.is_active ? "active" : "archived"}
                        tone={pkg.is_active ? "ok" : "muted"}
                      />
                    </td>
                    <td style={{ padding: "10px", textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className={pageStyles.btnGhost}
                          onClick={() => {
                            setDraft(rowToDraft(pkg, false));
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                          title="Edit package"
                        >
                          <Edit3 size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
                          Edit
                        </button>
                        <button
                          type="button"
                          className={pageStyles.btnGhost}
                          onClick={() => {
                            setDraft(rowToDraft(pkg, true));
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                          title="Duplicate package"
                        >
                          <Copy size={12} />
                        </button>
                        <button
                          type="button"
                          className={pageStyles.btnGhost}
                          disabled={mutating}
                          onClick={() => {
                            setActionErr(null);
                            startMutate(async () => {
                              const r = await togglePackageActiveAction(pkg.id, !pkg.is_active);
                              if (!r.ok) setActionErr(r.error);
                              else router.refresh();
                            });
                          }}
                        >
                          {pkg.is_active ? "Archive" : "Enable"}
                        </button>
                        <button
                          type="button"
                          className={pageStyles.btnDanger}
                          disabled={mutating}
                          onClick={() => {
                            setActionErr(null);
                            setDeleteTarget(pkg);
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredPackages.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: 20, textAlign: "center", color: "var(--text-dim)" }}>
                    No packages match this filter yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Host OS Reserve Modal */}
      <ConfirmDialog
        open={reserveOpen}
        title="Host OS Reserve (Headroom Protection)"
        hideActions
        pending={reservePending}
        onConfirm={() => reserveRef.current?.requestSubmit()}
        onCancel={() => !reservePending && setReserveOpen(false)}
      >
        <p className={pageStyles.muted} style={{ marginBottom: 12 }}>
          Reserve CPU, RAM, and disk space exclusively for the host OS and hypervisor so VPS/Hosting
          allocations never exhaust core system memory or storage.
        </p>
        <form ref={keepReserveRef} action={reserveAction}>
          <div className={pageStyles.formRow}>
            <label className={pageStyles.field}>
              Reserve CPU Cores
              <input
                name="reserve_cpu_cores"
                type="number"
                step="0.25"
                min="0"
                defaultValue={capacity.reserved.cpuCores}
                className={pageStyles.input}
              />
            </label>
            <label className={pageStyles.field}>
              Reserve RAM (MB)
              <input
                name="reserve_ram_mb"
                type="number"
                step="128"
                min="0"
                defaultValue={capacity.reserved.ramMb}
                className={pageStyles.input}
              />
            </label>
            <label className={pageStyles.field}>
              Reserve Storage (GB)
              <input
                name="reserve_storage_gb"
                type="number"
                min="0"
                defaultValue={capacity.reserved.storageGb}
                className={pageStyles.input}
              />
            </label>
          </div>
          {reserveState?.ok === false && <div className={pageStyles.error}>{reserveState.error}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            <button
              type="button"
              className={pageStyles.btnGhost}
              onClick={() => setReserveOpen(false)}
            >
              Cancel
            </button>
            <button type="submit" className={pageStyles.btn} disabled={reservePending}>
              {reservePending ? "Saving..." : "Save Reserve"}
            </button>
          </div>
        </form>
      </ConfirmDialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Delete package "${deleteTarget?.name ?? ""}"?`}
        tone="danger"
        confirmLabel={mutating ? "Deleting..." : "Delete Package"}
        pending={mutating}
        onCancel={() => !mutating && setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          const id = deleteTarget.id;
          startMutate(async () => {
            const r = await deletePackageAction(id);
            if (!r.ok) {
              setActionErr(r.error);
            } else {
              router.refresh();
            }
            setDeleteTarget(null);
          });
        }}
      >
        <p>
          Permanently removes this package template. Packages assigned to existing VPS or Hosting
          accounts cannot be deleted until accounts are migrated or terminated.
        </p>
      </ConfirmDialog>
    </div>
  );
}
