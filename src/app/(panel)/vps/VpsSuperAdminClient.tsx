"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, Pause, Play, RefreshCw, Server, Trash2 } from "lucide-react";
import type {
  HostCapacitySummary,
  ServicePackageRow,
  VpsInstanceView,
} from "@/lib/provisioning";
import {
  OS_TEMPLATES,
  PANEL_OFFER_CATALOG,
  findPanelOffer,
} from "@/lib/panelOffers";
import {
  deleteVpsAction,
  provisionVpsAction,
  resizeVpsPackageAction,
  updateVpsStatusAction,
  type ActionResult,
} from "@/server-actions/vps";
import { useFormActionState } from "@/lib/useFormActionState";
import StatusBadge from "@/components/StatusBadge/StatusBadge";
import ConfirmDialog from "@/components/ConfirmDialog/ConfirmDialog";
import pageStyles from "@/components/page.module.css";
import VpsTenantCard from "./VpsTenantCard";
import styles from "./vps.module.css";

type AssignableUserOption = {
  id: number;
  email: string;
  display_name: string;
  role: string;
};

function fmtRam(mb: number): string {
  if (mb >= 1024) {
    const gb = mb / 1024;
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
  }
  return `${mb} MB`;
}

export default function VpsSuperAdminClient({
  instances,
  vpsPackages,
  capacity,
  users,
}: {
  instances: VpsInstanceView[];
  vpsPackages: ServicePackageRow[];
  capacity: HostCapacitySummary;
  users: AssignableUserOption[];
}) {
  const router = useRouter();
  const activePackages = useMemo(() => vpsPackages.filter((p) => p.is_active === 1), [vpsPackages]);
  const [selectedPkgId, setSelectedPkgId] = useState<number>(activePackages[0]?.id ?? 0);
  const [ownerMode, setOwnerMode] = useState<"new" | "existing">("new");
  const [createLinuxUser, setCreateLinuxUser] = useState(false);
  const [inspectVps, setInspectVps] = useState<VpsInstanceView | null>(null);
  const [resizeTarget, setResizeTarget] = useState<VpsInstanceView | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VpsInstanceView | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [mutating, startMutate] = useTransition();

  const formRef = useRef<HTMLFormElement>(null);
  const [provState, provAction, provPending, keepProvRef] = useFormActionState<ActionResult | null>(
    provisionVpsAction,
    null,
    formRef,
  );

  const resizeBound = useMemo(
    () => (resizeTarget ? resizeVpsPackageAction.bind(null, resizeTarget.id) : async () => ({ ok: false as const, error: "None" })),
    [resizeTarget],
  );
  const resizeFormRef = useRef<HTMLFormElement>(null);
  const [resizeState, resizeAction, resizePending, keepResizeRef] = useFormActionState<ActionResult | null>(
    resizeBound,
    null,
    resizeFormRef,
  );

  useEffect(() => {
    if (provState?.ok === true) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [provState, router]);

  useEffect(() => {
    if (resizeState?.ok === true && resizeTarget) {
      router.refresh();
      setResizeTarget(null);
    }
  }, [resizeState, resizeTarget, router]);

  const selectedPkg = vpsPackages.find((p) => p.id === selectedPkgId) ?? activePackages[0] ?? null;

  const afterCpu = selectedPkg
    ? Number((capacity.available.cpuCores - selectedPkg.cpu_cores).toFixed(2))
    : capacity.available.cpuCores;
  const afterRam = selectedPkg ? capacity.available.ramMb - selectedPkg.ram_mb : capacity.available.ramMb;
  const afterStorage = selectedPkg
    ? capacity.available.storageGb - selectedPkg.storage_gb
    : capacity.available.storageGb;
  const insufficient = afterCpu < -1e-6 || afterRam < 0 || afterStorage < 0;

  return (
    <div>
      {/* Provision New VPS Form */}
      <div className={pageStyles.section}>
        <div className={styles.sshRow} style={{ marginBottom: 12 }}>
          <div>
            <h2 className={pageStyles.sectionTitle} style={{ margin: 0 }}>
              Register &amp; Allocate New VPS
            </h2>
            <div className={pageStyles.muted} style={{ fontSize: 12, marginTop: 2 }}>
              Assign a VPS Package to deduct CPU, RAM, and Storage from your server capacity pool.
              User receives SSH credentials plus a free Paix Panel or BYO panel option.
            </div>
          </div>
          <Link href="/packages" className={pageStyles.btnGhost}>
            Manage VPS Packages
          </Link>
        </div>

        {activePackages.length === 0 ? (
          <div className={pageStyles.empty}>
            No active VPS packages found.{" "}
            <Link href="/packages">Create a VPS Package first</Link>.
          </div>
        ) : (
          <form ref={keepProvRef} action={provAction}>
            <div className={pageStyles.formRow}>
              <label className={pageStyles.field}>
                VPS Package (defines CPU, RAM, Storage, BW)
                <select
                  name="package_id"
                  className={pageStyles.select}
                  value={selectedPkg?.id ?? ""}
                  onChange={(e) => setSelectedPkgId(Number(e.target.value))}
                >
                  {activePackages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.cpu_cores} vCPU · {fmtRam(p.ram_mb)} · {p.storage_gb} GB (
                      {p.price_label})
                    </option>
                  ))}
                </select>
              </label>

              <label className={pageStyles.field}>
                VPS Hostname / Label
                <input
                  name="name"
                  className={`${pageStyles.input} ${styles.mono}`}
                  placeholder="e.g. vps-client01.example.com"
                  required
                />
              </label>

              <label className={pageStyles.field}>
                OS Template
                <select name="os_template" className={pageStyles.select} defaultValue="Ubuntu 24.04 LTS">
                  {OS_TEMPLATES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {selectedPkg && (
              <div className={styles.impactBox}>
                <div>
                  <strong>Resource Deduction Preview:</strong> Provisioning{" "}
                  <span className={styles.mono}>{selectedPkg.name}</span> deducts{" "}
                  <span className={styles.mono}>
                    {selectedPkg.cpu_cores} vCPU · {fmtRam(selectedPkg.ram_mb)} RAM ·{" "}
                    {selectedPkg.storage_gb} GB Storage
                  </span>
                </div>
                <div style={{ color: insufficient ? "var(--danger)" : "var(--ok)" }} className={styles.mono}>
                  Remaining Pool After Provision: {Math.max(0, afterCpu)} vCPU ·{" "}
                  {fmtRam(Math.max(0, afterRam))} RAM · {Math.max(0, afterStorage)} GB Storage
                  {insufficient ? " — INSUFFICIENT CAPACITY ON HOST" : ""}
                </div>
              </div>
            )}

            <div className={pageStyles.formRow}>
              <label className={pageStyles.field}>
                SSH IP Address
                <input
                  name="ssh_ip"
                  className={`${pageStyles.input} ${styles.mono}`}
                  defaultValue={capacity.serverIp}
                  required
                />
              </label>
              <label className={pageStyles.field}>
                SSH Port
                <input
                  name="ssh_port"
                  type="number"
                  min="1"
                  max="65535"
                  className={`${pageStyles.input} ${styles.mono}`}
                  defaultValue="22"
                />
              </label>
              <label className={pageStyles.field}>
                SSH Username
                <input
                  name="ssh_user"
                  className={`${pageStyles.input} ${styles.mono}`}
                  defaultValue="root"
                  required
                />
              </label>
              <label className={pageStyles.field}>
                Initial Panel Offer
                <select name="panel_choice" className={pageStyles.select} defaultValue="paix">
                  {PANEL_OFFER_CATALOG.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.badge})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Owner Assignment */}
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: "6px 0 12px" }}>
              <label className={pageStyles.checkbox}>
                <input
                  type="radio"
                  name="owner_mode"
                  value="new"
                  checked={ownerMode === "new"}
                  onChange={() => setOwnerMode("new")}
                />
                Create New VPS Admin User
              </label>
              <label className={pageStyles.checkbox}>
                <input
                  type="radio"
                  name="owner_mode"
                  value="existing"
                  checked={ownerMode === "existing"}
                  onChange={() => setOwnerMode("existing")}
                />
                Assign Existing Panel User
              </label>
              <label className={pageStyles.checkbox}>
                <input
                  type="checkbox"
                  name="create_linux_user"
                  checked={createLinuxUser}
                  onChange={(e) => setCreateLinuxUser(e.target.checked)}
                />
                Also provision dedicated Linux SSH account (non-root username)
              </label>
            </div>

            {ownerMode === "new" ? (
              <div className={pageStyles.formRow}>
                <label className={pageStyles.field}>
                  VPS Admin Email
                  <input
                    name="email"
                    type="email"
                    className={pageStyles.input}
                    placeholder="client@domain.com"
                    required
                  />
                </label>
                <label className={pageStyles.field}>
                  Owner Display Name
                  <input
                    name="display_name"
                    className={pageStyles.input}
                    placeholder="Client Name"
                  />
                </label>
                <label className={pageStyles.field}>
                  Initial Password (min 12 chars)
                  <input
                    name="password"
                    type="password"
                    minLength={12}
                    className={pageStyles.input}
                    autoComplete="new-password"
                    required
                  />
                </label>
              </div>
            ) : (
              <div className={pageStyles.formRow}>
                <label className={pageStyles.field}>
                  Existing Panel User
                  <select name="existing_user_id" className={pageStyles.select}>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.display_name || u.email} ({u.email} · {u.role})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            <label className={pageStyles.field} style={{ marginBottom: 12 }}>
              Provisioning Notes (optional)
              <input
                name="notes"
                className={pageStyles.input}
                placeholder="Customer notes or IPv6 / routing remarks"
              />
            </label>

            {provState?.ok === false && <div className={pageStyles.error}>{provState.error}</div>}
            {provState?.ok === true && (
              <div className={pageStyles.notice}>
                VPS provisioned and resources deducted from Super Admin pool.
              </div>
            )}

            <button
              type="submit"
              className={pageStyles.btn}
              disabled={provPending || insufficient}
            >
              {provPending ? "Provisioning VPS..." : "Register & Allocate VPS"}
            </button>
          </form>
        )}
      </div>

      {/* Provisioned VPS List */}
      <div className={pageStyles.section}>
        <h2 className={pageStyles.sectionTitle}>
          Provisioned VPS Instances ({instances.length})
        </h2>

        {actionErr && <div className={pageStyles.error}>{actionErr}</div>}

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--text-dim)" }}>
                <th style={{ padding: "8px 10px" }}>VPS Server</th>
                <th style={{ padding: "8px 10px" }}>VPS Admin</th>
                <th style={{ padding: "8px 10px" }}>Package &amp; Pool Deduction</th>
                <th style={{ padding: "8px 10px" }}>SSH Access</th>
                <th style={{ padding: "8px 10px" }}>Panel Choice</th>
                <th style={{ padding: "8px 10px" }}>Status</th>
                <th style={{ padding: "8px 10px", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {instances.map((v) => {
                const panel = findPanelOffer(v.panel_choice);
                return (
                  <tr key={v.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px" }}>
                      <strong>{v.name}</strong>
                      <div className={pageStyles.muted} style={{ fontSize: 12 }}>
                        {v.os_template}
                      </div>
                    </td>
                    <td style={{ padding: "10px" }}>
                      <div>{v.owner_name || v.owner_email}</div>
                      <div className={pageStyles.muted} style={{ fontSize: 12 }}>
                        {v.owner_email}
                      </div>
                    </td>
                    <td style={{ padding: "10px" }}>
                      <strong>{v.package_name}</strong>
                      <div className={`${pageStyles.muted} ${styles.mono}`} style={{ fontSize: 12 }}>
                        -{v.cpu_cores} vCPU · -{fmtRam(v.ram_mb)} · -{v.storage_gb} GB
                      </div>
                    </td>
                    <td style={{ padding: "10px" }} className={styles.mono}>
                      {v.ssh_user}@{v.ssh_ip}:{v.ssh_port}
                    </td>
                    <td style={{ padding: "10px" }}>
                      <StatusBadge
                        text={
                          v.panel_choice === "paix"
                            ? "Paix Panel Free"
                            : v.custom_panel_name || panel.name
                        }
                        tone={v.panel_choice === "paix" ? "ok" : "info"}
                      />
                    </td>
                    <td style={{ padding: "10px" }}>
                      <StatusBadge
                        text={v.status}
                        tone={
                          v.status === "active"
                            ? "ok"
                            : v.status === "suspended"
                              ? "warn"
                              : "danger"
                        }
                      />
                    </td>
                    <td style={{ padding: "10px", textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className={pageStyles.btnGhost}
                          onClick={() => setInspectVps(v)}
                          title="Inspect SSH & Panel Offer view"
                        >
                          <Eye size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
                          Manage / View
                        </button>
                        <button
                          type="button"
                          className={pageStyles.btnGhost}
                          onClick={() => setResizeTarget(v)}
                          title="Resize VPS Package"
                        >
                          <RefreshCw size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
                          Resize
                        </button>
                        {v.status === "active" ? (
                          <button
                            type="button"
                            className={pageStyles.btnGhost}
                            disabled={mutating}
                            onClick={() =>
                              startMutate(async () => {
                                const r = await updateVpsStatusAction(v.id, "suspended");
                                if (!r.ok) setActionErr(r.error);
                                else router.refresh();
                              })
                            }
                          >
                            <Pause size={12} /> Suspend
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={pageStyles.btnGhost}
                            disabled={mutating}
                            onClick={() =>
                              startMutate(async () => {
                                const r = await updateVpsStatusAction(v.id, "active");
                                if (!r.ok) setActionErr(r.error);
                                else router.refresh();
                              })
                            }
                          >
                            <Play size={12} /> Activate
                          </button>
                        )}
                        <button
                          type="button"
                          className={pageStyles.btnDanger}
                          disabled={mutating}
                          onClick={() => setDeleteTarget(v)}
                          title="Delete VPS and return resources to host pool"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {instances.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 20, textAlign: "center", color: "var(--text-dim)" }}>
                    <Server size={16} style={{ verticalAlign: -3, marginRight: 6 }} />
                    No VPS instances provisioned yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tenant SSH & Panel Choice Preview Modal */}
      {inspectVps && (
        <ConfirmDialog
          open={true}
          wide
          hideActions
          title={`Tenant Workspace Preview — ${inspectVps.name}`}
          onConfirm={() => setInspectVps(null)}
          onCancel={() => setInspectVps(null)}
        >
          <VpsTenantCard vps={inspectVps} />
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              className={pageStyles.btnGhost}
              onClick={() => setInspectVps(null)}
            >
              Close Preview
            </button>
          </div>
        </ConfirmDialog>
      )}

      {/* Resize Package Modal */}
      <ConfirmDialog
        open={resizeTarget !== null}
        title={`Resize Package — ${resizeTarget?.name ?? ""}`}
        hideActions
        pending={resizePending}
        onConfirm={() => resizeFormRef.current?.requestSubmit()}
        onCancel={() => !resizePending && setResizeTarget(null)}
      >
        {resizeTarget && (
          <form ref={keepResizeRef} action={resizeAction}>
            <p className={pageStyles.muted} style={{ marginBottom: 12 }}>
              Current allocation: <strong>{resizeTarget.package_name}</strong> (
              {resizeTarget.cpu_cores} vCPU · {fmtRam(resizeTarget.ram_mb)} ·{" "}
              {resizeTarget.storage_gb} GB). Upgrading deducts additional resources from the pool;
              downgrading returns capacity immediately.
            </p>
            <label className={pageStyles.field} style={{ marginBottom: 12 }}>
              New VPS Package
              <select
                name="package_id"
                className={pageStyles.select}
                defaultValue={resizeTarget.package_id}
              >
                {activePackages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.cpu_cores} vCPU · {fmtRam(p.ram_mb)} · {p.storage_gb} GB
                  </option>
                ))}
              </select>
            </label>
            {resizeState?.ok === false && <div className={pageStyles.error}>{resizeState.error}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                className={pageStyles.btnGhost}
                onClick={() => setResizeTarget(null)}
              >
                Cancel
              </button>
              <button type="submit" className={pageStyles.btn} disabled={resizePending}>
                {resizePending ? "Updating..." : "Apply Package Resize"}
              </button>
            </div>
          </form>
        )}
      </ConfirmDialog>

      {/* Delete / Terminate Confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Delete VPS "${deleteTarget?.name ?? ""}"?`}
        tone="danger"
        confirmLabel={mutating ? "Deleting..." : "Delete & Return Capacity"}
        pending={mutating}
        onCancel={() => !mutating && setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          const id = deleteTarget.id;
          startMutate(async () => {
            const r = await deleteVpsAction(id);
            if (!r.ok) setActionErr(r.error);
            else router.refresh();
            setDeleteTarget(null);
          });
        }}
      >
        <p>
          Removes this VPS record and immediately returns{" "}
          <strong>
            {deleteTarget?.cpu_cores} vCPU, {deleteTarget ? fmtRam(deleteTarget.ram_mb) : ""}, and{" "}
            {deleteTarget?.storage_gb} GB storage
          </strong>{" "}
          back into the Super Admin capacity pool.
        </p>
      </ConfirmDialog>
    </div>
  );
}
