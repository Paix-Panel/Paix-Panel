"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, FolderUp, KeyRound, Terminal } from "lucide-react";
import type { VpsInstanceView } from "@/lib/provisioning";
import {
  PANEL_OFFER_CATALOG,
  findPanelOffer,
  type PanelChoiceId,
} from "@/lib/panelOffers";
import { updateMyVpsPanelChoiceAction, type ActionResult } from "@/server-actions/vps";
import { useFormActionState } from "@/lib/useFormActionState";
import StatusBadge from "@/components/StatusBadge/StatusBadge";
import pageStyles from "@/components/page.module.css";
import styles from "./vps.module.css";

function fmtRam(mb: number): string {
  if (mb >= 1024) {
    const gb = mb / 1024;
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
  }
  return `${mb} MB`;
}

export default function VpsTenantCard({ vps }: { vps: VpsInstanceView }) {
  const router = useRouter();
  const [selectedPanel, setSelectedPanel] = useState<PanelChoiceId>(vps.panel_choice || "paix");
  const [customName, setCustomName] = useState(vps.custom_panel_name || "");
  const [customUrl, setCustomUrl] = useState(vps.custom_panel_url || "");
  const [customCmd, setCustomCmd] = useState(vps.custom_installer_cmd || "");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const boundSave = useMemo(() => updateMyVpsPanelChoiceAction.bind(null, vps.id), [vps.id]);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending, keepRef] = useFormActionState<ActionResult | null>(
    boundSave,
    null,
    formRef,
  );

  useEffect(() => {
    setSelectedPanel(vps.panel_choice || "paix");
    setCustomName(vps.custom_panel_name || "");
    setCustomUrl(vps.custom_panel_url || "");
    setCustomCmd(vps.custom_installer_cmd || "");
  }, [vps.id, vps.panel_choice, vps.custom_panel_name, vps.custom_panel_url, vps.custom_installer_cmd]);

  useEffect(() => {
    if (state?.ok === true) {
      router.refresh();
    }
  }, [state, router]);

  const offer = findPanelOffer(selectedPanel);
  const sshCommand = `ssh ${vps.ssh_user || "root"}@${vps.ssh_ip}${vps.ssh_port !== 22 ? ` -p ${vps.ssh_port}` : ""}`;

  const copyText = (key: string, text: string) => {
    navigator.clipboard?.writeText(text).catch(() => null);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((cur) => (cur === key ? null : cur)), 1800);
  };

  return (
    <div>
      {/* VPS Specs Strip */}
      <div className={pageStyles.section}>
        <div className={styles.sshRow} style={{ marginBottom: 14 }}>
          <div>
            <h2 className={pageStyles.sectionTitle} style={{ margin: 0 }}>
              {vps.name}
            </h2>
            <div className={pageStyles.muted} style={{ fontSize: 12, marginTop: 2 }}>
              Plan: <strong>{vps.package_name}</strong> · OS: {vps.os_template} · Owner:{" "}
              <span className={styles.mono}>{vps.owner_email}</span>
            </div>
          </div>
          <StatusBadge
            text={vps.status}
            tone={vps.status === "active" ? "ok" : vps.status === "suspended" ? "warn" : "danger"}
          />
        </div>

        <div className={styles.specStrip}>
          <div className={styles.specTile}>
            <div className={styles.specLabel}>CPU Cores</div>
            <div className={styles.specVal}>{vps.cpu_cores} vCPU</div>
          </div>
          <div className={styles.specTile}>
            <div className={styles.specLabel}>RAM Memory</div>
            <div className={styles.specVal}>{fmtRam(vps.ram_mb)}</div>
          </div>
          <div className={styles.specTile}>
            <div className={styles.specLabel}>Storage Allocation</div>
            <div className={styles.specVal}>{vps.storage_gb} GB NVMe</div>
          </div>
          <div className={styles.specTile}>
            <div className={styles.specLabel}>Monthly Bandwidth</div>
            <div className={styles.specVal}>
              {vps.bandwidth_gb > 0 ? `${vps.bandwidth_gb} GB` : "Unlimited"}
            </div>
          </div>
          <div className={styles.specTile}>
            <div className={styles.specLabel}>Network Speed</div>
            <div className={styles.specVal}>{vps.port_speed_mbps || 1000} Mbps</div>
          </div>
        </div>

        {/* SSH Access Section */}
        <h3 className={pageStyles.sectionTitle} style={{ marginBottom: 8 }}>
          SSH Access &amp; Server Credentials
        </h3>
        <div className={styles.sshBox}>
          <div className={styles.sshRow}>
            <div style={{ fontSize: 13 }}>
              <span className={pageStyles.muted}>IP Address:</span>{" "}
              <strong className={styles.mono}>{vps.ssh_ip}</strong>
              <span className={pageStyles.muted} style={{ margin: "0 10px" }}>
                ·
              </span>
              <span className={pageStyles.muted}>Port:</span>{" "}
              <strong className={styles.mono}>{vps.ssh_port}</strong>
              <span className={pageStyles.muted} style={{ margin: "0 10px" }}>
                ·
              </span>
              <span className={pageStyles.muted}>Username:</span>{" "}
              <strong className={styles.mono}>{vps.ssh_user || "root"}</strong>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button
                type="button"
                className={pageStyles.btnGhost}
                onClick={() => copyText("ssh_ip", vps.ssh_ip)}
              >
                {copiedKey === "ssh_ip" ? <Check size={12} /> : <Copy size={12} />} Copy IP
              </button>
              <Link href="/terminal" className={pageStyles.btnGhost}>
                <Terminal size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
                Web Terminal
              </Link>
              <Link href="/ssh-keys" className={pageStyles.btnGhost}>
                <KeyRound size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
                SSH Keys
              </Link>
            </div>
          </div>

          <div className={styles.sshRow}>
            <code className={styles.cmdPre} style={{ flex: 1 }}>
              {sshCommand}
            </code>
            <button
              type="button"
              className={pageStyles.btn}
              onClick={() => copyText("ssh_cmd", sshCommand)}
            >
              {copiedKey === "ssh_cmd" ? "Copied SSH Command" : "Copy SSH Command"}
            </button>
          </div>
        </div>
      </div>

      {/* Control Panel Choice Card */}
      <div className={pageStyles.section}>
        <div className={styles.sshRow} style={{ marginBottom: 10 }}>
          <div>
            <h2 className={pageStyles.sectionTitle} style={{ margin: 0 }}>
              Control Panel Offer — Paix Panel (Free) or Bring Your Own Panel
            </h2>
            <p className={pageStyles.muted} style={{ fontSize: 12, marginTop: 2 }}>
              Use Paix Panel included free inside this workspace, or connect via SSH to install
              cPanel/WHM, aaPanel, CyberPanel, HestiaCP, Plesk, or upload your own installer.
            </p>
          </div>
          <StatusBadge
            text={selectedPanel === "paix" ? "Paix Panel Free Active" : `Custom: ${offer.name}`}
            tone={selectedPanel === "paix" ? "ok" : "info"}
          />
        </div>

        <form ref={keepRef} action={formAction}>
          <input type="hidden" name="panel_choice" value={selectedPanel} />

          <div className={styles.panelGrid} role="radiogroup" aria-label="Control panel choice">
            {PANEL_OFFER_CATALOG.map((item) => {
              const active = selectedPanel === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedPanel(item.id)}
                  className={`${styles.panelOption} ${active ? styles.panelOptionActive : ""}`}
                >
                  <div className={styles.panelHead}>
                    <span className={styles.panelName}>{item.name}</span>
                    <span className={styles.panelBadge}>{item.badge}</span>
                  </div>
                  <div className={styles.panelDesc}>{item.tagline}</div>
                </button>
              );
            })}
          </div>

          {selectedPanel === "paix" ? (
            <div className={styles.sshBox} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13 }}>
                <strong>Paix Panel is included FREE on your VPS.</strong> Use the left navigation to
                manage Apps &amp; Docker, Domains &amp; Auto-SSL, File Manager (ZIP &amp; Folder
                upload), MariaDB/PostgreSQL, Email &amp; Webmail, Firewall, Backups, and Terminal.
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Link href="/apps" className={pageStyles.btn}>
                  Open Apps &amp; Deployments
                </Link>
                <Link href="/domains" className={pageStyles.btnGhost}>
                  Domains &amp; SSL
                </Link>
                <Link href="/files" className={pageStyles.btnGhost}>
                  File Manager
                </Link>
                <Link href="/databases" className={pageStyles.btnGhost}>
                  Databases
                </Link>
              </div>
            </div>
          ) : (
            <div className={styles.sshBox} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13 }}>
                <strong>Install {offer.name} over SSH</strong> — {offer.docsNote}
              </div>

              <div>
                <div className={pageStyles.muted} style={{ fontSize: 12, marginBottom: 4 }}>
                  Recommended SSH Installer Command (run as root via SSH or Web Terminal):
                </div>
                <div className={styles.sshRow}>
                  <pre className={styles.cmdPre} style={{ flex: 1 }}>
                    {selectedPanel === "custom" && customCmd
                      ? customCmd
                      : offer.installerCmd}
                  </pre>
                  <button
                    type="button"
                    className={pageStyles.btnGhost}
                    onClick={() =>
                      copyText(
                        "inst_cmd",
                        selectedPanel === "custom" && customCmd ? customCmd : offer.installerCmd,
                      )
                    }
                  >
                    {copiedKey === "inst_cmd" ? <Check size={12} /> : <Copy size={12} />} Copy
                    Command
                  </button>
                </div>
              </div>

              <div className={pageStyles.formRow} style={{ marginTop: 6, marginBottom: 0 }}>
                {selectedPanel === "custom" && (
                  <label className={pageStyles.field}>
                    Custom Panel Name
                    <input
                      name="custom_panel_name"
                      className={pageStyles.input}
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder="e.g. CloudPanel, ISPConfig, FastPanel"
                    />
                  </label>
                )}
                <label className={pageStyles.field}>
                  External Panel URL (after installation, port {offer.defaultPort})
                  <input
                    name="custom_panel_url"
                    type="url"
                    className={`${pageStyles.input} ${styles.mono}`}
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                    placeholder={`https://${vps.ssh_ip}:${offer.defaultPort}`}
                  />
                </label>
              </div>

              {selectedPanel === "custom" && (
                <label className={pageStyles.field} style={{ marginTop: 8 }}>
                  Custom Installer Script / Notes
                  <textarea
                    name="custom_installer_cmd"
                    className={pageStyles.textarea}
                    value={customCmd}
                    onChange={(e) => setCustomCmd(e.target.value)}
                    placeholder="curl -sSL https://... | bash  OR upload your .zip/.sh file in File Manager"
                    style={{ minHeight: 72 }}
                  />
                </label>
              )}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                <Link href="/files" className={pageStyles.btnGhost}>
                  <FolderUp size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
                  Upload Panel Package / Script in Files
                </Link>
                <Link href="/terminal" className={pageStyles.btnGhost}>
                  <Terminal size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
                  Open Terminal to Run Installer
                </Link>
                {vps.custom_panel_url && (
                  <a
                    href={vps.custom_panel_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={pageStyles.btnGhost}
                  >
                    <ExternalLink size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
                    Launch Saved Panel URL
                  </a>
                )}
              </div>
            </div>
          )}

          {state?.ok === false && <div className={pageStyles.error}>{state.error}</div>}
          {state?.ok === true && (
            <div className={pageStyles.notice}>Control panel preference saved.</div>
          )}

          <button type="submit" className={pageStyles.btn} disabled={pending}>
            {pending ? "Saving Choice..." : "Save Control Panel Choice"}
          </button>
        </form>
      </div>
    </div>
  );
}
