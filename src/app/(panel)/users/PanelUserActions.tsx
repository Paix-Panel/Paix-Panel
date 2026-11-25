"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ConfirmDialog from "@/components/ConfirmDialog/ConfirmDialog";
import styles from "@/components/page.module.css";
import { useFormActionState } from "@/lib/useFormActionState";
import {
  PERMISSION_DEFINITIONS,
  ROLE_TEMPLATES,
  parsePermissions,
  type PermissionKey,
  type UserRole,
} from "@/lib/permissions";
import usersStyles from "./users.module.css";

type Result = { ok: true } | { ok: false; error: string };

type AssignableResources = {
  apps: string[];
  domains: string[];
  databases: string[];
};

type Props = {
  userId: number;
  email: string;
  displayName: string;
  role: UserRole;
  permissionsJson: string;
  googleEnabled: boolean;
  isActive: boolean;
  canManageTarget: boolean;
  canChangeRole: boolean;
  resources: AssignableResources;
  updatePermissionsAction: (prev: Result | null, fd: FormData) => Promise<Result>;
  resetAction: (prev: Result | null, fd: FormData) => Promise<Result>;
  deleteAction: () => Promise<Result>;
};

export default function PanelUserActions({
  email,
  displayName,
  role,
  permissionsJson,
  googleEnabled,
  isActive,
  canManageTarget,
  canChangeRole,
  resources,
  updatePermissionsAction,
  resetAction,
  deleteAction,
}: Props) {
  const router = useRouter();

  // ─── Permissions & Access dialog ───────────────────────────────────
  const [permOpen, setPermOpen] = useState(false);
  const initialPerms = parsePermissions(permissionsJson);
  const [editRole, setEditRole] = useState<UserRole>(role);
  const [editName, setEditName] = useState(displayName);
  const [editGoogle, setEditGoogle] = useState(googleEnabled);
  const [editActive, setEditActive] = useState(isActive);
  const [modules, setModules] = useState<Set<PermissionKey>>(
    () => new Set(initialPerms.modules),
  );
  const [scopedApps, setScopedApps] = useState<Set<string>>(
    () => new Set(initialPerms.scopes?.apps ?? []),
  );
  const [scopedDomains, setScopedDomains] = useState<Set<string>>(
    () => new Set(initialPerms.scopes?.domains ?? []),
  );
  const [scopedDatabases, setScopedDatabases] = useState<Set<string>>(
    () => new Set(initialPerms.scopes?.databases ?? []),
  );
  const permFormRef = useRef<HTMLFormElement>(null);
  const [permState, permFormAction, permPending, permKeepRef] = useFormActionState<Result | null>(
    updatePermissionsAction,
    null,
    permFormRef,
  );
  const [permOpenedWith, setPermOpenedWith] = useState<Result | null>(null);
  const permResult = permState !== permOpenedWith ? permState : null;

  useEffect(() => {
    if (permResult?.ok === true && permOpen) {
      router.refresh();
      const t = setTimeout(() => setPermOpen(false), 750);
      return () => clearTimeout(t);
    }
  }, [permResult, permOpen, router]);

  // ─── Reset password dialog ─────────────────────────────────────────
  const [resetOpen, setResetOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [resetState, resetFormAction, resetPending, keepRef] = useFormActionState<
    Result | null
  >(resetAction, null, formRef);
  const [openedWith, setOpenedWith] = useState<Result | null>(null);
  const result = resetState !== openedWith ? resetState : null;

  useEffect(() => {
    if (result?.ok === true && resetOpen) {
      const t = setTimeout(() => {
        setResetOpen(false);
        setRevealed(false);
        formRef.current?.reset();
      }, 900);
      return () => clearTimeout(t);
    }
  }, [result, resetOpen]);

  // ─── Delete dialog ─────────────────────────────────────────────────
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePending, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const onConfirmDelete = () => {
    setDeleteError(null);
    startDelete(async () => {
      try {
        const res = await deleteAction();
        if (!res.ok) {
          setDeleteError(res.error);
          return;
        }
        router.refresh();
        setDeleteOpen(false);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setDeleteError(msg);
      }
    });
  };

  if (!canManageTarget) {
    return (
      <span className={styles.muted} style={{ fontSize: 12 }}>
        managed by super_admin
      </span>
    );
  }

  const toggleModule = (key: PermissionKey) => {
    setModules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleScope = (
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    item: string,
  ) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  };

  const resetEditBuffer = () => {
    const fresh = parsePermissions(permissionsJson);
    setEditRole(role);
    setEditName(displayName);
    setEditGoogle(googleEnabled);
    setEditActive(isActive);
    setModules(new Set(fresh.modules));
    setScopedApps(new Set(fresh.scopes?.apps ?? []));
    setScopedDomains(new Set(fresh.scopes?.domains ?? []));
    setScopedDatabases(new Set(fresh.scopes?.databases ?? []));
  };

  return (
    <>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <button
          type="button"
          className={styles.btnGhost}
          onClick={() => {
            resetEditBuffer();
            setPermOpenedWith(permState);
            setPermOpen(true);
          }}
          style={{ fontSize: 12, padding: "4px 10px" }}
        >
          Permissions
        </button>
        <button
          type="button"
          className={styles.btnGhost}
          onClick={() => {
            setRevealed(false);
            setOpenedWith(resetState);
            setResetOpen(true);
          }}
          style={{ fontSize: 12, padding: "4px 10px" }}
        >
          Password
        </button>
        <button
          type="button"
          className={styles.btnDanger}
          onClick={() => {
            setDeleteError(null);
            setDeleteOpen(true);
          }}
          style={{ fontSize: 12, padding: "4px 10px" }}
        >
          Delete
        </button>
      </div>

      {/* Permissions & Access dialog */}
      <ConfirmDialog
        open={permOpen}
        title={`Permissions & Access — ${email}`}
        hideActions
        pending={permPending}
        onConfirm={() => permFormRef.current?.requestSubmit()}
        onCancel={() => {
          if (permPending) return;
          setPermOpen(false);
        }}
      >
        <form ref={permKeepRef} action={permFormAction}>
          <div className={styles.formRow}>
            <label className={styles.field}>
              Display name
              <input
                name="display_name"
                className={styles.input}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Operator name"
              />
            </label>
            <label className={styles.field}>
              Role
              {canChangeRole ? (
                <select
                  name="role"
                  className={styles.select}
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as UserRole)}
                >
                  <option value="user">user (assigned tasks only)</option>
                  <option value="admin">admin (full server + user ops)</option>
                  <option value="super_admin">super_admin (full root control)</option>
                </select>
              ) : (
                <>
                  <input type="hidden" name="role" value={editRole} />
                  <input className={styles.input} value={editRole} readOnly />
                </>
              )}
            </label>
          </div>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                name="is_active"
                checked={editActive}
                onChange={(e) => setEditActive(e.target.checked)}
              />
              Account active (uncheck to suspend immediately)
            </label>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                name="google_enabled"
                checked={editGoogle}
                onChange={(e) => setEditGoogle(e.target.checked)}
              />
              Allow Google Sign-In
            </label>
          </div>

          {editRole === "user" ? (
            <div className={usersStyles.permBox}>
              <div className={usersStyles.permTitle}>Assigned tasks &amp; module permissions</div>
              <div className={usersStyles.templateRow}>
                {ROLE_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    className={styles.btnGhost}
                    style={{ fontSize: 11, padding: "3px 8px" }}
                    onClick={() => setModules(new Set(tpl.modules))}
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>

              <div className={usersStyles.permGrid}>
                {PERMISSION_DEFINITIONS.map((def) => (
                  <label key={def.key} className={usersStyles.permItem}>
                    <input
                      type="checkbox"
                      name="modules"
                      value={def.key}
                      checked={modules.has(def.key)}
                      onChange={() => toggleModule(def.key)}
                    />
                    <span>
                      <strong>{def.label}</strong>
                      <span className={usersStyles.permDesc}>{def.description}</span>
                    </span>
                  </label>
                ))}
              </div>

              {(modules.has("apps") ||
                modules.has("domains") ||
                modules.has("mail") ||
                modules.has("databases")) && (
                <div className={usersStyles.scopeSection}>
                  <div className={usersStyles.permTitle} style={{ fontSize: 12 }}>
                    Resource scope (none checked = access all)
                  </div>

                  {modules.has("apps") && resources.apps.length > 0 && (
                    <div className={usersStyles.scopeGroup}>
                      <div className={usersStyles.scopeLabel}>Apps</div>
                      <div className={usersStyles.scopeChips}>
                        {resources.apps.map((app) => (
                          <label key={app} className={usersStyles.scopeChip}>
                            <input
                              type="checkbox"
                              name="scope_apps"
                              value={app}
                              checked={scopedApps.has(app)}
                              onChange={() => toggleScope(setScopedApps, app)}
                            />
                            <span>{app}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {(modules.has("domains") || modules.has("mail")) &&
                    resources.domains.length > 0 && (
                      <div className={usersStyles.scopeGroup}>
                        <div className={usersStyles.scopeLabel}>Domains</div>
                        <div className={usersStyles.scopeChips}>
                          {resources.domains.map((dom) => (
                            <label key={dom} className={usersStyles.scopeChip}>
                              <input
                                type="checkbox"
                                name="scope_domains"
                                value={dom}
                                checked={scopedDomains.has(dom)}
                                onChange={() => toggleScope(setScopedDomains, dom)}
                              />
                              <span>{dom}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                  {modules.has("databases") && resources.databases.length > 0 && (
                    <div className={usersStyles.scopeGroup}>
                      <div className={usersStyles.scopeLabel}>Databases</div>
                      <div className={usersStyles.scopeChips}>
                        {resources.databases.map((dbName) => (
                          <label key={dbName} className={usersStyles.scopeChip}>
                            <input
                              type="checkbox"
                              name="scope_databases"
                              value={dbName}
                              checked={scopedDatabases.has(dbName)}
                              onChange={() => toggleScope(setScopedDatabases, dbName)}
                            />
                            <span>{dbName}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className={styles.notice} style={{ marginBottom: 12, fontSize: 12 }}>
              <strong>{editRole === "super_admin" ? "Super Admin" : "Admin"}</strong> automatically
              has full access to all server modules and resources.
            </div>
          )}

          {permResult?.ok === false && (
            <div className={styles.error} style={{ marginBottom: 10 }}>
              {permResult.error}
            </div>
          )}
          {permResult?.ok === true && (
            <div className={styles.notice} style={{ marginBottom: 10 }}>
              Access permissions saved. Takes effect immediately.
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            <button
              type="button"
              className={styles.btnGhost}
              onClick={() => !permPending && setPermOpen(false)}
              disabled={permPending}
            >
              Close
            </button>
            <button type="submit" className={styles.btn} disabled={permPending}>
              {permPending ? "Saving..." : "Save permissions"}
            </button>
          </div>
        </form>
      </ConfirmDialog>

      {/* Reset password dialog */}
      <ConfirmDialog
        open={resetOpen}
        title={`Reset password for ${email}`}
        hideActions
        pending={resetPending}
        onConfirm={() => formRef.current?.requestSubmit()}
        onCancel={() => {
          if (resetPending) return;
          setResetOpen(false);
          setRevealed(false);
        }}
      >
        <p style={{ marginTop: 0 }}>
          Sets a new password for this user (argon2id) and revokes any open
          sessions so they have to sign in again.
        </p>
        <form ref={keepRef} action={resetFormAction}>
          <div className={styles.formRow}>
            <label className={styles.field}>
              New password
              <input
                name="password"
                type={revealed ? "text" : "password"}
                className={styles.input}
                autoComplete="new-password"
                minLength={12}
                required
              />
            </label>
            <label className={styles.field}>
              Confirm
              <input
                name="confirm"
                type={revealed ? "text" : "password"}
                className={styles.input}
                autoComplete="new-password"
                minLength={12}
                required
              />
            </label>
          </div>
          <label className={styles.checkbox} style={{ marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={revealed}
              onChange={(e) => setRevealed(e.target.checked)}
            />
            Show passwords
          </label>

          {result?.ok === false && (
            <div className={styles.error} style={{ marginBottom: 10 }}>
              {result.error}
            </div>
          )}
          {result?.ok === true && (
            <div className={styles.notice} style={{ marginBottom: 10 }}>
              Password reset. Existing sessions revoked.
            </div>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              marginTop: 12,
            }}
          >
            <button
              type="button"
              className={styles.btnGhost}
              onClick={() => {
                if (resetPending) return;
                setResetOpen(false);
                setRevealed(false);
              }}
              disabled={resetPending}
            >
              Close
            </button>
            <button type="submit" className={styles.btn} disabled={resetPending}>
              {resetPending ? "Resetting..." : "Reset password"}
            </button>
          </div>
        </form>
      </ConfirmDialog>

      {/* Delete dialog */}
      <ConfirmDialog
        open={deleteOpen}
        title={`Delete ${email}?`}
        confirmLabel={deletePending ? "Deleting..." : "Delete user"}
        cancelLabel="Cancel"
        tone="danger"
        pending={deletePending}
        onConfirm={onConfirmDelete}
        onCancel={() => {
          if (deletePending) return;
          setDeleteOpen(false);
        }}
      >
        <p style={{ marginTop: 0 }}>
          Permanently removes the panel-login account and revokes every active
          session for this user.
        </p>
        <div
          style={{
            background: "var(--bg-elev-2)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "10px 12px",
            fontSize: 12,
            fontFamily: "var(--mono)",
            marginTop: 10,
            wordBreak: "break-all",
          }}
        >
          <div>
            <strong style={{ fontFamily: "inherit" }}>Email:</strong> {email}
          </div>
          <div>
            <strong style={{ fontFamily: "inherit" }}>Role:</strong> {role}
          </div>
        </div>
        {deleteError && (
          <div className={styles.error} style={{ marginTop: 10 }}>
            {deleteError}
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}
