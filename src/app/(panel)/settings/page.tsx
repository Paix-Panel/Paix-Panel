import Link from "next/link";
import { changePasswordAction, changeAdminEmailAction } from "@/server-actions/auth";
import { hasPermission, isAdminRole, requireSession } from "@/lib/auth";
import {
  clearGoogleAuthAction,
  saveGoogleAuthAction,
  setPanelTimezoneAction,
  setSettingAction,
  setTabTitleAction,
  setUploadLimitAction,
} from "@/server-actions/settings";
import { DEFAULT_TAB_TITLE, TAB_TITLE_KEY, tabTitleOrDefault } from "@/lib/tabTitle";
import { setSshServerConfigAction } from "@/server-actions/ssh";
import { setRootPasswordAction } from "@/server-actions/users";
import { setAcmeEmailAction } from "@/server-actions/acme";
import {
  setThemeAction,
  saveThemeAsAction,
  updateSavedThemeAction,
  renameSavedThemeAction,
  deleteSavedThemeAction,
} from "@/server-actions/theme";
import {
  setPanelHostAction,
  completePanelHostSetupAction,
} from "@/server-actions/panelHost";
import {
  generateMcpTokenAction,
  clearMcpTokenAction,
  setMcpScopeAction,
} from "@/server-actions/mcpToken";
import { getSetting } from "@/lib/settings";
import { getGoogleAuthPublicStatus } from "@/lib/googleAuth";
import {
  ACCENT_SETTING_KEY,
  THEME_SETTING_KEY,
  getThemeLibrary,
} from "@/lib/accent";
import { getMcpTokenInfo } from "@/lib/mcpToken";
import { agent } from "@/lib/agent";
import { config, ACCESS_TTL_SECONDS } from "@/lib/config";
import styles from "@/components/page.module.css";
import ChangePasswordForm from "./ChangePasswordForm";
import IpAllowlistForm from "./IpAllowlistForm";
import PanelAccessForm from "./PanelAccessForm";
import { setPanelAccessAction } from "@/server-actions/panelAccess";
import { PANEL_ACCESS_KEY } from "@/lib/panelAccess";
import { getClientIp } from "@/lib/getClientIp";
import SessionTimeoutForm from "./SessionTimeoutForm";
import SshServerForm from "./SshServerForm";
import RootPasswordForm from "../users/RootPasswordForm";
import SshAvailabilityNotice from "../users/SshAvailabilityNotice";
import AcmeEmailForm from "./AcmeEmailForm";
import NameserverPairForm from "./NameserverPairForm";
import PanelHostForm from "./PanelHostForm";
import AdminEmailForm from "./AdminEmailForm";
import TimezoneForm from "./TimezoneForm";
import UploadLimitForm from "./UploadLimitForm";
import { UPLOAD_LIMIT_MAX_MB, uploadLimitMb } from "@/lib/uploadLimit";
import ThemeForm from "./ThemeForm";
import TabTitleForm from "./TabTitleForm";
import McpTokenForm from "./McpTokenForm";
import GoogleAuthForm from "./GoogleAuthForm";
import SwapForm from "./SwapForm";
import { setSwapAction } from "@/server-actions/swap";
import HostnameForm from "./HostnameForm";
import { setServerHostnameAction } from "@/server-actions/hostname";
import { isIP } from "node:net";
import SettingsTabs, { type SettingsTab } from "./SettingsTabs";
import MailIpSection, { loadMailIpSettings } from "./MailIpSection";
import PrivacySection, { loadPrivacy } from "./PrivacySection";
import LiveAccessForm from "@/components/LiveAccessPanel/LiveAccessForm";
import { detectPublicIp, getLiveAccessPublicState } from "@/lib/liveAccess";
import {
  saveLiveAccessAction,
  syncLiveAccessNowAction,
} from "@/server-actions/liveAccess";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireSession();
  const isAdmin = isAdminRole(session.role);
  const canManageSettings = isAdmin || hasPermission(session, "settings");

  const accountTab: SettingsTab = {
    id: "account",
    label: "Account",
    content: (
      <>
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Account</h2>
          {isAdmin && (
            <>
              <p className={styles.muted} style={{ marginBottom: 10 }}>
                Change your sign-in email. You&apos;ll be signed out and asked to log in with
                the new email.
              </p>
              <AdminEmailForm
                currentEmail={session.email}
                action={changeAdminEmailAction}
              />
              <h3 className={styles.sectionTitle} style={{ marginTop: 20 }}>
                Password
              </h3>
            </>
          )}
          {!isAdmin && (
            <p className={styles.muted} style={{ marginBottom: 10 }}>
              Signed in as <span className={styles.code}>{session.email}</span>. Update your
              panel password below.
            </p>
          )}
          <ChangePasswordForm action={changePasswordAction} />
        </div>

        {canManageSettings && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Session security</h2>
            <p className={styles.muted} style={{ marginBottom: 10 }}>
              How long the panel stays signed in without use. Clicks and key presses in an
              open panel tab renew the session. Logins with Remember me last 30 days instead.
            </p>
            <SessionTimeoutForm
              value={await getSetting("panel.session_ttl_minutes", String(ACCESS_TTL_SECONDS / 60))}
              action={setSettingAction.bind(null, "panel.session_ttl_minutes")}
            />
          </div>
        )}
      </>
    ),
  };

  if (!canManageSettings) {
    return (
      <div>
        <div className={styles.head}>
          <div>
            <h1 className={styles.title}>Account Settings</h1>
            <div className={styles.subtitle}>Manage your personal login credentials.</div>
          </div>
        </div>
        <SettingsTabs tabs={[accountTab]} />
      </div>
    );
  }

  const ipAllowlist = await getSetting("panel.ip_allowlist", "");
  const panelAccess = await getSetting(PANEL_ACCESS_KEY, "");
  const clientIp = await getClientIp();
  const acmeEmail = await getSetting("panel.acme_email", "");
  const nsPair = await getSetting("dns.ns_pair", "");
  const panelTimezone = await getSetting("panel.timezone", "auto");
  const theme =
    (await getSetting(THEME_SETTING_KEY, "")) ||
    (await getSetting(ACCENT_SETTING_KEY, ""));
  const savedThemes = getThemeLibrary();
  const tabTitle = await getSetting(TAB_TITLE_KEY, "");
  const mcpInfo = getMcpTokenInfo();
  const mcpEnvFallback = config.mcpToken !== null;
  const googleStatus = getGoogleAuthPublicStatus();
  const sshConfig = await agent.ssh
    .getConfig()
    .catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }));
  const swap = await agent.system
    .swap()
    .catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }));
  const hostname = await agent.system
    .hostname()
    .catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }));
  const panelHostName = config.panelHost && !isIP(config.panelHost) ? config.panelHost : null;
  const mailIp = await loadMailIpSettings();
  const privacy = await loadPrivacy();
  const liveAccess = getLiveAccessPublicState();
  const detectedPublicIp =
    liveAccess.status.lastIp ?? (await detectPublicIp().catch(() => null));
  const pdnsZones = await agent.dns.listZones().catch(() => []);
  const panelHostCertStatus = config.panelHost
    ? await agent.sites
        .status(config.panelHost)
        .catch(() => ({
          cert_exists: false,
          cert_not_after: null,
          days_remaining: null,
        }))
    : null;

  const tabs: SettingsTab[] = [
    {
      id: "panel",
      label: "Panel",
      anchors: ["panel-host", "uploads"],
      content: (
        <>
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Access mode</h2>
            <p className={styles.muted} style={{ marginBottom: 10 }}>
              Currently running in{" "}
              <strong>
                {liveAccess.mode === "noip"
                  ? `No-IP Live (${liveAccess.provider.replace(/_/g, " ")})`
                  : "Direct IP Mode"}
              </strong>
              {liveAccess.mode === "noip" && liveAccess.hostname ? (
                <>
                  {" "}
                  for <span className={styles.code}>{liveAccess.hostname}</span>
                </>
              ) : null}
              .{" "}
              <Link href="/settings?tab=live-access" className={styles.code}>
                Switch IP / No-IP →
              </Link>
            </p>
          </div>

          <div className={styles.section} id="panel-host">
            <h2 className={styles.sectionTitle}>Panel hostname</h2>
            <p className={styles.muted} style={{ marginBottom: 10 }}>
              The FQDN this panel is accessible at. Leave blank for IP-only mode. Setting an FQDN
              rewrites the nginx vhost, Postfix, Dovecot, and registers the hostname under{" "}
              <span className={styles.code}>/domains</span>.
            </p>
            <PanelHostForm
              value={config.panelHost}
              saveAction={setPanelHostAction}
              completeAction={completePanelHostSetupAction}
              managedZones={pdnsZones.map((z) => z.name)}
              certStatus={panelHostCertStatus}
            />
          </div>

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Panel timezone</h2>
            <p className={styles.muted} style={{ marginBottom: 10 }}>
              Controls how times are displayed in the top-bar clock and the audit log&apos;s day
              grouping.
            </p>
            <TimezoneForm value={panelTimezone} action={setPanelTimezoneAction} />
          </div>

          <div className={styles.section} id="uploads">
            <h2 className={styles.sectionTitle}>Uploads</h2>
            <p className={styles.muted} style={{ marginBottom: 10 }}>
              The largest file one upload can carry, in Files and SQL imports (up to{" "}
              {UPLOAD_LIMIT_MAX_MB} MB).
            </p>
            <UploadLimitForm
              value={uploadLimitMb()}
              max={UPLOAD_LIMIT_MAX_MB}
              action={setUploadLimitAction}
            />
          </div>

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>System</h2>
            <ul style={{ display: "flex", flexDirection: "column", gap: 6, listStyle: "none" }}>
              <li>
                <span className={styles.muted}>Panel host:</span>{" "}
                <span className={styles.code}>{config.panelHost}</span>
              </li>
              <li>
                <span className={styles.muted}>Agent socket:</span>{" "}
                <span className={styles.code}>{config.agentSocket}</span>
              </li>
              <li>
                <span className={styles.muted}>Database:</span>{" "}
                <span className={styles.code}>{config.panelDbPath}</span>
              </li>
            </ul>
          </div>
        </>
      ),
    },
    {
      id: "live-access",
      label: "IP / No-IP",
      anchors: ["live-access", "ddns"],
      content: (
        <div className={styles.section} id="live-access">
          <h2 className={styles.sectionTitle}>
            Server Access Mode (IP vs No-IP Live)
          </h2>
          <p className={styles.muted} style={{ marginBottom: 12 }}>
            Switch between <strong>Direct IP</strong> and{" "}
            <strong>No-IP Dynamic Live</strong> mode. When running on shared
            internet, hotspot, or a dynamic ISP IP, No-IP mode keeps your
            server online 24/7 by syncing IP changes automatically or keeping an
            outbound Cloudflare Tunnel open.
          </p>
          <LiveAccessForm
            initial={liveAccess}
            detectedIp={detectedPublicIp}
            panelHost={config.panelHost}
            saveAction={saveLiveAccessAction}
            syncAction={syncLiveAccessNowAction}
          />
        </div>
      ),
    },
    {
      id: "server",
      label: "Server",
      anchors: ["hostname", "ssh-server", "swap"],
      content: (
        <>
          <div className={styles.section} id="hostname">
            <h2 className={styles.sectionTitle}>Server hostname</h2>
            <p className={styles.muted} style={{ marginBottom: 10 }}>
              The system hostname printed by <span className={styles.code}>hostname</span>.
            </p>
            {"error" in hostname ? (
              <div className={styles.error}>
                Could not read the hostname: {hostname.error}
              </div>
            ) : (
              <HostnameForm
                status={hostname}
                panelHost={panelHostName}
                action={setServerHostnameAction}
              />
            )}
          </div>

          <div className={styles.section} id="ssh-server">
            <h2 className={styles.sectionTitle}>SSH server</h2>
            <p className={styles.muted} style={{ marginBottom: 10 }}>
              Port, idle timeout, password login and root login for the SSH daemon.
            </p>
            {"error" in sshConfig ? (
              <div className={styles.error}>
                Could not read the SSH server settings: {sshConfig.error}
              </div>
            ) : (
              <SshServerForm config={sshConfig} action={setSshServerConfigAction} />
            )}
            <h3 className={styles.sectionTitle} style={{ marginTop: 20 }}>
              Root password
            </h3>
            <p className={styles.muted} style={{ marginBottom: 10 }}>
              Sets the password of the Linux <span className={styles.code}>root</span> account (see
              also <Link href="/users" className={styles.code}>/users</Link>).
            </p>
            <SshAvailabilityNotice config={"error" in sshConfig ? null : sshConfig} inSettings />
            <RootPasswordForm action={setRootPasswordAction} />
          </div>

          <div className={styles.section} id="swap">
            <h2 className={styles.sectionTitle}>Swap</h2>
            <p className={styles.muted} style={{ marginBottom: 10 }}>
              Disk-backed emergency memory to keep heavy builds or traffic spikes from OOM-killing
              apps.
            </p>
            {"error" in swap ? (
              <div className={styles.error}>
                Could not read the swap settings: {swap.error}
              </div>
            ) : (
              <SwapForm status={swap} action={setSwapAction} />
            )}
          </div>
        </>
      ),
    },
    accountTab,
    {
      id: "appearance",
      label: "Appearance",
      anchors: ["theme", "tab-name"],
      content: (
        <>
          <div className={styles.section} id="theme">
            <h2 className={styles.sectionTitle}>Panel theme</h2>
            <p className={styles.muted} style={{ marginBottom: 10 }}>
              Customize accent colour, chrome tint, and ambient glow across the panel and login
              screen.
            </p>
            <ThemeForm
              value={theme}
              savedThemes={savedThemes}
              action={setThemeAction}
              saveAsAction={saveThemeAsAction}
              updateSavedAction={updateSavedThemeAction}
              renameSavedAction={renameSavedThemeAction}
              deleteSavedAction={deleteSavedThemeAction}
            />
          </div>

          <div className={styles.section} id="tab-name">
            <h2 className={styles.sectionTitle}>Browser tab</h2>
            <p className={styles.muted} style={{ marginBottom: 10 }}>
              Browser tab title (defaults to <span className={styles.code}>{DEFAULT_TAB_TITLE}</span>
              ). Current preview: <span className={styles.code}>{tabTitleOrDefault(tabTitle)}</span>
            </p>
            <TabTitleForm value={tabTitle} host={config.panelHost} action={setTabTitleAction} />
          </div>
        </>
      ),
    },
    {
      id: "security",
      label: "Security",
      anchors: ["google-sso", "mcp-token"],
      content: (
        <>
          {isAdmin && (
            <div className={styles.section} id="google-sso">
              <h2 className={styles.sectionTitle}>Google Sign-In (SSO)</h2>
              <p className={styles.muted} style={{ marginBottom: 10 }}>
                Allow authorized panel users (Super Admins, Admins, and approved Users) to sign in
                using their Google Account on <span className={styles.code}>/login</span>. Only
                emails registered under <Link href="/users" className={styles.code}>/users</Link>{" "}
                with Google Sign-In enabled are accepted.
              </p>
              <GoogleAuthForm
                clientId={googleStatus.clientId}
                hasSecret={googleStatus.hasSecret}
                enabled={googleStatus.enabled}
                source={googleStatus.source}
                saveAction={saveGoogleAuthAction}
                clearAction={clearGoogleAuthAction}
              />
            </div>
          )}

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Panel access</h2>
            <p className={styles.muted} style={{ marginBottom: 10 }}>
              IP allowlist for the panel and MCP endpoint. Your current address is{" "}
              <span className={styles.code}>{clientIp}</span>.
            </p>
            <PanelAccessForm value={panelAccess} clientIp={clientIp} action={setPanelAccessAction} />
          </div>

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Trusted IPs</h2>
            <p className={styles.muted} style={{ marginBottom: 10 }}>
              Comma-separated IPs or CIDRs that fail2ban never bans for failed mail logins.
            </p>
            <IpAllowlistForm
              value={ipAllowlist}
              action={setSettingAction.bind(null, "panel.ip_allowlist")}
            />
          </div>

          {isAdmin && (
            <div className={styles.section} id="mcp-token">
              <h2 className={styles.sectionTitle}>MCP token</h2>
              <p className={styles.muted} style={{ marginBottom: 10 }}>
                Bearer token for external AI clients connecting to{" "}
                <span className={styles.code}>/api/mcp</span>.
              </p>
              <McpTokenForm
                info={mcpInfo}
                envFallbackAvailable={mcpEnvFallback}
                generateAction={generateMcpTokenAction}
                setScopeAction={setMcpScopeAction}
                clearAction={clearMcpTokenAction}
              />
            </div>
          )}
        </>
      ),
    },
    {
      id: "privacy",
      label: "Privacy",
      anchors: ["privacy-logs", "privacy-retention", "privacy-lookups", "privacy-request"],
      content: <PrivacySection data={privacy} isAdmin={isAdmin} />,
    },
    {
      id: "mail",
      label: "Mail",
      anchors: ["mail-ip"],
      content: <MailIpSection settings={mailIp} />,
    },
    {
      id: "dns",
      label: "DNS & SSL",
      content: (
        <>
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>DNS nameserver pair</h2>
            <p className={styles.muted} style={{ marginBottom: 10 }}>
              Authoritative nameservers used when creating or reconciling PowerDNS zones.
            </p>
            <NameserverPairForm
              value={nsPair}
              action={setSettingAction.bind(null, "dns.ns_pair")}
            />
          </div>

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>SSL contact email</h2>
            <p className={styles.muted} style={{ marginBottom: 10 }}>
              Address Let&apos;s Encrypt uses for expiry and security notifications.
            </p>
            <AcmeEmailForm value={acmeEmail} action={setAcmeEmailAction} />
          </div>
        </>
      ),
    },
  ];

  return (
    <div>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Settings</h1>
          <div className={styles.subtitle}>
            Panel configuration, IP / No-IP live access, Google SSO, and account.
          </div>
        </div>
      </div>

      <SettingsTabs tabs={tabs} />
    </div>
  );
}
