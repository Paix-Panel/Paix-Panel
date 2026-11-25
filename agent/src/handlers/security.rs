use crate::error::{AgentError, AgentResult};
use crate::exec;
use crate::ipc::OkResponse;
use axum::{extract::Query, Json};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::net::IpAddr;
use std::sync::OnceLock;
use tokio::fs;

#[derive(Deserialize)]
pub struct OverviewQuery {
    #[serde(default = "default_lines")]
    pub lines: u32,
}

fn default_lines() -> u32 {
    300
}

#[derive(Deserialize)]
pub struct IpActionReq {
    pub ip: String,
}

#[derive(Serialize)]
pub struct SecurityPosture {
    pub ssh_port: u16,
    pub permit_root_login: String,
    pub password_auth: bool,
    pub idle_timeout_minutes: u32,
    pub root_authorized_keys: usize,
    pub ufw_enabled: bool,
    pub ufw_rules_count: usize,
    pub fail2ban_active: bool,
    pub total_banned_ips: usize,
    pub sshd_banned_ips: Vec<String>,
    pub sshd_total_failed: i64,
}

#[derive(Serialize)]
pub struct SshActiveSession {
    pub user: String,
    pub tty: String,
    pub source_ip: String,
    pub since: String,
    pub idle: String,
}

#[derive(Serialize)]
pub struct SshAttackerSummary {
    pub ip: String,
    pub failed_attempts: u32,
    pub invalid_user_attempts: u32,
    pub accepted_attempts: u32,
    pub usernames: Vec<String>,
    pub last_seen: String,
    pub banned: bool,
}

#[derive(Serialize)]
pub struct SshLogEvent {
    pub timestamp: String,
    pub event_type: String,
    pub user: Option<String>,
    pub ip: Option<String>,
    pub port: Option<u16>,
    pub method: Option<String>,
    pub raw: String,
}

#[derive(Serialize)]
pub struct SshLogStats {
    pub total_events: usize,
    pub failed_count: usize,
    pub invalid_user_count: usize,
    pub accepted_count: usize,
    pub unique_attacker_ips: usize,
}

#[derive(Serialize)]
pub struct SecurityOverview {
    pub alert_level: String,
    pub alerts: Vec<String>,
    pub posture: SecurityPosture,
    pub active_sessions: Vec<SshActiveSession>,
    pub attackers: Vec<SshAttackerSummary>,
    pub stats: SshLogStats,
    pub logs: Vec<SshLogEvent>,
}

pub async fn overview(Query(q): Query<OverviewQuery>) -> AgentResult<Json<SecurityOverview>> {
    let lines = q.lines.clamp(50, 1500);

    let ssh_cfg = crate::handlers::ssh::config_get()
        .await
        .map(|Json(c)| c)
        .unwrap_or(crate::handlers::ssh::SshServerConfig {
            port: 22,
            idle_timeout_minutes: 0,
            password_auth: false,
            permit_root_login: "prohibit-password".to_string(),
        });

    let fw = crate::handlers::firewall::status().await.map(|Json(f)| f).ok();
    let jails = crate::handlers::firewall::jails().await.map(|Json(j)| j).unwrap_or_default();

    let sshd_jail = jails.iter().find(|j| j.name == "sshd");
    let sshd_banned: Vec<String> = sshd_jail.map(|j| j.banned.clone()).unwrap_or_default();
    let sshd_banned_set: HashSet<String> = sshd_banned.iter().cloned().collect();
    let total_banned_ips: usize = jails.iter().map(|j| j.banned.len()).sum();
    let root_authorized_keys = count_root_keys().await;

    let ufw_enabled = fw.as_ref().map(|f| f.ufw_enabled).unwrap_or(false);
    let ufw_rules_count = fw.as_ref().map(|f| f.rules.len()).unwrap_or(0);
    let fail2ban_active = fw.as_ref().map(|f| f.fail2ban_active).unwrap_or(false);

    // Also inspect UFW explicit deny rules for manually blocked IPs.
    let ufw_denied_ips = extract_ufw_denied_ips(
        fw.as_ref().map(|f| f.rules.as_slice()).unwrap_or(&[]),
    );

    let posture = SecurityPosture {
        ssh_port: ssh_cfg.port,
        permit_root_login: ssh_cfg.permit_root_login.clone(),
        password_auth: ssh_cfg.password_auth,
        idle_timeout_minutes: ssh_cfg.idle_timeout_minutes,
        root_authorized_keys,
        ufw_enabled,
        ufw_rules_count,
        fail2ban_active,
        total_banned_ips,
        sshd_banned_ips: sshd_banned.clone(),
        sshd_total_failed: sshd_jail.map(|j| j.total_failed).unwrap_or(0),
    };

    let active_sessions = read_active_sessions().await;
    let raw_lines = read_ssh_journal_lines(lines).await;

    let mut logs: Vec<SshLogEvent> = Vec::with_capacity(raw_lines.len());
    let mut attacker_map: HashMap<String, AttackerAgg> = HashMap::new();
    let mut failed_count = 0usize;
    let mut invalid_user_count = 0usize;
    let mut accepted_count = 0usize;

    for line in &raw_lines {
        let ev = parse_ssh_log_line(line);
        match ev.event_type.as_str() {
            "failed_password" | "auth_failure" | "preauth_closed" => failed_count += 1,
            "invalid_user" => {
                failed_count += 1;
                invalid_user_count += 1;
            }
            "accepted_publickey" | "accepted_password" => accepted_count += 1,
            _ => {}
        }

        if let Some(ip) = &ev.ip {
            let agg = attacker_map.entry(ip.clone()).or_insert_with(|| AttackerAgg {
                ip: ip.clone(),
                failed_attempts: 0,
                invalid_user_attempts: 0,
                accepted_attempts: 0,
                usernames: HashSet::new(),
                last_seen: ev.timestamp.clone(),
            });
            if ev.timestamp > agg.last_seen {
                agg.last_seen = ev.timestamp.clone();
            }
            if let Some(u) = &ev.user {
                if agg.usernames.len() < 12 {
                    agg.usernames.insert(u.clone());
                }
            }
            match ev.event_type.as_str() {
                "failed_password" | "auth_failure" | "preauth_closed" => agg.failed_attempts += 1,
                "invalid_user" => {
                    agg.failed_attempts += 1;
                    agg.invalid_user_attempts += 1;
                }
                "accepted_publickey" | "accepted_password" => agg.accepted_attempts += 1,
                _ => {}
            }
        }
        logs.push(ev);
    }

    // Newest logs first so the operator immediately sees the latest attempts.
    logs.reverse();

    let mut attackers: Vec<SshAttackerSummary> = attacker_map
        .into_values()
        .filter(|a| a.failed_attempts > 0 || a.accepted_attempts > 0)
        .map(|a| {
            let mut users: Vec<String> = a.usernames.into_iter().collect();
            users.sort();
            let banned = sshd_banned_set.contains(&a.ip) || ufw_denied_ips.contains(&a.ip);
            SshAttackerSummary {
                ip: a.ip,
                failed_attempts: a.failed_attempts,
                invalid_user_attempts: a.invalid_user_attempts,
                accepted_attempts: a.accepted_attempts,
                usernames: users,
                last_seen: a.last_seen,
                banned,
            }
        })
        .collect();
    attackers.sort_by(|a, b| {
        b.failed_attempts
            .cmp(&a.failed_attempts)
            .then_with(|| b.last_seen.cmp(&a.last_seen))
    });
    attackers.truncate(60);

    let unique_attacker_ips = attackers.iter().filter(|a| a.failed_attempts > 0).count();

    let mut alerts = Vec::new();
    if !ufw_enabled {
        alerts.push("UFW firewall is inactive — enable UFW to restrict public ports.".into());
    }
    if !fail2ban_active {
        alerts.push("Fail2ban is not running — SSH brute-force attempts are not being auto-banned.".into());
    }
    if ssh_cfg.password_auth && ssh_cfg.permit_root_login == "yes" {
        alerts.push("Root password login over SSH is enabled (PermitRootLogin yes + PasswordAuthentication yes).".into());
    }
    if failed_count > 0 {
        alerts.push(format!(
            "{failed_count} failed or suspicious SSH login attempt(s) from {unique_attacker_ips} IP(s) in recent logs."
        ));
    }

    let alert_level = if !ufw_enabled
        || !fail2ban_active
        || (ssh_cfg.password_auth && ssh_cfg.permit_root_login == "yes")
        || failed_count >= 25
    {
        "critical"
    } else if failed_count > 0 {
        "elevated"
    } else {
        "ok"
    }
    .to_string();

    Ok(Json(SecurityOverview {
        alert_level,
        alerts,
        posture,
        active_sessions,
        attackers,
        stats: SshLogStats {
            total_events: logs.len(),
            failed_count,
            invalid_user_count,
            accepted_count,
            unique_attacker_ips,
        },
        logs,
    }))
}

pub async fn ban_ip(Json(req): Json<IpActionReq>) -> AgentResult<Json<OkResponse>> {
    let ip: IpAddr = req
        .ip
        .trim()
        .parse()
        .map_err(|_| AgentError::Invalid("invalid IP address".into()))?;
    if ip.is_loopback() || ip.is_unspecified() {
        return Err(AgentError::Invalid("cannot ban loopback/unspecified address".into()));
    }
    let ip_str = ip.to_string();

    let mut banned = false;
    if exec::run("fail2ban-client", ["set", "sshd", "banip", ip_str.as_str()])
        .await
        .is_ok()
    {
        banned = true;
    }
    if exec::run(
        "ufw",
        ["insert", "1", "deny", "from", ip_str.as_str(), "to", "any"],
    )
    .await
    .is_ok()
    {
        banned = true;
    }
    if !banned {
        return Err(AgentError::Invalid(format!(
            "could not ban {ip_str} via fail2ban or ufw"
        )));
    }
    Ok(Json(OkResponse::default()))
}

pub async fn unban_ip(Json(req): Json<IpActionReq>) -> AgentResult<Json<OkResponse>> {
    let ip: IpAddr = req
        .ip
        .trim()
        .parse()
        .map_err(|_| AgentError::Invalid("invalid IP address".into()))?;
    let ip_str = ip.to_string();

    let _ = exec::run("fail2ban-client", ["set", "sshd", "unbanip", ip_str.as_str()]).await;
    let _ = exec::run(
        "ufw",
        ["delete", "deny", "from", ip_str.as_str(), "to", "any"],
    )
    .await;
    Ok(Json(OkResponse::default()))
}

struct AttackerAgg {
    ip: String,
    failed_attempts: u32,
    invalid_user_attempts: u32,
    accepted_attempts: u32,
    usernames: HashSet<String>,
    last_seen: String,
}

async fn count_root_keys() -> usize {
    let Ok(body) = fs::read_to_string("/root/.ssh/authorized_keys").await else {
        return 0;
    };
    body.lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .count()
}

fn extract_ufw_denied_ips(rules: &[String]) -> HashSet<String> {
    let mut set = HashSet::new();
    for r in rules {
        let lower = r.to_ascii_lowercase();
        if !lower.contains("deny") {
            continue;
        }
        let tokens: Vec<&str> = r.split_whitespace().collect();
        for w in tokens.windows(2) {
            if w[0].eq_ignore_ascii_case("from") {
                if let Ok(ip) = w[1].parse::<IpAddr>() {
                    set.insert(ip.to_string());
                }
            }
        }
    }
    set
}

async fn read_active_sessions() -> Vec<SshActiveSession> {
    let Ok(out) = exec::run("who", ["-u"]).await else {
        return Vec::new();
    };
    let mut rows = Vec::new();
    for line in out.stdout.lines() {
        let cols: Vec<&str> = line.split_whitespace().collect();
        if cols.len() < 5 {
            continue;
        }
        let user = cols[0].to_string();
        let tty = cols[1].to_string();
        let since = format!("{} {}", cols[2], cols[3]);
        let idle = cols.get(4).copied().unwrap_or(".").to_string();
        let source_ip = line
            .rsplit('(')
            .next()
            .and_then(|s| s.split(')').next())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "local".to_string());
        rows.push(SshActiveSession {
            user,
            tty,
            source_ip,
            since,
            idle,
        });
    }
    rows
}

async fn read_ssh_journal_lines(limit: u32) -> Vec<String> {
    let n = limit.to_string();
    if let Ok(out) = exec::run(
        "journalctl",
        [
            "-u",
            "ssh",
            "-u",
            "sshd",
            "-n",
            n.as_str(),
            "--no-pager",
            "--output=short-iso",
        ],
    )
    .await
    {
        let lines: Vec<String> = out
            .stdout
            .lines()
            .filter(|l| !l.trim().is_empty() && !l.starts_with("-- "))
            .map(|s| s.to_string())
            .collect();
        if !lines.is_empty() {
            return lines;
        }
    }

    if let Ok(body) = fs::read_to_string("/var/log/auth.log").await {
        let mut lines: Vec<String> = body
            .lines()
            .filter(|l| l.contains("sshd"))
            .map(|s| s.to_string())
            .collect();
        if lines.len() > limit as usize {
            lines = lines.split_off(lines.len() - limit as usize);
        }
        return lines;
    }

    Vec::new()
}

fn parse_ssh_log_line(line: &str) -> SshLogEvent {
    static RE_ACCEPTED: OnceLock<regex::Regex> = OnceLock::new();
    static RE_FAILED_INVALID: OnceLock<regex::Regex> = OnceLock::new();
    static RE_FAILED: OnceLock<regex::Regex> = OnceLock::new();
    static RE_INVALID_USER: OnceLock<regex::Regex> = OnceLock::new();
    static RE_CLOSED_AUTH: OnceLock<regex::Regex> = OnceLock::new();
    static RE_PAM_FAIL: OnceLock<regex::Regex> = OnceLock::new();
    static RE_IP_FALLBACK: OnceLock<regex::Regex> = OnceLock::new();

    let timestamp = line.split_whitespace().next().unwrap_or("").to_string();

    if let Some(c) = RE_ACCEPTED
        .get_or_init(|| {
            regex::Regex::new(
                r"Accepted\s+(\S+)\s+for\s+(\S+)\s+from\s+(\S+)\s+port\s+(\d+)",
            )
            .unwrap()
        })
        .captures(line)
    {
        let method = c[1].to_string();
        let event_type = if method == "password" {
            "accepted_password"
        } else {
            "accepted_publickey"
        };
        return SshLogEvent {
            timestamp,
            event_type: event_type.to_string(),
            user: Some(c[2].to_string()),
            ip: Some(c[3].to_string()),
            port: c[4].parse().ok(),
            method: Some(method),
            raw: line.to_string(),
        };
    }

    if let Some(c) = RE_FAILED_INVALID
        .get_or_init(|| {
            regex::Regex::new(
                r"Failed\s+(\S+)\s+for\s+invalid\s+user\s+(\S+)\s+from\s+(\S+)\s+port\s+(\d+)",
            )
            .unwrap()
        })
        .captures(line)
    {
        return SshLogEvent {
            timestamp,
            event_type: "invalid_user".to_string(),
            user: Some(c[2].to_string()),
            ip: Some(c[3].to_string()),
            port: c[4].parse().ok(),
            method: Some(c[1].to_string()),
            raw: line.to_string(),
        };
    }

    if let Some(c) = RE_FAILED
        .get_or_init(|| {
            regex::Regex::new(
                r"Failed\s+(\S+)\s+for\s+(\S+)\s+from\s+(\S+)\s+port\s+(\d+)",
            )
            .unwrap()
        })
        .captures(line)
    {
        return SshLogEvent {
            timestamp,
            event_type: "failed_password".to_string(),
            user: Some(c[2].to_string()),
            ip: Some(c[3].to_string()),
            port: c[4].parse().ok(),
            method: Some(c[1].to_string()),
            raw: line.to_string(),
        };
    }

    if let Some(c) = RE_INVALID_USER
        .get_or_init(|| {
            regex::Regex::new(
                r"Invalid\s+user\s+(\S+)\s+from\s+(\S+)(?:\s+port\s+(\d+))?",
            )
            .unwrap()
        })
        .captures(line)
    {
        return SshLogEvent {
            timestamp,
            event_type: "invalid_user".to_string(),
            user: Some(c[1].to_string()),
            ip: Some(c[2].to_string()),
            port: c.get(3).and_then(|m| m.as_str().parse().ok()),
            method: None,
            raw: line.to_string(),
        };
    }

    if let Some(c) = RE_CLOSED_AUTH
        .get_or_init(|| {
            regex::Regex::new(
                r"(?:Connection closed|Disconnected) (?:by|from) (?:authenticating|invalid) user (\S+) (\S+) port (\d+)",
            )
            .unwrap()
        })
        .captures(line)
    {
        return SshLogEvent {
            timestamp,
            event_type: "preauth_closed".to_string(),
            user: Some(c[1].to_string()),
            ip: Some(c[2].to_string()),
            port: c[3].parse().ok(),
            method: None,
            raw: line.to_string(),
        };
    }

    if let Some(c) = RE_PAM_FAIL
        .get_or_init(|| {
            regex::Regex::new(
                r"authentication failure;.*?\brhost=([^\s;]+)(?:.*?\buser=([^\s;]+))?",
            )
            .unwrap()
        })
        .captures(line)
    {
        return SshLogEvent {
            timestamp,
            event_type: "auth_failure".to_string(),
            user: c.get(2).map(|m| m.as_str().to_string()),
            ip: Some(c[1].to_string()),
            port: None,
            method: Some("pam".to_string()),
            raw: line.to_string(),
        };
    }

    let fallback_ip = RE_IP_FALLBACK
        .get_or_init(|| regex::Regex::new(r"\b(\d{1,3}(?:\.\d{1,3}){3})\b").unwrap())
        .captures(line)
        .map(|c| c[1].to_string());

    let event_type = if line.contains("Disconnected from user") {
        "disconnected"
    } else {
        "other"
    }
    .to_string();

    SshLogEvent {
        timestamp,
        event_type,
        user: None,
        ip: fallback_ip,
        port: None,
        method: None,
        raw: line.to_string(),
    }
}
