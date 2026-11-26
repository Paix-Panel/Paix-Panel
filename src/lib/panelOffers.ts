export type PackageKind = "vps" | "hosting";

export type PanelChoiceId =
  | "paix"
  | "cpanel"
  | "aapanel"
  | "cyberpanel"
  | "hestia"
  | "plesk"
  | "custom";

export type PanelOfferOption = {
  id: PanelChoiceId;
  name: string;
  badge: string;
  tagline: string;
  defaultPort: number;
  installerCmd: string;
  docsNote: string;
};

export const PANEL_OFFER_CATALOG: PanelOfferOption[] = [
  {
    id: "paix",
    name: "Paix Panel",
    badge: "FREE · Included",
    tagline:
      "Pre-installed modern panel with Apps, Docker, Domains, Auto-SSL, Databases, Mailboxes, Files & Terminal — zero extra license cost.",
    defaultPort: 3000,
    installerCmd: "Already active in your Paix Panel account.",
    docsNote: "Ready immediately — manage your VPS directly using the sidebar modules.",
  },
  {
    id: "aapanel",
    name: "aaPanel",
    badge: "External via SSH",
    tagline:
      "Lightweight web hosting control panel (LAMP/LNMP, FTP, Docker, Cron) installed on your VPS via SSH.",
    defaultPort: 7800,
    installerCmd:
      "URL=https://www.aapanel.com/script/install_7.0_en.sh && if [ -f /usr/bin/curl ]; then curl -ksSO $URL; else wget --no-check-certificate -O install_7.0_en.sh $URL; fi; bash install_7.0_en.sh aapanel",
    docsNote: "Connect via SSH and run the official installer, then save your panel URL below.",
  },
  {
    id: "cyberpanel",
    name: "CyberPanel",
    badge: "External via SSH",
    tagline:
      "OpenLiteSpeed / LiteSpeed powered web hosting panel with DNS, Mail, and WordPress optimization.",
    defaultPort: 8090,
    installerCmd: "sh <(curl https://cyberpanel.net/install.sh || wget -O - https://cyberpanel.net/install.sh)",
    docsNote: "Requires clean Ubuntu/AlmaLinux root SSH session. Open port 8090 in firewall after setup.",
  },
  {
    id: "cpanel",
    name: "cPanel & WHM",
    badge: "BYO License via SSH",
    tagline:
      "Commercial WHM/cPanel server suite — connect via SSH with your own cPanel license.",
    defaultPort: 2087,
    installerCmd: "cd /home && curl -o latest -L https://securedownloads.cpanel.net/latest && sh latest",
    docsNote: "Requires a valid cPanel license for your server IP and a clean AlmaLinux/Ubuntu LTS host.",
  },
  {
    id: "hestia",
    name: "HestiaCP",
    badge: "External via SSH",
    tagline:
      "Fast open-source Debian/Ubuntu control panel with Nginx + Apache, Exim, Dovecot, and Bind9.",
    defaultPort: 8083,
    installerCmd:
      "wget https://raw.githubusercontent.com/hestiacp/hestiacp/release/install/hst-install.sh && bash hst-install.sh",
    docsNote: "Ideal for Ubuntu/Debian VPS instances. Access on port 8083 once finished.",
  },
  {
    id: "plesk",
    name: "Plesk Obsidian",
    badge: "BYO License via SSH",
    tagline: "Commercial multi-site web hosting and WordPress toolkit control panel.",
    defaultPort: 8443,
    installerCmd: "sh <(curl https://autoinstall.plesk.com/one-click-installer || wget -O - https://autoinstall.plesk.com/one-click-installer)",
    docsNote: "Requires Plesk license key after one-click SSH installation.",
  },
  {
    id: "custom",
    name: "Custom Panel / Upload Installer",
    badge: "Bring Your Own",
    tagline:
      "Upload your own control panel archive/script via File Manager or run a custom install script over SSH.",
    defaultPort: 8443,
    installerCmd: "# Upload your installer in /files or paste your custom bash install command below",
    docsNote: "Use your SSH IP & credentials or the Web Terminal to deploy any panel you prefer.",
  },
];

export const OS_TEMPLATES = [
  "Ubuntu 24.04 LTS",
  "Ubuntu 22.04 LTS",
  "Debian 12 Bookworm",
  "AlmaLinux 9",
  "Rocky Linux 9",
] as const;

export function findPanelOffer(id: string | null | undefined): PanelOfferOption {
  return PANEL_OFFER_CATALOG.find((p) => p.id === id) ?? PANEL_OFFER_CATALOG[0];
}
