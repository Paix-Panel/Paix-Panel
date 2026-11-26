"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, Globe, Pause, Play, RefreshCw, Trash2 } from "lucide-react";
import type {
  HostCapacitySummary,
  HostingAccountView,
  ServicePackageRow,
} from "@/lib/provisioning";
import {
  deleteHostingAction,
  provisionHostingAction,
  resizeHostingPackageAction,
  updateHostingStatusAction,
  type ActionResult,
} from "@/server-actions/hosting";
import { useFormActionState } from "@/lib/useFormActionState";
import StatusBadge from "@/components/StatusBadge/StatusBadge";
import ConfirmDialog from "@/components/ConfirmDialog/ConfirmDialog";
import pageStyles from "@/components/page.module.css";
import HostingTenantCard from "./HostingTenantCard";
import styles from "./hosting.module.css";

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

export default function HostingSuperAdminClient({
  accounts,
  hostingPackages,
  capacity,
  users,
  nameservers,
}: {
  accounts: HostingAccountView[];
  hostingPackages: ServicePackageRow[];
  capacity: HostCapacitySummary;
  users: AssignableUserOption[];
  nameservers: string;
}) {
  const router = useRouter();
  const activePackages = useMemo(
    () => hostingPackages.filter((p) => p.is_active === 1),
    [hostingPackages],
  );
  const [selectedPkgId, setSelectedPkgId] = useState<number>(activePackages[0]?.id ?? 0);
  const [ownerMode, setOwnerMode] = useState<"new" | "existing">("new");
  const [inspectAccount, setInspectAccount] = useState<HostingAccountView | null>(null);
  const [resizeTarget, setResizeTarget] = useState<HostingAccountView | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HostingAccountView | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [mutating, startMutate] = useTransition();

  const formRef = useRef<HTMLFormElement>(null);
  const [provState, provAction, provPending, keepProvRef] = useFormActionState<ActionResult | null>(
    provisionHostingAction,
    null,
    formRef,
  );

  const resizeBound = useMemo(
    () =>
      resizeTarget
        ? resizeHostingPackageAction.bind(null, resizeTarget.id)
        : async () => ({ ok: false as const, error: "None" }),
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

  const selectedPkg =
    hostingPackages.find((p) => p.id === selectedPkgId) ?? activePackages[0] ?? null;

  const afterCpu = selectedPkg
    ? Number((capacity.available.cpuCores - selectedPkg.cpu_cores).toFixed(2))
    : capacity.available.cpuCores;
  const afterRam = selectedPkg
    ? capacity.available.ramMb - selectedPkg.ram_mb
    : capacity.available.ramMb;
  const afterStorage = selectedPkg
    ? capacity.available.storageGb - selectedPkg.storage_gb
    : capacity.available.storageGb;
  const insufficient = afterCpu < -1e-6 || afterRam < 0 || afterStorage < 0;

  return (
    <div>
      {/* Register New Web Hosting Account */}
      <div className={pageStyles.section}>
        <div className={styles.rowBetween} style={{ marginBottom: 12 }}>
          <div>
            <h2 className={pageStyles.sectionTitle} style={{ margin: 0 }}>
              Register Web Hosting Account
            </h2>
            <div className={pageStyles.muted} style={{ fontSize: 12, marginTop: 2 }}>
              Assign a Hosting Package and grant full Hosting Admin roles (Domains, SSL, Files,
              Databases, Mailboxes, Apps, Backups, Cron) scoped to the client&apos;s domain.
            </div>
          </div>
          <Link href="/packages" className={pageStyles.btnGhost}>
            Manage Hosting Packages
          </Link>
        </div>

        {activePackages.length === 0 ? (
          <div className={pageStyles.empty}>
            No active Hosting packages found.{" "}
            <Link href="/packages">Create a Hosting Package first</Link>.
          </div>
        ) : (
          <form ref={keepProvRef} action={provAction}>
            <div className={pageStyles.formRow}>
              <label className={pageStyles.field}>
                Hosting Package
                <select
                  name="package_id"
                  className={pageStyles.select}
                  value={selectedPkg?.id ?? ""}
                  onChange={(e) => setSelectedPkgId(Number(e.target.value))}
                >
                  {activePackages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.storage_gb} GB ·{" "}
                      {p.max_domains === 0 ? "Unlimited" : p.max_domains} Domains · {p.price_label}
                    </option>
                  ))}
                </select>
              </label>

              <label className={pageStyles.field}>
                Primary Domain
                <input
                  name="domain"
                  className={`${pageStyles.input} ${styles.mono}`}
                  placeholder="e.g. clientstore.co.tz"
                  required
                />
              </label>

              <label className={pageStyles.field}>
                Account / Site Label
                <input
                  name="label"
                  className={pageStyles.input}
                  placeholder="e.g. Client Store"
                />
              </label>

              <label className={pageStyles.field}>
                System / SFTP Username (optional)
                <input
                  name="linux_user"
                  className={`${pageStyles.input} ${styles.mono}`}
                  placeholder="auto from domain"
                />
              </label>
            </div>

            {selectedPkg && (
              <div className={styles.impactBox}>
                <div>
                  <strong>Package Quotas &amp; Pool Deduction:</strong>{" "}
                  <span className={styles.mono}>
                    {selectedPkg.storage_gb} GB Disk ·{" "}
                    {selectedPkg.bandwidth_gb > 0 ? `${selectedPkg.bandwidth_gb} GB BW` : "Unlimited BW"} ·{" "}
                    {selectedPkg.cpu_cores} vCPU · {fmtRam(selectedPkg.ram_mb)} RAM
                  </span>{" "}
                  · Roles granted: Domains, SSL, Files, Databases, Mailboxes, Apps, Backups, Cron
                  {selectedPkg.ssh_access ? ", Terminal/SSH" : ""}
                </div>
                <div style={{ color: insufficient ? "var(--danger)" : "var(--ok)" }} className={styles.mono}>
                  Remaining Pool After Registration: {Math.max(0, afterCpu)} vCPU ·{" "}
                  {fmtRam(Math.max(0, afterRam))} RAM · {Math.max(0, afterStorage)} GB Storage
                  {insufficient ? " — INSUFFICIENT CAPACITY ON HOST" : ""}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: "6px 0 12px" }}>
              <label className={pageStyles.checkbox}>
                <input
                  type="radio"
                  name="owner_mode"
                  value="new"
                  checked={ownerMode === "new"}
                  onChange={() => setOwnerMode("new")}
                />
                Create New Hosting Admin User
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
                <input type="checkbox" name="create_linux_user" />
                Also create isolated SFTP/Linux user on host
              </label>
            </div>

            {ownerMode === "new" ? (
              <div className={pageStyles.formRow}>
                <label className={pageStyles.field}>
                  Hosting Admin Email
                  <input
                    name="email"
                    type="email"
                    className={pageStyles.input}
                    placeholder="owner@clientstore.co.tz"
                    required
                  />
                </label>
                <label className={pageStyles.field}>
                  Owner Name
                  <input
                    name="display_name"
                    className={pageStyles.input}
                    placeholder="Owner Name"
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
              Notes (optional)
              <input name="notes" className={pageStyles.input} placeholder="Plan or billing notes" />
            </label>

            {provState?.ok === false && <div className={pageStyles.error}>{provState.error}</div>}
            {provState?.ok === true && (
              <div className={pageStyles.notice}>
                Web Hosting account created, Hosting Admin roles assigned, and domain zone
                initialized.
              </div>
            )}

            <button
              type="submit"
              className={pageStyles.btn}
              disabled={provPending || insufficient}
            >
              {provPending ? "Registering Account..." : "Register Hosting Account"}
            </button>
          </form>
        )}
      </div>

      {/* Hosting Accounts Table */}
      <div className={pageStyles.section}>
        <h2 className={pageStyles.sectionTitle}>
          Registered Hosting Accounts ({accounts.length})
        </h2>

        {actionErr && <div className={pageStyles.error}>{actionErr}</div>}

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--text-dim)" }}>
                <th style={{ padding: "8px 10px" }}>Domain &amp; Root</th>
                <th style={{ padding: "8px 10px" }}>Hosting Admin</th>
                <th style={{ padding: "8px 10px" }}>Package &amp; Storage</th>
                <th style={{ padding: "8px 10px" }}>Hosting Quotas</th>
                <th style={{ padding: "8px 10px" }}>Status</th>
                <th style={{ padding: "8px 10px", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc) => (
                <tr key={acc.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px" }}>
                    <strong>{acc.domain}</strong>
                    <div className={`${pageStyles.muted} ${styles.mono}`} style={{ fontSize: 12 }}>
                      {acc.root_dir}
                    </div>
                  </td>
                  <td style={{ padding: "10px" }}>
                    <div>{acc.owner_name || acc.owner_email}</div>
                    <div className={pageStyles.muted} style={{ fontSize: 12 }}>
                      {acc.owner_email}
                    </div>
                  </td>
                  <td style={{ padding: "10px" }}>
                    <strong>{acc.package_name}</strong>
                    <div className={`${pageStyles.muted} ${styles.mono}`} style={{ fontSize: 12 }}>
                      {acc.storage_gb} GB · {acc.bandwidth_gb > 0 ? `${acc.bandwidth_gb} GB BW` : "∞ BW"}
                    </div>
                  </td>
                  <td style={{ padding: "10px", fontSize: 12 }}>
                    {acc.max_domains === 0 ? "∞" : acc.max_domains} dom ·{" "}
                    {acc.max_databases === 0 ? "∞" : acc.max_databases} DB ·{" "}
                    {acc.max_mailboxes === 0 ? "∞" : acc.max_mailboxes} mail ·{" "}
                    {acc.ssh_access ? "SSH" : "Web only"}
                  </td>
                  <td style={{ padding: "10px" }}>
                    <StatusBadge
                      text={acc.status}
                      tone={
                        acc.status === "active"
                          ? "ok"
                          : acc.status === "suspended"
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
                        onClick={() => setInspectAccount(acc)}
                      >
                        <Eye size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
                        Preview
                      </button>
                      <button
                        type="button"
                        className={pageStyles.btnGhost}
                        onClick={() => setResizeTarget(acc)}
                      >
                        <RefreshCw size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
                        Resize
                      </button>
                      {acc.status === "active" ? (
                        <button
                          type="button"
                          className={pageStyles.btnGhost}
                          disabled={mutating}
                          onClick={() =>
                            startMutate(async () => {
                              const r = await updateHostingStatusAction(acc.id, "suspended");
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
                              const r = await updateHostingStatusAction(acc.id, "active");
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
                        onClick={() => setDeleteTarget(acc)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {accounts.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 20, textAlign: "center", color: "var(--text-dim)" }}>
                    <Globe size={16} style={{ verticalAlign: -3, marginRight: 6 }} />
                    No hosting accounts registered yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Preview Modal */}
      {inspectAccount && (
        <ConfirmDialog
          open={true}
          wide
          hideActions
          title={`Hosting Control Center Preview — ${inspectAccount.domain}`}
          onConfirm={() => setInspectAccount(null)}
          onCancel={() => setInspectAccount(null)}
        >
          <HostingTenantCard
            account={inspectAccount}
            serverIp={capacity.serverIp}
            nameservers={nameservers}
          />
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              className={pageStyles.btnGhost}
              onClick={() => setInspectAccount(null)}
            >
              Close Preview
            </button>
          </div>
        </ConfirmDialog>
      )}

      {/* Resize Modal */}
      <ConfirmDialog
        open={resizeTarget !== null}
        title={`Change Hosting Package — ${resizeTarget?.domain ?? ""}`}
        hideActions
        pending={resizePending}
        onConfirm={() => resizeFormRef.current?.requestSubmit()}
        onCancel={() => !resizePending && setResizeTarget(null)}
      >
        {resizeTarget && (
          <form ref={keepResizeRef} action={resizeAction}>
            <p className={pageStyles.muted} style={{ marginBottom: 12 }}>
              Current plan: <strong>{resizeTarget.package_name}</strong> ({resizeTarget.storage_gb}{" "}
              GB storage). Updating adjusts disk/bandwidth/domain/database/mailbox quotas and syncs
              the Hosting Admin&apos;s permissions.
            </p>
            <label className={pageStyles.field} style={{ marginBottom: 12 }}>
              New Hosting Package
              <select
                name="package_id"
                className={pageStyles.select}
                defaultValue={resizeTarget.package_id}
              >
                {activePackages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.storage_gb} GB ·{" "}
                    {p.max_domains === 0 ? "Unlimited" : p.max_domains} Domains
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
                {resizePending ? "Updating..." : "Apply Package"}
              </button>
            </div>
          </form>
        )}
      </ConfirmDialog>

      {/* Delete Modal */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Remove hosting account "${deleteTarget?.domain ?? ""}"?`}
        tone="danger"
        confirmLabel={mutating ? "Removing..." : "Remove Account"}
        pending={mutating}
        onCancel={() => !mutating && setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          const id = deleteTarget.id;
          startMutate(async () => {
            const r = await deleteHostingAction(id);
            if (!r.ok) setActionErr(r.error);
            else router.refresh();
            setDeleteTarget(null);
          });
        }}
      >
        <p>
          Removes this hosting registration and frees{" "}
          <strong>{deleteTarget?.storage_gb} GB storage</strong> back into the Super Admin pool.
        </p>
      </ConfirmDialog>
    </div>
  );
}
