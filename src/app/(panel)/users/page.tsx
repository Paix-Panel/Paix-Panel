import { agent } from "@/lib/agent";
import { isAdminRole, isSuperAdmin, requireSession } from "@/lib/auth";
import { normalizeRole, parsePermissions, roleDisplayLabel } from "@/lib/permissions";
import Table from "@/components/Table/Table";
import StatusBadge from "@/components/StatusBadge/StatusBadge";
import AccessRestricted from "@/components/AccessRestricted/AccessRestricted";
import styles from "@/components/page.module.css";
import {
  createPanelUserAction,
  createSystemUserAction,
  deletePanelUserAction,
  deleteSystemUserAction,
  listAssignableResources,
  listPanelUsers,
  listSystemUsers,
  resetPanelUserPasswordAction,
  setRootPasswordAction,
  setSystemUserPasswordAction,
  updatePanelUserPermissionsAction,
} from "@/server-actions/users";
import FormDialogButton from "@/components/FormDialogButton/FormDialogButton";
import RootPasswordForm from "./RootPasswordForm";
import SshAvailabilityNotice from "./SshAvailabilityNotice";
import AddPanelUserForm from "./AddPanelUserForm";
import AddSystemUserForm from "./AddSystemUserForm";
import PanelUserActions from "./PanelUserActions";
import SystemUserActions from "./SystemUserActions";
import users from "./users.module.css";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await requireSession();
  if (!isAdminRole(session.role)) {
    return (
      <AccessRestricted
        title="User Management Restricted"
        message="Only Super Admins and Admins can create panel users, assign roles, or manage server permissions."
      />
    );
  }

  const actorIsSuper = isSuperAdmin(session.role);
  const sshConfig = await agent.ssh.getConfig().catch(() => null);

  const [panelUsers, linuxUsers, resources] = await Promise.all([
    listPanelUsers(),
    listSystemUsers(),
    listAssignableResources(),
  ]);
  const currentUserId = session.userId;
  const humanLinuxUsers = linuxUsers.filter((u) => u.is_human);
  const serviceLinuxUsers = linuxUsers.filter((u) => !u.is_human);

  return (
    <div>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Users &amp; Permissions</h1>
          <div className={styles.subtitle}>
            Super Admin, Admin, and task-scoped operator accounts (Password + Google SSO), plus Linux host accounts.
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <div className={users.cardHead}>
          <div>
            <h2 className={styles.sectionTitle}>Panel users &amp; access control</h2>
            <p className={styles.muted}>
              Manage panel operators, Google Sign-In authorization, and granular cPanel-style task
              permissions (Apps, Domains, Databases, Mail, Files).
            </p>
          </div>
          <FormDialogButton label="+ Add panel user" title="Add panel user">
            <p className={styles.muted} style={{ marginBottom: 12 }}>
              Create an authorized account. Super Admins can create Admins or Super Admins; Admins
              and Super Admins can create task-scoped Users and choose which domains, apps, and
              databases they can access.
            </p>
            <AddPanelUserForm
              action={createPanelUserAction}
              canCreateAdmins={actorIsSuper}
              resources={resources}
            />
          </FormDialogButton>
        </div>
        <Table
          columns={[
            { key: "email", label: "User" },
            { key: "role", label: "Role", width: "120px" },
            { key: "access", label: "Assigned Tasks & Scopes" },
            { key: "sso", label: "Google / 2FA", width: "130px" },
            { key: "status", label: "Status", width: "100px" },
            { key: "actions", label: "", width: "230px" },
          ]}
          rowKey={(_r, i) => panelUsers[i].id}
          rows={panelUsers.map((u) => {
            const isSelf = u.id === currentUserId;
            const targetRole = normalizeRole(u.role);
            const parsed = parsePermissions(u.permissions_json);
            const canManageTarget =
              !isSelf && (actorIsSuper || targetRole === "user");
            const scopeNotes = [
              parsed.scopes?.apps?.length ? `apps: ${parsed.scopes.apps.join(", ")}` : null,
              parsed.scopes?.domains?.length
                ? `domains: ${parsed.scopes.domains.join(", ")}`
                : null,
              parsed.scopes?.databases?.length
                ? `dbs: ${parsed.scopes.databases.join(", ")}`
                : null,
            ].filter(Boolean);

            return {
              email: (
                <div>
                  <strong>{u.display_name || u.email}</strong>
                  {isSelf && (
                    <span className={styles.muted} style={{ marginLeft: 6 }}>
                      (you)
                    </span>
                  )}
                  <div className={styles.muted} style={{ fontSize: 12 }}>
                    {u.email}
                  </div>
                </div>
              ),
              role: (
                <StatusBadge
                  text={roleDisplayLabel(targetRole)}
                  tone={
                    targetRole === "super_admin"
                      ? "info"
                      : targetRole === "admin" || targetRole === "vps_admin"
                        ? "ok"
                        : targetRole === "hosting_admin"
                          ? "warn"
                          : "muted"
                  }
                />
              ),
              access:
                targetRole === "super_admin" || targetRole === "admin" ? (
                  <span className={styles.muted} style={{ fontSize: 12 }}>
                    Full server access
                  </span>
                ) : (
                  <div>
                    <div className={users.badgeList}>
                      {parsed.modules.length > 0 ? (
                        parsed.modules.map((m) => (
                          <span key={m} className={users.permTag}>
                            {m}
                          </span>
                        ))
                      ) : (
                        <span className={styles.muted} style={{ fontSize: 12 }}>
                          No modules assigned
                        </span>
                      )}
                    </div>
                    {scopeNotes.length > 0 && (
                      <div className={styles.muted} style={{ fontSize: 11, marginTop: 4 }}>
                        {scopeNotes.join(" · ")}
                      </div>
                    )}
                  </div>
                ),
              sso: (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <StatusBadge
                    text={u.google_enabled ? "Google" : "No SSO"}
                    tone={u.google_enabled ? "ok" : "muted"}
                  />
                  {u.totp_enabled ? <StatusBadge text="2FA" tone="ok" /> : null}
                </div>
              ),
              status: (
                <StatusBadge
                  text={u.is_active ? "active" : "suspended"}
                  tone={u.is_active ? "ok" : "danger"}
                />
              ),
              actions: isSelf ? (
                <span
                  className={styles.muted}
                  title="Use /settings to change your own password / email"
                  style={{ fontSize: 12 }}
                >
                  self — /settings
                </span>
              ) : (
                <PanelUserActions
                  userId={u.id}
                  email={u.email}
                  displayName={u.display_name}
                  role={targetRole}
                  permissionsJson={u.permissions_json}
                  googleEnabled={Boolean(u.google_enabled)}
                  isActive={Boolean(u.is_active)}
                  canManageTarget={canManageTarget}
                  canChangeRole={actorIsSuper}
                  resources={resources}
                  updatePermissionsAction={updatePanelUserPermissionsAction.bind(null, u.id)}
                  resetAction={resetPanelUserPasswordAction.bind(null, u.id)}
                  deleteAction={deletePanelUserAction.bind(null, u.id)}
                />
              ),
            };
          })}
          empty="No panel users yet."
        />
      </div>

      <div className={styles.section}>
        <div className={users.cardHead}>
          <div>
            <h2 className={styles.sectionTitle}>Linux users</h2>
            <p className={styles.muted}>
              Real OS-level accounts on this host (root +{" "}
              <span className={styles.code}>UID ≥ 1000</span>). The agent reads{" "}
              <span className={styles.code}>/etc/passwd</span> directly, so
              accounts added with{" "}
              <span className={styles.code}>adduser</span> at a shell appear here
              too.
            </p>
          </div>
          <FormDialogButton label="+ Add Linux user" title="Add Linux user">
            <AddSystemUserForm action={createSystemUserAction} />
          </FormDialogButton>
        </div>
        <Table
          columns={[
            { key: "name", label: "Username" },
            { key: "uid", label: "UID", width: "70px" },
            { key: "home", label: "Home" },
            { key: "shell", label: "Shell", width: "120px" },
            { key: "sudo", label: "sudo", width: "70px" },
            { key: "actions", label: "", width: "220px" },
          ]}
          rowKey={(_r, i) => humanLinuxUsers[i].name}
          rows={humanLinuxUsers.map((u) => {
            const isRoot = u.name === "root";
            return {
              name: (
                <span>
                  <strong>{u.name}</strong>
                  {isRoot && (
                    <span className={styles.muted} style={{ marginLeft: 6 }}>
                      (system root)
                    </span>
                  )}
                </span>
              ),
              uid: <span className={styles.muted}>{u.uid}</span>,
              home: <span className={styles.code}>{u.home}</span>,
              shell: <span className={styles.code}>{u.shell || "—"}</span>,
              sudo: u.sudo ? (
                <StatusBadge text="yes" tone="ok" />
              ) : (
                <StatusBadge text="no" tone="muted" />
              ),
              actions: isRoot ? (
                <FormDialogButton
                  label="Reset password"
                  title="Set the root password"
                  className={styles.btnGhost}
                  buttonStyle={{ fontSize: 12, padding: "4px 10px" }}
                >
                  <p className={styles.muted} style={{ marginBottom: 12 }}>
                    Resets the OS-level <span className={styles.code}>root</span>{" "}
                    password (<span className={styles.code}>/etc/shadow</span>). Useful
                    when the password for the Hetzner / OVH web console is lost.
                  </p>
                  <SshAvailabilityNotice config={sshConfig} />
                  <RootPasswordForm action={setRootPasswordAction} />
                </FormDialogButton>
              ) : u.reserved ? (
                <span
                  className={styles.muted}
                  title="Reserved system account: the panel does not reset or delete it"
                  style={{ fontSize: 12 }}
                >
                  reserved
                </span>
              ) : (
                <SystemUserActions
                  name={u.name}
                  home={u.home}
                  resetAction={setSystemUserPasswordAction.bind(null, u.name)}
                  deleteAction={deleteSystemUserAction.bind(null, u.name)}
                />
              ),
            };
          })}
          empty="No Linux user accounts beyond root yet."
        />

        {serviceLinuxUsers.length > 0 && (
          <details style={{ marginTop: 16 }}>
            <summary className={styles.muted} style={{ cursor: "pointer", fontSize: 12 }}>
              Service accounts ({serviceLinuxUsers.length}) — read-only
            </summary>
            <div style={{ marginTop: 10 }}>
              <Table
                columns={[
                  { key: "name", label: "Username" },
                  { key: "uid", label: "UID", width: "70px" },
                  { key: "home", label: "Home" },
                  { key: "shell", label: "Shell", width: "120px" },
                ]}
                rows={serviceLinuxUsers.map((u) => ({
                  name: <strong>{u.name}</strong>,
                  uid: <span className={styles.muted}>{u.uid}</span>,
                  home: <span className={styles.code}>{u.home}</span>,
                  shell: <span className={styles.code}>{u.shell || "—"}</span>,
                }))}
                empty="—"
              />
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
