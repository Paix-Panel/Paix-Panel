use crate::error::{AgentError, AgentResult};
use crate::exec;
use crate::fs_atomic;
use crate::handlers::quick_install::{detect_postgres_version, postgres_is_ready};
use axum::Json;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tokio::fs;

const SYSCTL_SCALE_CONF: &str = "/etc/sysctl.d/98-paix-scale.conf";
const SYSCTL_SCALE_BODY: &str = "\
# Managed by Paix Panel (agent/src/handlers/scale.rs)
# High-concurrency network & kernel tuning for high-traffic workloads
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.core.netdev_max_backlog = 16384
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_tw_reuse = 1
fs.file-max = 2097152
";

const NGINX_CACHE_DIR: &str = "/var/cache/nginx/paix";
const NGINX_SCALE_CONF: &str = "/etc/nginx/conf.d/90-paix-scale.conf";
const NGINX_SCALE_BODY: &str = "\
# Managed by Paix Panel (agent/src/handlers/scale.rs)
# Shared high-speed proxy micro-cache zone & connection/file descriptor tuning
proxy_cache_path /var/cache/nginx/paix levels=1:2 keys_zone=paix_cache:64m max_size=4g inactive=60m use_temp_path=off;
open_file_cache max=100000 inactive=60s;
open_file_cache_valid 30s;
open_file_cache_min_uses 2;
open_file_cache_errors on;
keepalive_requests 10000;
proxy_buffer_size 16k;
proxy_buffers 8 16k;
proxy_busy_buffers_size 32k;
";

const MARIADB_SCALE_CONF: &str = "/etc/mysql/mariadb.conf.d/98-paix-scale.cnf";

#[derive(Serialize, Clone)]
pub struct ScaleProfileState {
    pub id: String,
    pub label: String,
    pub summary: String,
    pub available: bool,
    pub enabled: bool,
    pub detail: String,
}

#[derive(Serialize)]
pub struct ScaleStatus {
    pub ram_total_mb: u64,
    pub cpu_cores: usize,
    pub tcp_congestion_control: String,
    pub somaxconn: u64,
    pub file_max: u64,
    pub bbr_available: bool,
    pub profiles: Vec<ScaleProfileState>,
}

#[derive(Deserialize)]
pub struct ApplyScaleReq {
    pub profile: String,
    pub enable: bool,
}

async fn read_proc_trimmed(path: &str) -> String {
    fs::read_to_string(path)
        .await
        .map(|s| s.trim().to_string())
        .unwrap_or_default()
}

async fn read_ram_total_mb() -> u64 {
    let Ok(meminfo) = fs::read_to_string("/proc/meminfo").await else {
        return 1024;
    };
    for line in meminfo.lines() {
        if let Some(rest) = line.strip_prefix("MemTotal:") {
            let kb: u64 = rest
                .split_whitespace()
                .next()
                .and_then(|s| s.parse().ok())
                .unwrap_or(1048576);
            return (kb / 1024).max(256);
        }
    }
    1024
}

async fn service_installed(unit: &str) -> bool {
    exec::run("systemctl", ["status", unit])
        .await
        .is_ok()
        || fs::try_exists(format!("/lib/systemd/system/{unit}.service"))
            .await
            .unwrap_or(false)
        || fs::try_exists(format!("/etc/systemd/system/{unit}.service"))
            .await
            .unwrap_or(false)
}

async fn service_is_active(unit: &str) -> bool {
    exec::run("systemctl", ["is-active", "--quiet", unit])
        .await
        .is_ok()
}

fn render_mariadb_scale_conf(ram_mb: u64) -> (String, u64) {
    // 40% of host RAM for InnoDB buffer pool, clamped cleanly between 128 MB and 8192 MB
    let pool_mb = ((ram_mb * 40) / 100).clamp(128, 8192);
    let body = format!(
        "# Managed by Paix Panel (agent/src/handlers/scale.rs)\n\
         # High-throughput InnoDB buffer pool & connection concurrency\n\
         [mysqld]\n\
         innodb_buffer_pool_size = {pool_mb}M\n\
         max_connections = 500\n\
         innodb_flush_log_at_trx_commit = 2\n\
         innodb_io_capacity = 2000\n\
         thread_cache_size = 64\n\
         table_open_cache = 4096\n"
    );
    (body, pool_mb)
}

fn render_postgres_scale_conf(ram_mb: u64) -> (String, u64, u64) {
    // 25% shared_buffers (128M..4096M) and 50% effective_cache_size
    let shared_mb = ((ram_mb * 25) / 100).clamp(128, 4096);
    let cache_mb = ((ram_mb * 50) / 100).clamp(256, 16384);
    let body = format!(
        "# Managed by Paix Panel (agent/src/handlers/scale.rs)\n\
         # High-throughput shared buffers & parallel query tuning\n\
         shared_buffers = '{shared_mb}MB'\n\
         effective_cache_size = '{cache_mb}MB'\n\
         work_mem = '16MB'\n\
         maintenance_work_mem = '128MB'\n\
         max_connections = 300\n\
         random_page_cost = 1.1\n\
         effective_io_concurrency = 200\n"
    );
    (body, shared_mb, cache_mb)
}

#[cfg(unix)]
fn chown_www_data_if_present(path: &Path) {
    use nix::unistd::User;
    if let Ok(Some(u)) = User::from_name("www-data") {
        let _ = fs_atomic::chown_blocking(path, u.uid.as_raw(), u.gid.as_raw());
    }
}

#[cfg(not(unix))]
fn chown_www_data_if_present(_path: &Path) {}

#[cfg(unix)]
fn chown_postgres_if_present(path: &Path) {
    use nix::unistd::User;
    if let Ok(Some(u)) = User::from_name("postgres") {
        let _ = fs_atomic::chown_blocking(path, u.uid.as_raw(), u.gid.as_raw());
    }
}

#[cfg(not(unix))]
fn chown_postgres_if_present(_path: &Path) {}

async fn build_status() -> ScaleStatus {
    let ram_total_mb = read_ram_total_mb().await;
    let cpu_cores = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1);

    let tcp_congestion_control =
        read_proc_trimmed("/proc/sys/net/ipv4/tcp_congestion_control").await;
    let avail_cc = read_proc_trimmed("/proc/sys/net/ipv4/tcp_available_congestion_control").await;
    let bbr_available = avail_cc.split_whitespace().any(|c| c == "bbr")
        || tcp_congestion_control == "bbr"
        || Path::new("/lib/modules").exists();
    let somaxconn: u64 = read_proc_trimmed("/proc/sys/net/core/somaxconn")
        .await
        .parse()
        .unwrap_or(4096);
    let file_max: u64 = read_proc_trimmed("/proc/sys/fs/file-max")
        .await
        .parse()
        .unwrap_or(1048576);

    let kernel_conf_exists = fs::try_exists(SYSCTL_SCALE_CONF).await.unwrap_or(false);
    let kernel_enabled =
        kernel_conf_exists && (tcp_congestion_control == "bbr" || somaxconn >= 32768);

    let nginx_installed =
        Path::new("/usr/sbin/nginx").exists() || service_installed("nginx").await;
    let nginx_enabled =
        nginx_installed && fs::try_exists(NGINX_SCALE_CONF).await.unwrap_or(false);

    let mariadb_installed = Path::new("/etc/mysql/mariadb.conf.d").is_dir()
        || service_installed("mariadb").await;
    let mariadb_enabled =
        mariadb_installed && fs::try_exists(MARIADB_SCALE_CONF).await.unwrap_or(false);
    let (_, mariadb_pool_mb) = render_mariadb_scale_conf(ram_total_mb);

    let pg_ver = detect_postgres_version().await;
    let pg_installed = pg_ver.is_some();
    let pg_scale_path = pg_ver
        .as_ref()
        .map(|v| format!("/etc/postgresql/{v}/main/conf.d/98-paix-scale.conf"));
    let pg_enabled = match &pg_scale_path {
        Some(p) => fs::try_exists(p).await.unwrap_or(false),
        None => false,
    };
    let (_, pg_shared_mb, pg_cache_mb) = render_postgres_scale_conf(ram_total_mb);

    let profiles = vec![
        ScaleProfileState {
            id: "kernel_bbr".to_string(),
            label: "Kernel TCP BBR & High-Concurrency Sockets".to_string(),
            summary: "Enables Google TCP BBR congestion control, 65k socket backlog (somaxconn), port reuse, and 2M file descriptors for high concurrent traffic.".to_string(),
            available: true,
            enabled: kernel_enabled,
            detail: format!(
                "{SYSCTL_SCALE_CONF} · congestion={}, somaxconn={somaxconn}",
                if tcp_congestion_control.is_empty() { "default" } else { &tcp_congestion_control }
            ),
        },
        ScaleProfileState {
            id: "nginx_cache".to_string(),
            label: "Nginx High-Speed Edge & Micro-Cache".to_string(),
            summary: "Creates shared 4 GB fast proxy cache zone (paix_cache), 100k open_file_cache, and 10k keepalive requests per connection.".to_string(),
            available: nginx_installed,
            enabled: nginx_enabled,
            detail: if nginx_installed {
                format!("{NGINX_SCALE_CONF} · cache_dir={NGINX_CACHE_DIR}")
            } else {
                "Nginx is not installed".to_string()
            },
        },
        ScaleProfileState {
            id: "mariadb_tune".to_string(),
            label: "MariaDB High-Throughput Engine".to_string(),
            summary: "Scales innodb_buffer_pool_size (~40% RAM), sets 500 max_connections, fast redo log flushing, and 2000 IOPS capacity.".to_string(),
            available: mariadb_installed,
            enabled: mariadb_enabled,
            detail: if mariadb_installed {
                format!("{MARIADB_SCALE_CONF} · buffer_pool={mariadb_pool_mb}MB · max_connections=500")
            } else {
                "MariaDB is not installed".to_string()
            },
        },
        ScaleProfileState {
            id: "postgresql_tune".to_string(),
            label: "PostgreSQL High-Throughput Engine".to_string(),
            summary: "Tones shared_buffers (~25% RAM), effective_cache_size (~50% RAM), 300 max_connections, and NVMe random_page_cost=1.1.".to_string(),
            available: pg_installed,
            enabled: pg_enabled,
            detail: match &pg_scale_path {
                Some(p) => format!("{p} · shared_buffers={pg_shared_mb}MB · effective_cache={pg_cache_mb}MB"),
                None => "PostgreSQL is not installed".to_string(),
            },
        },
    ];

    ScaleStatus {
        ram_total_mb,
        cpu_cores,
        tcp_congestion_control: if tcp_congestion_control.is_empty() {
            "unknown".to_string()
        } else {
            tcp_congestion_control
        },
        somaxconn,
        file_max,
        bbr_available,
        profiles,
    }
}

pub async fn status() -> Json<ScaleStatus> {
    Json(build_status().await)
}

async fn apply_kernel_bbr(enable: bool) -> AgentResult<()> {
    let path = Path::new(SYSCTL_SCALE_CONF);
    if enable {
        fs_atomic::write(path, SYSCTL_SCALE_BODY.as_bytes(), 0o644).await?;
        let _ = exec::run("modprobe", ["tcp_bbr"]).await;
        exec::run("sysctl", ["-p", SYSCTL_SCALE_CONF]).await?;
    } else {
        fs_atomic::remove_if_exists(path).await?;
        let _ = exec::run("sysctl", ["--system"]).await;
    }
    Ok(())
}

async fn apply_nginx_cache(enable: bool) -> AgentResult<()> {
    let nginx_installed =
        Path::new("/usr/sbin/nginx").exists() || service_installed("nginx").await;
    if !nginx_installed {
        return Err(AgentError::Conflict("Nginx is not installed".into()));
    }
    let path = Path::new(NGINX_SCALE_CONF);
    let previous = fs::read_to_string(path).await.ok();

    if enable {
        let cache_dir = Path::new(NGINX_CACHE_DIR);
        fs_atomic::ensure_dir(cache_dir, 0o755).await?;
        chown_www_data_if_present(cache_dir);
        fs_atomic::write(path, NGINX_SCALE_BODY.as_bytes(), 0o644).await?;
    } else {
        fs_atomic::remove_if_exists(path).await?;
    }

    if let Err(e) = exec::run("nginx", ["-t"]).await {
        // Rollback atomically if nginx -t rejects the drop-in
        match previous {
            Some(prev) => {
                let _ = fs_atomic::write(path, prev.as_bytes(), 0o644).await;
            }
            None => {
                let _ = fs_atomic::remove_if_exists(path).await;
            }
        }
        return Err(AgentError::Conflict(format!(
            "nginx -t rejected the tuning drop-in (rolled back): {e}"
        )));
    }

    if service_is_active("nginx").await {
        exec::run("systemctl", ["reload", "nginx"]).await?;
    }
    Ok(())
}

async fn apply_mariadb_tune(enable: bool) -> AgentResult<()> {
    let mariadb_installed = Path::new("/etc/mysql/mariadb.conf.d").is_dir()
        || service_installed("mariadb").await;
    if !mariadb_installed {
        return Err(AgentError::Conflict("MariaDB is not installed".into()));
    }
    let path = Path::new(MARIADB_SCALE_CONF);
    let previous = fs::read_to_string(path).await.ok();
    let ram_mb = read_ram_total_mb().await;
    let (body, _) = render_mariadb_scale_conf(ram_mb);

    if enable {
        fs_atomic::write(path, body.as_bytes(), 0o644).await?;
    } else {
        fs_atomic::remove_if_exists(path).await?;
    }

    if service_is_active("mariadb").await {
        if let Err(e) = exec::run("systemctl", ["restart", "mariadb"]).await {
            match previous {
                Some(prev) => {
                    let _ = fs_atomic::write(path, prev.as_bytes(), 0o644).await;
                }
                None => {
                    let _ = fs_atomic::remove_if_exists(path).await;
                }
            }
            let _ = exec::run("systemctl", ["restart", "mariadb"]).await;
            return Err(AgentError::Conflict(format!(
                "MariaDB failed to restart with new buffer config (rolled back): {e}"
            )));
        }
    }
    Ok(())
}

async fn apply_postgresql_tune(enable: bool) -> AgentResult<()> {
    let Some(ver) = detect_postgres_version().await else {
        return Err(AgentError::Conflict("PostgreSQL is not installed".into()));
    };
    let conf_d = PathBuf::from(format!("/etc/postgresql/{ver}/main/conf.d"));
    let path = conf_d.join("98-paix-scale.conf");
    let previous = fs::read_to_string(&path).await.ok();
    let ram_mb = read_ram_total_mb().await;
    let (body, _, _) = render_postgres_scale_conf(ram_mb);

    if enable {
        fs_atomic::ensure_dir(&conf_d, 0o755).await?;
        chown_postgres_if_present(&conf_d);
        fs_atomic::write(&path, body.as_bytes(), 0o644).await?;
        chown_postgres_if_present(&path);
    } else {
        fs_atomic::remove_if_exists(&path).await?;
    }

    if service_is_active("postgresql").await {
        let restart_ok = exec::run("systemctl", ["restart", "postgresql"])
            .await
            .is_ok()
            && postgres_is_ready().await;
        if !restart_ok {
            match previous {
                Some(prev) => {
                    let _ = fs_atomic::write(&path, prev.as_bytes(), 0o644).await;
                    chown_postgres_if_present(&path);
                }
                None => {
                    let _ = fs_atomic::remove_if_exists(&path).await;
                }
            }
            let _ = exec::run("systemctl", ["restart", "postgresql"]).await;
            return Err(AgentError::Conflict(
                "PostgreSQL did not come up cleanly with new tuning (rolled back)".into(),
            ));
        }
    }
    Ok(())
}

pub async fn apply(Json(req): Json<ApplyScaleReq>) -> AgentResult<Json<ScaleStatus>> {
    match req.profile.as_str() {
        "kernel_bbr" => apply_kernel_bbr(req.enable).await?,
        "nginx_cache" => apply_nginx_cache(req.enable).await?,
        "mariadb_tune" => apply_mariadb_tune(req.enable).await?,
        "postgresql_tune" => apply_postgresql_tune(req.enable).await?,
        "all" => {
            apply_kernel_bbr(req.enable).await?;
            if Path::new("/usr/sbin/nginx").exists() || service_installed("nginx").await {
                apply_nginx_cache(req.enable).await?;
            }
            if Path::new("/etc/mysql/mariadb.conf.d").is_dir()
                || service_installed("mariadb").await
            {
                apply_mariadb_tune(req.enable).await?;
            }
            if detect_postgres_version().await.is_some() {
                apply_postgresql_tune(req.enable).await?;
            }
        }
        other => {
            return Err(AgentError::Invalid(format!(
                "unknown scale profile: {other}"
            )));
        }
    }
    Ok(Json(build_status().await))
}
