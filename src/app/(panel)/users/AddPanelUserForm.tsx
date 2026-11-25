"use client";

import { useEffect, useRef, useState } from "react";
import styles from "@/components/page.module.css";
import { useFormActionState } from "@/lib/useFormActionState";
import {
  PERMISSION_DEFINITIONS,
  ROLE_TEMPLATES,
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

export default function AddPanelUserForm({
  action,
  canCreateAdmins,
  resources,
}: {
  action: (prev: Result | null, fd: FormData) => Promise<Result>;
  canCreateAdmins: boolean;
  resources: AssignableResources;
}) {
  const [revealed, setRevealed] = useState(false);
  const [role, setRole] = useState<UserRole>("user");
  const [googleOnly, setGoogleOnly] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(true);
  const [selectedModules, setSelectedModules] = useState<Set<PermissionKey>>(
    () => new Set(["apps", "domains", "databases", "logs"]),
  );
  const [scopedApps, setScopedApps] = useState<Set<string>>(() => new Set());
  const [scopedDomains, setScopedDomains] = useState<Set<string>>(() => new Set());
  const [scopedDatabases, setScopedDatabases] = useState<Set<string>>(() => new Set());

  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending, keepRef] = useFormActionState<Result | null>(
    action,
    null,
    formRef,
  );

  useEffect(() => {
    if (state?.ok === true) {
      formRef.current?.reset();
      setRevealed(false);
      setRole("user");
      setGoogleOnly(false);
      setGoogleEnabled(true);
      setSelectedModules(new Set(["apps", "domains", "databases", "logs"]));
      setScopedApps(new Set());
      setScopedDomains(new Set());
      setScopedDatabases(new Set());
    }
  }, [state]);

  const toggleModule = (key: PermissionKey) => {
    setSelectedModules((prev) => {
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

  return (
    <form ref={keepRef} action={formAction}>
      <div className={styles.formRow}>
        <label className={styles.field}>
          Email (also matched for Google Sign-In)
          <input
            name="email"
            type="email"
            className={styles.input}
            placeholder="alice@company.com"
            autoComplete="off"
            required
          />
        </label>
        <label className={styles.field}>
          Display name (optional)
          <input
            name="display_name"
            type="text"
            className={styles.input}
            placeholder="Alice (Backend)"
            autoComplete="off"
          />
        </label>
        <label className={styles.field}>
          Role
          <select
            name="role"
            className={styles.select}
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
          >
            <option value="user">user (assigned tasks only)</option>
            {canCreateAdmins && <option value="admin">admin (manage server &amp; users)</option>}
            {canCreateAdmins && <option value="super_admin">super_admin (full root control)</option>}
          </select>
        </label>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            name="google_enabled"
            checked={googleEnabled}
            onChange={(e) => {
              setGoogleEnabled(e.target.checked);
              if (!e.target.checked) setGoogleOnly(false);
            }}
          />
          Allow Sign in with Google
        </label>
        {googleEnabled && (
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={googleOnly}
              onChange={(e) => setGoogleOnly(e.target.checked)}
            />
            Google SSO only (no local password)
          </label>
        )}
      </div>

      {!googleOnly && (
        <>
          <div className={styles.formRow}>
            <label className={styles.field}>
              Password
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
          <label className={styles.checkbox} style={{ marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={revealed}
              onChange={(e) => setRevealed(e.target.checked)}
            />
            Show passwords
          </label>
        </>
      )}

      {role === "user" && (
        <div className={usersStyles.permBox}>
          <div className={usersStyles.permTitle}>Assigned tasks &amp; permissions</div>
          <p className={styles.muted} style={{ fontSize: 12, margin: "0 0 10px" }}>
            Regular users only see and access the sections checked below. Unchecked modules are
            hidden from their sidebar, dashboard, and blocked by the server.
          </p>

          <div className={usersStyles.templateRow}>
            {ROLE_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                className={styles.btnGhost}
                style={{ fontSize: 11, padding: "4px 9px" }}
                title={tpl.description}
                onClick={() => setSelectedModules(new Set(tpl.modules))}
              >
                Preset: {tpl.label}
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
                  checked={selectedModules.has(def.key)}
                  onChange={() => toggleModule(def.key)}
                />
                <span>
                  <strong>{def.label}</strong>
                  <span className={usersStyles.permDesc}>{def.description}</span>
                </span>
              </label>
            ))}
          </div>

          {(selectedModules.has("apps") ||
            selectedModules.has("domains") ||
            selectedModules.has("mail") ||
            selectedModules.has("databases")) && (
            <div className={usersStyles.scopeSection}>
              <div className={usersStyles.permTitle} style={{ fontSize: 12 }}>
                Optional resource scope (leave unchecked to allow all items in that module)
              </div>

              {selectedModules.has("apps") && resources.apps.length > 0 && (
                <div className={usersStyles.scopeGroup}>
                  <div className={usersStyles.scopeLabel}>Allowed Apps</div>
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

              {(selectedModules.has("domains") || selectedModules.has("mail")) &&
                resources.domains.length > 0 && (
                  <div className={usersStyles.scopeGroup}>
                    <div className={usersStyles.scopeLabel}>Allowed Domains</div>
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

              {selectedModules.has("databases") && resources.databases.length > 0 && (
                <div className={usersStyles.scopeGroup}>
                  <div className={usersStyles.scopeLabel}>Allowed Databases</div>
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
      )}

      {state?.ok === false && (
        <div className={styles.error} style={{ marginBottom: 12 }}>
          {state.error}
        </div>
      )}
      {state?.ok === true && (
        <div className={styles.notice} style={{ marginBottom: 12 }}>
          User created and authorized.
        </div>
      )}

      <button type="submit" className={styles.btn} disabled={pending}>
        {pending ? "Creating..." : "Create user"}
      </button>
    </form>
  );
}
