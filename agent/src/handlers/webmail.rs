use crate::error::{AgentError, AgentResult};
use crate::exec;
use crate::fs_atomic;
use crate::handlers::mail::{mail_conn, mailbox_parts};
use crate::ipc::OkResponse;
use crate::state::AppState;
use axum::{
    extract::{Path, Query, State},
    Json,
};
use base64::Engine;
use chrono::{DateTime, Utc};
use mysql_async::prelude::*;
use serde::{Deserialize, Serialize};
use std::path::{Path as StdPath, PathBuf};
use tokio::fs;
use uuid::Uuid;

const CANONICAL_FOLDERS: [&str; 5] = ["INBOX", "Sent", "Drafts", "Junk", "Trash"];
const DEFAULT_VMAIL_ID: u32 = 5000;

#[derive(Serialize)]
pub struct WebmailFolderSummary {
    pub name: String,
    pub total: usize,
    pub unread: usize,
}

#[derive(Serialize)]
pub struct WebmailAttachmentInfo {
    pub filename: String,
    pub content_type: String,
    pub size_bytes: usize,
}

#[derive(Serialize)]
pub struct WebmailMessageSummary {
    pub id: String,
    pub folder: String,
    pub from: String,
    pub to: String,
    pub subject: String,
    pub date: String,
    pub snippet: String,
    pub seen: bool,
    pub flagged: bool,
    pub has_attachments: bool,
    pub size_bytes: u64,
}

#[derive(Serialize)]
pub struct WebmailMessageDetail {
    pub id: String,
    pub folder: String,
    pub from: String,
    pub to: String,
    pub cc: String,
    pub subject: String,
    pub date: String,
    pub message_id: String,
    pub text_body: String,
    pub html_body: Option<String>,
    pub seen: bool,
    pub flagged: bool,
    pub attachments: Vec<WebmailAttachmentInfo>,
}

#[derive(Deserialize)]
pub struct FolderQuery {
    #[serde(default = "default_inbox")]
    pub folder: String,
    #[serde(default)]
    pub q: String,
    #[serde(default = "default_limit")]
    pub limit: usize,
}

#[derive(Deserialize)]
pub struct ReadQuery {
    #[serde(default = "default_inbox")]
    pub folder: String,
}

fn default_inbox() -> String {
    "INBOX".to_string()
}

fn default_limit() -> usize {
    150
}

#[derive(Deserialize)]
pub struct SendMailReq {
    pub to: String,
    #[serde(default)]
    pub cc: String,
    pub subject: String,
    pub body: String,
    #[serde(default)]
    pub in_reply_to: Option<String>,
}

#[derive(Serialize)]
pub struct SendMailResp {
    pub ok: bool,
    pub message_id: String,
}

#[derive(Deserialize)]
pub struct MessageActionReq {
    pub folder: String,
    pub message_id: String,
    pub action: String,
    #[serde(default)]
    pub target_folder: Option<String>,
}

fn vmail_ids() -> (u32, u32) {
    #[cfg(unix)]
    {
        let uid = nix::unistd::User::from_name("vmail")
            .ok()
            .flatten()
            .map(|u| u.uid.as_raw())
            .unwrap_or(DEFAULT_VMAIL_ID);
        let gid = nix::unistd::Group::from_name("vmail")
            .ok()
            .flatten()
            .map(|g| g.gid.as_raw())
            .unwrap_or(DEFAULT_VMAIL_ID);
        (uid, gid)
    }
    #[cfg(not(unix))]
    {
        (DEFAULT_VMAIL_ID, DEFAULT_VMAIL_ID)
    }
}

fn chown_vmail(path: &StdPath) {
    let (uid, gid) = vmail_ids();
    let _ = fs_atomic::chown_blocking(path, uid, gid);
}

fn normalize_folder(raw: &str) -> AgentResult<&'static str> {
    let trimmed = raw.trim();
    for &f in &CANONICAL_FOLDERS {
        if f.eq_ignore_ascii_case(trimmed) {
            return Ok(f);
        }
    }
    Err(AgentError::Invalid(format!("unknown mail folder '{raw}'")))
}

fn folder_dir(maildir_root: &StdPath, folder: &str) -> PathBuf {
    match folder {
        "INBOX" => maildir_root.to_path_buf(),
        "Sent" => maildir_root.join(".Sent"),
        "Drafts" => maildir_root.join(".Drafts"),
        "Junk" => maildir_root.join(".Junk"),
        "Trash" => maildir_root.join(".Trash"),
        _ => maildir_root.to_path_buf(),
    }
}

async fn ensure_maildir_folder(maildir_root: &StdPath, folder: &str) -> AgentResult<PathBuf> {
    let base = folder_dir(maildir_root, folder);
    fs_atomic::ensure_dir(maildir_root, 0o700).await?;
    chown_vmail(maildir_root);
    fs_atomic::ensure_dir(&base, 0o700).await?;
    chown_vmail(&base);
    for sub in ["new", "cur", "tmp"] {
        let p = base.join(sub);
        fs_atomic::ensure_dir(&p, 0o700).await?;
        chown_vmail(&p);
    }
    Ok(base)
}

async fn verify_mailbox_root(state: &AppState, raw_email: &str) -> AgentResult<(String, PathBuf)> {
    let (email, local, domain) = mailbox_parts(raw_email)?;
    let mut conn = mail_conn(state).await?;
    let exists: Option<u32> = conn
        .exec_first("SELECT id FROM virtual_users WHERE email = ?", (&email,))
        .await?;
    if exists.is_none() {
        return Err(AgentError::NotFound);
    }
    let root = PathBuf::from(format!("/var/vmail/{domain}/{local}"));
    Ok((email, root))
}

fn validate_message_id(id: &str) -> AgentResult<&str> {
    let id = id.trim();
    if id.is_empty()
        || id.len() > 255
        || id.starts_with('.')
        || id.contains('/')
        || id.contains('\\')
        || id.contains("..")
        || id.contains('\0')
    {
        return Err(AgentError::Invalid("invalid message id".into()));
    }
    Ok(id)
}

fn parse_maildir_flags(filename: &str, in_new: bool) -> (String, bool, bool) {
    if in_new {
        return (filename.to_string(), false, false);
    }
    if let Some((base, info)) = filename.split_once(":2,") {
        let seen = info.contains('S');
        let flagged = info.contains('F');
        (base.to_string(), seen, flagged)
    } else {
        (filename.to_string(), false, false)
    }
}

fn build_maildir_filename(filename: &str, set_seen: Option<bool>, set_flagged: Option<bool>) -> String {
    let (base, mut seen, mut flagged, others) = if let Some((b, info)) = filename.split_once(":2,") {
        let o: Vec<char> = info
            .chars()
            .filter(|c| !matches!(c, 'S' | 'F'))
            .collect();
        (b.to_string(), info.contains('S'), info.contains('F'), o)
    } else {
        (filename.to_string(), false, false, Vec::new())
    };
    if let Some(s) = set_seen {
        seen = s;
    }
    if let Some(f) = set_flagged {
        flagged = f;
    }
    let mut flags: Vec<char> = others;
    if flagged {
        flags.push('F');
    }
    if seen {
        flags.push('S');
    }
    flags.sort_unstable();
    flags.dedup();
    let flag_str: String = flags.into_iter().collect();
    format!("{base}:2,{flag_str}")
}

async fn count_folder(base: &StdPath) -> (usize, usize) {
    let mut total = 0usize;
    let mut unread = 0usize;
    if let Ok(mut rd) = fs::read_dir(base.join("new")).await {
        while let Ok(Some(ent)) = rd.next_entry().await {
            let name = ent.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                continue;
            }
            total += 1;
            unread += 1;
        }
    }
    if let Ok(mut rd) = fs::read_dir(base.join("cur")).await {
        while let Ok(Some(ent)) = rd.next_entry().await {
            let name = ent.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                continue;
            }
            total += 1;
            let (_, seen, _) = parse_maildir_flags(&name, false);
            if !seen {
                unread += 1;
            }
        }
    }
    (total, unread)
}

pub async fn folders(
    State(state): State<AppState>,
    Path(email): Path<String>,
) -> AgentResult<Json<Vec<WebmailFolderSummary>>> {
    let (_email, root) = verify_mailbox_root(&state, &email).await?;
    let mut out = Vec::with_capacity(CANONICAL_FOLDERS.len());
    for folder in CANONICAL_FOLDERS {
        let base = ensure_maildir_folder(&root, folder).await?;
        let (total, unread) = count_folder(&base).await;
        out.push(WebmailFolderSummary {
            name: folder.to_string(),
            total,
            unread,
        });
    }
    Ok(Json(out))
}

struct MaildirEntryFile {
    filename: String,
    path: PathBuf,
    in_new: bool,
    mtime_secs: i64,
    size_bytes: u64,
}

async fn collect_folder_files(base: &StdPath) -> Vec<MaildirEntryFile> {
    let mut files = Vec::new();
    for (sub, in_new) in [("new", true), ("cur", false)] {
        let dir = base.join(sub);
        let Ok(mut rd) = fs::read_dir(&dir).await else {
            continue;
        };
        while let Ok(Some(ent)) = rd.next_entry().await {
            let name = ent.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                continue;
            }
            let Ok(meta) = ent.metadata().await else {
                continue;
            };
            if !meta.is_file() {
                continue;
            }
            let mtime_secs = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);
            files.push(MaildirEntryFile {
                filename: name,
                path: ent.path(),
                in_new,
                mtime_secs,
                size_bytes: meta.len(),
            });
        }
    }
    files.sort_by(|a, b| b.mtime_secs.cmp(&a.mtime_secs));
    files
}

async fn find_message_file(base: &StdPath, id: &str) -> AgentResult<(PathBuf, bool, String)> {
    let id = validate_message_id(id)?;
    for (sub, in_new) in [("new", true), ("cur", false)] {
        let p = base.join(sub).join(id);
        if let Ok(meta) = fs::symlink_metadata(&p).await {
            if meta.is_file() {
                return Ok((p, in_new, id.to_string()));
            }
        }
    }
    // Also match by base id in case Dovecot/panel changed flags after list load.
    let (target_base, _, _) = parse_maildir_flags(id, false);
    for (sub, in_new) in [("cur", false), ("new", true)] {
        let Ok(mut rd) = fs::read_dir(base.join(sub)).await else {
            continue;
        };
        while let Ok(Some(ent)) = rd.next_entry().await {
            let name = ent.file_name().to_string_lossy().to_string();
            let (entry_base, _, _) = parse_maildir_flags(&name, in_new);
            if entry_base == target_base {
                if let Ok(meta) = ent.metadata().await {
                    if meta.is_file() {
                        return Ok((ent.path(), in_new, name));
                    }
                }
            }
        }
    }
    Err(AgentError::NotFound)
}

pub async fn list_messages(
    State(state): State<AppState>,
    Path(email): Path<String>,
    Query(q): Query<FolderQuery>,
) -> AgentResult<Json<Vec<WebmailMessageSummary>>> {
    let (_email, root) = verify_mailbox_root(&state, &email).await?;
    let folder = normalize_folder(&q.folder)?;
    let base = ensure_maildir_folder(&root, folder).await?;
    let files = collect_folder_files(&base).await;
    let needle = q.q.trim().to_lowercase();
    let max_items = q.limit.clamp(1, 250);

    let mut out = Vec::new();
    for f in files {
        let raw = match fs::read(&f.path).await {
            Ok(b) => b,
            Err(_) => continue,
        };
        let parsed = parse_rfc5322(&raw, f.mtime_secs);
        if !needle.is_empty() {
            let hay = format!(
                "{} {} {} {}",
                parsed.subject, parsed.from, parsed.to, parsed.snippet
            )
            .to_lowercase();
            if !hay.contains(&needle) {
                continue;
            }
        }
        let (_, seen, flagged) = parse_maildir_flags(&f.filename, f.in_new);
        out.push(WebmailMessageSummary {
            id: f.filename,
            folder: folder.to_string(),
            from: parsed.from,
            to: parsed.to,
            subject: parsed.subject,
            date: parsed.date_iso,
            snippet: parsed.snippet,
            seen,
            flagged,
            has_attachments: !parsed.attachments.is_empty(),
            size_bytes: f.size_bytes,
        });
        if out.len() >= max_items {
            break;
        }
    }
    Ok(Json(out))
}

pub async fn read_message(
    State(state): State<AppState>,
    Path((email, id)): Path<(String, String)>,
    Query(q): Query<ReadQuery>,
) -> AgentResult<Json<WebmailMessageDetail>> {
    let (_email, root) = verify_mailbox_root(&state, &email).await?;
    let folder = normalize_folder(&q.folder)?;
    let base = ensure_maildir_folder(&root, folder).await?;
    let (path, in_new, actual_name) = find_message_file(&base, &id).await?;
    let meta = fs::metadata(&path).await.map_err(AgentError::Io)?;
    let mtime_secs = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let raw = fs::read(&path).await.map_err(AgentError::Io)?;
    let parsed = parse_rfc5322(&raw, mtime_secs);

    let (_, was_seen, flagged) = parse_maildir_flags(&actual_name, in_new);
    let mut current_id = actual_name.clone();
    if in_new || !was_seen {
        let new_name = build_maildir_filename(&actual_name, Some(true), None);
        let dst = base.join("cur").join(&new_name);
        if fs::rename(&path, &dst).await.is_ok() {
            chown_vmail(&dst);
            current_id = new_name;
        }
    }

    Ok(Json(WebmailMessageDetail {
        id: current_id,
        folder: folder.to_string(),
        from: parsed.from,
        to: parsed.to,
        cc: parsed.cc,
        subject: parsed.subject,
        date: parsed.date_iso,
        message_id: parsed.message_id,
        text_body: parsed.text_body,
        html_body: parsed.html_body,
        seen: true,
        flagged,
        attachments: parsed.attachments,
    }))
}

fn sanitize_header_value(raw: &str) -> String {
    raw.replace(['\r', '\n'], " ").trim().to_string()
}

fn validate_recipient_list(raw: &str, required: bool) -> AgentResult<Vec<String>> {
    let cleaned = sanitize_header_value(raw);
    let addrs: Vec<String> = cleaned
        .split([',', ';'])
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    if required && addrs.is_empty() {
        return Err(AgentError::Invalid("recipient address is required".into()));
    }
    for a in &addrs {
        // Support either `bare@domain` or `Name <bare@domain>`.
        let email_part = if let (Some(l), Some(r)) = (a.find('<'), a.rfind('>')) {
            if l >= r {
                return Err(AgentError::Invalid(format!("invalid recipient '{a}'")));
            }
            &a[l + 1..r]
        } else {
            a.as_str()
        };
        let Some((local, dom)) = email_part.trim().split_once('@') else {
            return Err(AgentError::Invalid(format!("invalid recipient '{a}'")));
        };
        if local.is_empty() || dom.is_empty() || !dom.contains('.') || email_part.contains(char::is_whitespace) {
            return Err(AgentError::Invalid(format!("invalid recipient '{a}'")));
        }
    }
    Ok(addrs)
}

pub async fn send_message(
    State(state): State<AppState>,
    Path(email): Path<String>,
    Json(req): Json<SendMailReq>,
) -> AgentResult<Json<SendMailResp>> {
    let (from_email, root) = verify_mailbox_root(&state, &email).await?;
    let to_list = validate_recipient_list(&req.to, true)?;
    let cc_list = validate_recipient_list(&req.cc, false)?;
    let subject = sanitize_header_value(&req.subject);
    if subject.is_empty() {
        return Err(AgentError::Invalid("subject is required".into()));
    }
    let body = req.body.replace("\r\n", "\n").replace('\n', "\r\n");

    let sendmail_bin = if StdPath::new("/usr/sbin/sendmail").exists() {
        "/usr/sbin/sendmail"
    } else if StdPath::new("/usr/lib/sendmail").exists() {
        "/usr/lib/sendmail"
    } else {
        return Err(AgentError::Invalid(
            "Postfix sendmail is not installed on this server".into(),
        ));
    };

    let (_, domain) = from_email.split_once('@').unwrap_or(("user", "localhost"));
    let msg_id = format!("<{}.{}@{domain}>", Utc::now().timestamp_millis(), Uuid::new_v4().simple());
    let date_hdr = Utc::now().to_rfc2822();
    let encoded_subject = format!(
        "=?UTF-8?B?{}?=",
        base64::engine::general_purpose::STANDARD.encode(subject.as_bytes())
    );
    let encoded_body = base64::engine::general_purpose::STANDARD.encode(body.as_bytes());
    let mut wrapped_body = String::with_capacity(encoded_body.len() + 64);
    for chunk in encoded_body.as_bytes().chunks(76) {
        if let Ok(s) = std::str::from_utf8(chunk) {
            wrapped_body.push_str(s);
            wrapped_body.push_str("\r\n");
        }
    }

    let mut raw = String::new();
    raw.push_str(&format!("From: <{from_email}>\r\n"));
    raw.push_str(&format!("To: {}\r\n", to_list.join(", ")));
    if !cc_list.is_empty() {
        raw.push_str(&format!("Cc: {}\r\n", cc_list.join(", ")));
    }
    raw.push_str(&format!("Subject: {encoded_subject}\r\n"));
    raw.push_str(&format!("Date: {date_hdr}\r\n"));
    raw.push_str(&format!("Message-ID: {msg_id}\r\n"));
    if let Some(reply_id) = req.in_reply_to.as_deref().map(sanitize_header_value).filter(|s| !s.is_empty()) {
        raw.push_str(&format!("In-Reply-To: {reply_id}\r\n"));
        raw.push_str(&format!("References: {reply_id}\r\n"));
    }
    raw.push_str("MIME-Version: 1.0\r\n");
    raw.push_str("Content-Type: text/plain; charset=UTF-8\r\n");
    raw.push_str("Content-Transfer-Encoding: base64\r\n");
    raw.push_str("\r\n");
    raw.push_str(&wrapped_body);

    // Send via Postfix sendmail (`-t` reads To/Cc headers, `-oi` ignores single dots).
    exec::run_with_input(sendmail_bin, ["-oi", "-f", from_email.as_str(), "-t"], &raw).await?;

    // Save a read copy in Maildir .Sent/cur/.
    let sent_base = ensure_maildir_folder(&root, "Sent").await?;
    let maildir_file = format!(
        "{}.{}.{}:2,S",
        Utc::now().timestamp(),
        Uuid::new_v4().simple(),
        domain
    );
    let sent_path = sent_base.join("cur").join(maildir_file);
    fs_atomic::write(&sent_path, raw.as_bytes(), 0o600).await?;
    chown_vmail(&sent_path);

    Ok(Json(SendMailResp {
        ok: true,
        message_id: msg_id,
    }))
}

pub async fn message_action(
    State(state): State<AppState>,
    Path(email): Path<String>,
    Json(req): Json<MessageActionReq>,
) -> AgentResult<Json<OkResponse>> {
    let (_email, root) = verify_mailbox_root(&state, &email).await?;
    let folder = normalize_folder(&req.folder)?;
    let base = ensure_maildir_folder(&root, folder).await?;
    let (src_path, in_new, actual_name) = find_message_file(&base, &req.message_id).await?;

    match req.action.as_str() {
        "mark_read" => {
            let new_name = build_maildir_filename(&actual_name, Some(true), None);
            let dst = base.join("cur").join(new_name);
            if src_path != dst {
                fs::rename(&src_path, &dst).await.map_err(AgentError::Io)?;
                chown_vmail(&dst);
            }
        }
        "mark_unread" => {
            let new_name = build_maildir_filename(&actual_name, Some(false), None);
            let dst = base.join("cur").join(new_name);
            if src_path != dst {
                fs::rename(&src_path, &dst).await.map_err(AgentError::Io)?;
                chown_vmail(&dst);
            }
        }
        "flag" => {
            let (_, seen, flagged) = parse_maildir_flags(&actual_name, in_new);
            let new_name = build_maildir_filename(&actual_name, Some(seen), Some(!flagged));
            let dst = base.join("cur").join(new_name);
            if src_path != dst {
                fs::rename(&src_path, &dst).await.map_err(AgentError::Io)?;
                chown_vmail(&dst);
            }
        }
        "move" => {
            let target = normalize_folder(req.target_folder.as_deref().unwrap_or("INBOX"))?;
            if target != folder {
                let target_base = ensure_maildir_folder(&root, target).await?;
                let new_name = build_maildir_filename(&actual_name, None, None);
                let dst = target_base.join("cur").join(new_name);
                fs::rename(&src_path, &dst).await.map_err(AgentError::Io)?;
                chown_vmail(&dst);
            }
        }
        "delete" => {
            if folder == "Trash" {
                fs_atomic::remove_if_exists(&src_path).await?;
            } else {
                let trash_base = ensure_maildir_folder(&root, "Trash").await?;
                let new_name = build_maildir_filename(&actual_name, Some(true), None);
                let dst = trash_base.join("cur").join(new_name);
                fs::rename(&src_path, &dst).await.map_err(AgentError::Io)?;
                chown_vmail(&dst);
            }
        }
        other => {
            return Err(AgentError::Invalid(format!("unknown action '{other}'")));
        }
    }

    Ok(Json(OkResponse::default()))
}

// ─── Minimal, safe RFC-5322 / MIME parser ───────────────────────────────────

struct ParsedEmail {
    from: String,
    to: String,
    cc: String,
    subject: String,
    date_iso: String,
    message_id: String,
    text_body: String,
    html_body: Option<String>,
    snippet: String,
    attachments: Vec<WebmailAttachmentInfo>,
}

fn split_headers_body(raw: &[u8]) -> (&[u8], &[u8]) {
    if let Some(pos) = raw.windows(4).position(|w| w == b"\r\n\r\n") {
        return (&raw[..pos], &raw[pos + 4..]);
    }
    if let Some(pos) = raw.windows(2).position(|w| w == b"\n\n") {
        return (&raw[..pos], &raw[pos + 2..]);
    }
    (raw, b"")
}

fn parse_headers(raw_hdr: &[u8]) -> Vec<(String, String)> {
    let text = String::from_utf8_lossy(raw_hdr);
    let mut unfolded: Vec<String> = Vec::new();
    for line in text.lines() {
        let line = line.trim_end_matches('\r');
        if (line.starts_with(' ') || line.starts_with('\t')) && !unfolded.is_empty() {
            if let Some(last) = unfolded.last_mut() {
                last.push(' ');
                last.push_str(line.trim_start());
            }
        } else if !line.is_empty() {
            unfolded.push(line.to_string());
        }
    }
    let mut pairs = Vec::with_capacity(unfolded.len());
    for line in unfolded {
        if let Some((k, v)) = line.split_once(':') {
            pairs.push((k.trim().to_ascii_lowercase(), v.trim().to_string()));
        }
    }
    pairs
}

fn hdr<'a>(headers: &'a [(String, String)], key: &str) -> &'a str {
    headers
        .iter()
        .find(|(k, _)| k == key)
        .map(|(_, v)| v.as_str())
        .unwrap_or("")
}

fn decode_rfc2047(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut rest = input;
    while let Some(start) = rest.find("=?") {
        out.push_str(&rest[..start]);
        let after = &rest[start + 2..];
        let Some(end) = after.find("?=") else {
            out.push_str(&rest[start..]);
            return out;
        };
        let token = &after[..end];
        let parts: Vec<&str> = token.splitn(3, '?').collect();
        if parts.len() == 3 {
            let enc = parts[1].to_ascii_uppercase();
            let payload = parts[2];
            if enc == "B" {
                if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(payload.as_bytes()) {
                    out.push_str(&String::from_utf8_lossy(&bytes));
                } else {
                    out.push_str(payload);
                }
            } else if enc == "Q" {
                let replaced = payload.replace('_', " ");
                let decoded = decode_quoted_printable(replaced.as_bytes());
                out.push_str(&String::from_utf8_lossy(&decoded));
            } else {
                out.push_str(payload);
            }
        } else {
            out.push_str(&rest[start..start + 2 + end + 2]);
        }
        rest = &after[end + 2..];
        // RFC 2047 ignores linear whitespace strictly between adjacent encoded-words.
        if rest.trim_start().starts_with("=?") && rest.chars().take_while(|c| *c == ' ' || *c == '\t').count() == rest.find("=?").unwrap_or(usize::MAX) {
            rest = rest.trim_start();
        }
    }
    out.push_str(rest);
    out
}

fn decode_quoted_printable(input: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(input.len());
    let mut i = 0;
    while i < input.len() {
        if input[i] == b'=' {
            if i + 2 < input.len() && input[i + 1] == b'\r' && input[i + 2] == b'\n' {
                i += 3;
                continue;
            }
            if i + 1 < input.len() && input[i + 1] == b'\n' {
                i += 2;
                continue;
            }
            if i + 2 < input.len() {
                if let Ok(hex_str) = std::str::from_utf8(&input[i + 1..i + 3]) {
                    if let Ok(byte) = u8::from_str_radix(hex_str, 16) {
                        out.push(byte);
                        i += 3;
                        continue;
                    }
                }
            }
        }
        out.push(input[i]);
        i += 1;
    }
    out
}

fn decode_transfer(body: &[u8], encoding: &str) -> Vec<u8> {
    match encoding.trim().to_ascii_lowercase().as_str() {
        "base64" => {
            let cleaned: Vec<u8> = body
                .iter()
                .copied()
                .filter(|b| !b.is_ascii_whitespace())
                .collect();
            base64::engine::general_purpose::STANDARD
                .decode(&cleaned)
                .unwrap_or_else(|_| body.to_vec())
        }
        "quoted-printable" => decode_quoted_printable(body),
        _ => body.to_vec(),
    }
}

fn extract_param(header_val: &str, param: &str) -> Option<String> {
    let lower = header_val.to_ascii_lowercase();
    let needle = format!("{param}=");
    let pos = lower.find(&needle)?;
    let rest = header_val[pos + needle.len()..].trim_start();
    if let Some(stripped) = rest.strip_prefix('"') {
        stripped.split('"').next().map(|s| s.to_string())
    } else {
        rest.split([';', ' ', '\t', '\r', '\n'])
            .next()
            .map(|s| s.trim().to_string())
    }
}

fn collect_parts(
    headers: &[(String, String)],
    body: &[u8],
    depth: u8,
    text_out: &mut Option<String>,
    html_out: &mut Option<String>,
    attachments: &mut Vec<WebmailAttachmentInfo>,
) {
    if depth > 8 {
        return;
    }
    let ct_raw = hdr(headers, "content-type");
    let ct_mime = ct_raw
        .split(';')
        .next()
        .unwrap_or("text/plain")
        .trim()
        .to_ascii_lowercase();
    let cte = hdr(headers, "content-transfer-encoding");
    let disp = hdr(headers, "content-disposition");
    let filename = extract_param(disp, "filename")
        .or_else(|| extract_param(ct_raw, "name"))
        .map(|s| decode_rfc2047(&s));

    if ct_mime.starts_with("multipart/") {
        if let Some(boundary) = extract_param(ct_raw, "boundary") {
            let delim = format!("--{boundary}");
            let body_lossy = String::from_utf8_lossy(body);
            // Split using lossy string positions if ASCII boundary, preserving raw bytes cleanly via indices when possible.
            let mut cursor = 0usize;
            while let Some(idx) = body_lossy[cursor..].find(&delim) {
                let part_start = cursor + idx + delim.len();
                if body_lossy[part_start..].starts_with("--") {
                    break;
                }
                let content_start = if body_lossy[part_start..].starts_with("\r\n") {
                    part_start + 2
                } else if body_lossy[part_start..].starts_with('\n') {
                    part_start + 1
                } else {
                    part_start
                };
                let next_idx = body_lossy[content_start..]
                    .find(&delim)
                    .map(|n| content_start + n)
                    .unwrap_or(body_lossy.len());
                let slice_str = body_lossy[content_start..next_idx].trim_end_matches(['\r', '\n']);
                let (ph, pb) = split_headers_body(slice_str.as_bytes());
                let sub_headers = parse_headers(ph);
                collect_parts(&sub_headers, pb, depth + 1, text_out, html_out, attachments);
                cursor = next_idx;
                if next_idx >= body_lossy.len() {
                    break;
                }
            }
            return;
        }
    }

    let decoded = decode_transfer(body, cte);
    let is_attachment = disp.to_ascii_lowercase().starts_with("attachment")
        || (filename.is_some() && !matches!(ct_mime.as_str(), "text/plain" | "text/html"));

    if is_attachment {
        attachments.push(WebmailAttachmentInfo {
            filename: filename.unwrap_or_else(|| "attachment".to_string()),
            content_type: ct_mime,
            size_bytes: decoded.len(),
        });
        return;
    }

    let text = String::from_utf8_lossy(&decoded).to_string();
    if ct_mime == "text/html" {
        if html_out.is_none() {
            *html_out = Some(text);
        }
    } else if ct_mime.starts_with("text/") || ct_mime.is_empty() {
        if text_out.is_none() {
            *text_out = Some(text);
        }
    }
}

fn strip_html_tags(html: &str) -> String {
    let mut out = String::with_capacity(html.len().min(4096));
    let mut in_tag = false;
    for ch in html.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => {
                in_tag = false;
                out.push(' ');
            }
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn parse_rfc5322(raw: &[u8], fallback_mtime: i64) -> ParsedEmail {
    let (raw_hdr, raw_body) = split_headers_body(raw);
    let headers = parse_headers(raw_hdr);

    let from = decode_rfc2047(hdr(&headers, "from"));
    let to = decode_rfc2047(hdr(&headers, "to"));
    let cc = decode_rfc2047(hdr(&headers, "cc"));
    let subject_raw = decode_rfc2047(hdr(&headers, "subject"));
    let subject = if subject_raw.is_empty() {
        "(no subject)".to_string()
    } else {
        subject_raw
    };
    let message_id = hdr(&headers, "message-id").to_string();

    let date_raw = hdr(&headers, "date");
    let date_iso = DateTime::parse_from_rfc2822(date_raw)
        .map(|dt| dt.with_timezone(&Utc).to_rfc3339())
        .unwrap_or_else(|_| {
            DateTime::<Utc>::from_timestamp(fallback_mtime, 0)
                .map(|dt| dt.to_rfc3339())
                .unwrap_or_default()
        });

    let mut text_body = None;
    let mut html_body = None;
    let mut attachments = Vec::new();
    collect_parts(&headers, raw_body, 0, &mut text_body, &mut html_body, &mut attachments);

    let snippet_source = text_body
        .as_deref()
        .map(|s| s.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|s| !s.is_empty())
        .or_else(|| html_body.as_deref().map(strip_html_tags))
        .unwrap_or_default();
    let snippet: String = snippet_source.chars().take(140).collect();

    let final_text = text_body.unwrap_or_else(|| {
        html_body
            .as_deref()
            .map(strip_html_tags)
            .unwrap_or_default()
    });

    ParsedEmail {
        from,
        to,
        cc,
        subject,
        date_iso,
        message_id,
        text_body: final_text,
        html_body,
        snippet,
        attachments,
    }
}
