"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  WebmailFolderSummary,
  WebmailMessageDetail,
  WebmailMessageSummary,
} from "@/lib/agent";
import LocalTime from "@/components/LocalTime/LocalTime";
import styles from "@/components/page.module.css";
import {
  listWebmailFoldersAction,
  listWebmailMessagesAction,
  readWebmailMessageAction,
  sendWebmailMessageAction,
  webmailMessageAction,
} from "@/server-actions/webmail";
import wm from "./webmail.module.css";

type Props = {
  accounts: string[];
  initialAccount: string;
  initialFolders: WebmailFolderSummary[];
  initialMessages: WebmailMessageSummary[];
  initialError?: string | null;
};

type ComposeState = {
  to: string;
  cc: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  title: string;
};

const FOLDER_OPTIONS = ["INBOX", "Sent", "Drafts", "Junk", "Trash"] as const;

export default function WebmailClient({
  accounts,
  initialAccount,
  initialFolders,
  initialMessages,
  initialError = null,
}: Props) {
  const router = useRouter();
  const [account, setAccount] = useState(initialAccount);
  const [folders, setFolders] = useState<WebmailFolderSummary[]>(initialFolders);
  const [activeFolder, setActiveFolder] = useState<string>("INBOX");
  const [searchInput, setSearchInput] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [messages, setMessages] = useState<WebmailMessageSummary[]>(initialMessages);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WebmailMessageDetail | null>(null);
  const [viewMode, setViewMode] = useState<"html" | "text">("html");
  const [compose, setCompose] = useState<ComposeState | null>(null);
  const [moveTarget, setMoveTarget] = useState<string>("Trash");
  const [confirmPermanentDelete, setConfirmPermanentDelete] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reloadFolder(targetAccount: string, folder: string, q: string) {
    setError(null);
    startTransition(async () => {
      const [fRes, mRes] = await Promise.all([
        listWebmailFoldersAction(targetAccount),
        listWebmailMessagesAction(targetAccount, folder, q),
      ]);
      if (!fRes.ok) {
        setError(fRes.error);
      } else {
        setFolders(fRes.data);
      }
      if (!mRes.ok) {
        setError(mRes.error);
      } else {
        setMessages(mRes.data);
      }
    });
  }

  function onAccountChange(nextAccount: string) {
    setAccount(nextAccount);
    setActiveFolder("INBOX");
    setSearchInput("");
    setAppliedQuery("");
    setSelectedId(null);
    setDetail(null);
    setCompose(null);
    setNotice(null);
    setConfirmPermanentDelete(false);
    router.replace(`/mailboxes/webmail?account=${encodeURIComponent(nextAccount)}`);
    reloadFolder(nextAccount, "INBOX", "");
  }

  function onSelectFolder(folder: string) {
    setActiveFolder(folder);
    setSelectedId(null);
    setDetail(null);
    setCompose(null);
    setConfirmPermanentDelete(false);
    setMoveTarget(folder === "Trash" ? "INBOX" : "Trash");
    reloadFolder(account, folder, appliedQuery);
  }

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = searchInput.trim();
    setAppliedQuery(q);
    setSelectedId(null);
    setDetail(null);
    reloadFolder(account, activeFolder, q);
  }

  function onOpenMessage(msg: WebmailMessageSummary) {
    setError(null);
    setNotice(null);
    setCompose(null);
    setConfirmPermanentDelete(false);
    setSelectedId(msg.id);
    startTransition(async () => {
      const res = await readWebmailMessageAction(account, msg.id, activeFolder);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDetail(res.data);
      setSelectedId(res.data.id);
      setViewMode(res.data.html_body ? "html" : "text");
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id ? { ...m, id: res.data.id, seen: true } : m,
        ),
      );
      if (!msg.seen) {
        setFolders((prev) =>
          prev.map((f) =>
            f.name === activeFolder
              ? { ...f, unread: Math.max(0, f.unread - 1) }
              : f,
          ),
        );
      }
    });
  }

  function startComposeNew() {
    setError(null);
    setNotice(null);
    setCompose({
      to: "",
      cc: "",
      subject: "",
      body: "",
      title: `New message from ${account}`,
    });
  }

  function startReply(all: boolean) {
    if (!detail) return;
    setError(null);
    setNotice(null);
    const subj = detail.subject.toLowerCase().startsWith("re:")
      ? detail.subject
      : `Re: ${detail.subject}`;
    const quote = detail.text_body
      .split("\n")
      .map((l) => `> ${l}`)
      .join("\n");
    const extraCc = all
      ? [detail.to, detail.cc]
          .join(", ")
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s && !s.toLowerCase().includes(account.toLowerCase()))
          .join(", ")
      : "";
    setCompose({
      to: detail.from,
      cc: extraCc,
      subject: subj,
      body: `\n\n--- Original message from ${detail.from} ---\n${quote}`,
      inReplyTo: detail.message_id || undefined,
      title: all ? "Reply all" : "Reply",
    });
  }

  function startForward() {
    if (!detail) return;
    setError(null);
    setNotice(null);
    const subj = detail.subject.toLowerCase().startsWith("fwd:")
      ? detail.subject
      : `Fwd: ${detail.subject}`;
    setCompose({
      to: "",
      cc: "",
      subject: subj,
      body: `\n\n--- Forwarded message ---\nFrom: ${detail.from}\nTo: ${detail.to}\nSubject: ${detail.subject}\n\n${detail.text_body}`,
      title: "Forward message",
    });
  }

  function onSendSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!compose) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await sendWebmailMessageAction(account, {
        to: compose.to,
        cc: compose.cc,
        subject: compose.subject,
        body: compose.body,
        in_reply_to: compose.inReplyTo,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCompose(null);
      setNotice("Message sent and saved to Sent.");
      reloadFolder(account, activeFolder, appliedQuery);
    });
  }

  function runMessageAction(
    action: "mark_read" | "mark_unread" | "flag" | "move" | "delete",
    targetFolder?: string,
  ) {
    if (!detail) return;
    setError(null);
    setNotice(null);
    const msgId = detail.id;
    startTransition(async () => {
      const res = await webmailMessageAction(account, {
        folder: activeFolder,
        message_id: msgId,
        action,
        target_folder: targetFolder,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (action === "delete" || action === "move") {
        setDetail(null);
        setSelectedId(null);
        setConfirmPermanentDelete(false);
        setNotice(
          action === "delete"
            ? activeFolder === "Trash"
              ? "Message permanently deleted."
              : "Message moved to Trash."
            : `Message moved to ${targetFolder}.`,
        );
      } else if (action === "flag") {
        setDetail((d) => (d ? { ...d, flagged: !d.flagged } : d));
      } else if (action === "mark_unread") {
        setDetail((d) => (d ? { ...d, seen: false } : d));
      }
      reloadFolder(account, activeFolder, appliedQuery);
    });
  }

  if (accounts.length === 0) {
    return (
      <div className={styles.section}>
        <div className={styles.empty}>
          No mailboxes exist yet. Create your first mailbox under{" "}
          <Link href="/mailboxes">Mailboxes</Link> to start sending and reading mail.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className={wm.toolbar}>
        <div className={wm.toolbarLeft}>
          <label className={styles.field} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <span>Mailbox</span>
            <select
              className={styles.select}
              value={account}
              onChange={(e) => onAccountChange(e.target.value)}
              disabled={isPending}
              aria-label="Select mailbox account"
            >
              {accounts.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={styles.btn}
            onClick={startComposeNew}
            disabled={isPending}
          >
            Compose
          </button>
          <button
            type="button"
            className={styles.btnGhost}
            onClick={() => reloadFolder(account, activeFolder, appliedQuery)}
            disabled={isPending}
          >
            {isPending ? "Syncing..." : "Refresh"}
          </button>
        </div>

        <div className={wm.toolbarRight}>
          <form onSubmit={onSearchSubmit} className={wm.searchForm}>
            <input
              type="search"
              className={styles.input}
              placeholder="Search sender, subject..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Search mailbox"
            />
            <button type="submit" className={styles.btnGhost} disabled={isPending}>
              Search
            </button>
          </form>
          <Link href="/mailboxes" className={styles.btnGhost} style={{ textDecoration: "none" }}>
            Manage mailboxes
          </Link>
        </div>
      </div>

      {error && (
        <div role="alert" className={styles.error}>
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className={styles.notice}>
          {notice}
        </div>
      )}

      <div className={wm.workspace}>
        <aside className={wm.pane} aria-label="Mail folders">
          <div className={wm.paneHead}>
            <span>Folders</span>
          </div>
          <ul className={wm.folderList}>
            {folders.map((f) => {
              const active = f.name === activeFolder;
              return (
                <li key={f.name}>
                  <button
                    type="button"
                    className={[wm.folderBtn, active ? wm.folderBtnActive : ""].join(" ").trim()}
                    onClick={() => onSelectFolder(f.name)}
                    disabled={isPending}
                  >
                    <span>{f.name}</span>
                    <span className={wm.folderCounts}>
                      {f.unread > 0 && <span className={wm.unreadCount}>{f.unread}</span>}
                      <span className={wm.totalCount}>{f.total}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className={wm.pane} aria-label={`${activeFolder} messages`}>
          <div className={wm.paneHead}>
            <span>
              {activeFolder}
              {appliedQuery ? ` · "${appliedQuery}"` : ""}
            </span>
            <span className={styles.muted} style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
              {messages.length}
            </span>
          </div>
          {messages.length === 0 ? (
            <div className={wm.emptyPane}>
              {appliedQuery
                ? `No messages matching "${appliedQuery}" in ${activeFolder}.`
                : `No messages in ${activeFolder}.`}
            </div>
          ) : (
            <ul className={wm.msgList}>
              {messages.map((m) => {
                const selected = m.id === selectedId;
                return (
                  <li key={m.id} className={wm.msgRow}>
                    <button
                      type="button"
                      className={[wm.msgBtn, selected ? wm.msgBtnSelected : ""].join(" ").trim()}
                      onClick={() => onOpenMessage(m)}
                    >
                      <div className={wm.msgTop}>
                        <span className={wm.msgFrom}>
                          {!m.seen && <span className={wm.unreadDot} title="Unread" />}
                          <span>{activeFolder === "Sent" ? `To: ${m.to}` : m.from}</span>
                        </span>
                        <span className={wm.msgDate}>
                          <LocalTime value={m.date} mode="short" fallback="—" />
                        </span>
                      </div>
                      <div className={[wm.msgSubject, !m.seen ? wm.msgSubjectUnread : ""].join(" ").trim()}>
                        {m.subject}
                      </div>
                      <div className={wm.msgSnippet}>{m.snippet || "(empty message)"}</div>
                      {(m.flagged || m.has_attachments) && (
                        <div className={wm.msgMetaLine}>
                          {m.flagged && <span className={wm.flagMark}>Starred</span>}
                          {m.flagged && m.has_attachments && <span>·</span>}
                          {m.has_attachments && <span>Attachment</span>}
                        </div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className={[wm.pane, wm.readerPane].join(" ")} aria-label="Message content">
          {compose ? (
            <>
              <div className={wm.paneHead}>
                <span>{compose.title}</span>
                <button
                  type="button"
                  className={styles.btnGhost}
                  onClick={() => setCompose(null)}
                  disabled={isPending}
                >
                  Discard
                </button>
              </div>
              <form onSubmit={onSendSubmit} className={wm.composeWrap}>
                <label className={styles.field}>
                  From
                  <input className={styles.input} value={account} readOnly disabled />
                </label>
                <label className={styles.field}>
                  To
                  <input
                    className={styles.input}
                    type="text"
                    placeholder="recipient@example.com, second@example.com"
                    value={compose.to}
                    onChange={(e) => setCompose({ ...compose, to: e.target.value })}
                    required
                  />
                </label>
                <label className={styles.field}>
                  Cc (optional)
                  <input
                    className={styles.input}
                    type="text"
                    placeholder="cc@example.com"
                    value={compose.cc}
                    onChange={(e) => setCompose({ ...compose, cc: e.target.value })}
                  />
                </label>
                <label className={styles.field}>
                  Subject
                  <input
                    className={styles.input}
                    type="text"
                    placeholder="Subject"
                    value={compose.subject}
                    onChange={(e) => setCompose({ ...compose, subject: e.target.value })}
                    required
                  />
                </label>
                <label className={styles.field}>
                  Message
                  <textarea
                    className={styles.textarea}
                    style={{ minHeight: 240, fontFamily: "inherit" }}
                    value={compose.body}
                    onChange={(e) => setCompose({ ...compose, body: e.target.value })}
                    placeholder="Write your email..."
                  />
                </label>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    className={styles.btnGhost}
                    onClick={() => setCompose(null)}
                    disabled={isPending}
                  >
                    Cancel
                  </button>
                  <button type="submit" className={styles.btn} disabled={isPending}>
                    {isPending ? "Sending..." : "Send email"}
                  </button>
                </div>
              </form>
            </>
          ) : detail ? (
            <>
              <div className={wm.paneHead}>
                <span>{detail.folder}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  {detail.html_body && (
                    <button
                      type="button"
                      className={styles.btnGhost}
                      onClick={() => setViewMode((v) => (v === "html" ? "text" : "html"))}
                    >
                      {viewMode === "html" ? "View plain text" : "View HTML"}
                    </button>
                  )}
                </div>
              </div>
              <div className={wm.readerBody}>
                <h2 className={wm.readerTitle}>{detail.subject}</h2>

                <div className={wm.readerMeta}>
                  <span className={wm.readerMetaLabel}>From</span>
                  <span className={wm.readerMetaValue}>{detail.from || "—"}</span>
                  <span className={wm.readerMetaLabel}>To</span>
                  <span className={wm.readerMetaValue}>{detail.to || "—"}</span>
                  {detail.cc && (
                    <>
                      <span className={wm.readerMetaLabel}>Cc</span>
                      <span className={wm.readerMetaValue}>{detail.cc}</span>
                    </>
                  )}
                  <span className={wm.readerMetaLabel}>Date</span>
                  <span className={wm.readerMetaValue}>
                    <LocalTime value={detail.date} mode="datetime" fallback="—" />
                  </span>
                </div>

                <div className={wm.readerActions}>
                  <button
                    type="button"
                    className={styles.btn}
                    onClick={() => startReply(false)}
                    disabled={isPending}
                  >
                    Reply
                  </button>
                  <button
                    type="button"
                    className={styles.btnGhost}
                    onClick={() => startReply(true)}
                    disabled={isPending}
                  >
                    Reply all
                  </button>
                  <button
                    type="button"
                    className={styles.btnGhost}
                    onClick={startForward}
                    disabled={isPending}
                  >
                    Forward
                  </button>
                  <button
                    type="button"
                    className={styles.btnGhost}
                    onClick={() => runMessageAction("flag")}
                    disabled={isPending}
                  >
                    {detail.flagged ? "Unstar" : "Star"}
                  </button>
                  <button
                    type="button"
                    className={styles.btnGhost}
                    onClick={() => runMessageAction("mark_unread")}
                    disabled={isPending}
                  >
                    Mark unread
                  </button>
                  <div style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                    <select
                      className={styles.select}
                      value={moveTarget}
                      onChange={(e) => setMoveTarget(e.target.value)}
                      aria-label="Target folder"
                      style={{ padding: "5px 8px", fontSize: 12 }}
                    >
                      {FOLDER_OPTIONS.filter((f) => f !== activeFolder).map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className={styles.btnGhost}
                      onClick={() => runMessageAction("move", moveTarget)}
                      disabled={isPending}
                    >
                      Move
                    </button>
                  </div>

                  {activeFolder === "Trash" && !confirmPermanentDelete ? (
                    <button
                      type="button"
                      className={styles.btnDanger}
                      onClick={() => setConfirmPermanentDelete(true)}
                      disabled={isPending}
                    >
                      Delete forever
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.btnDanger}
                      onClick={() => runMessageAction("delete")}
                      disabled={isPending}
                    >
                      {activeFolder === "Trash" ? "Confirm permanent delete" : "Delete"}
                    </button>
                  )}
                </div>

                {detail.attachments.length > 0 && (
                  <div className={wm.attachments}>
                    {detail.attachments.map((att, idx) => (
                      <div key={idx} className={wm.attachmentChip}>
                        {att.filename} · {att.content_type} ·{" "}
                        {Math.max(1, Math.round(att.size_bytes / 1024))} KB
                      </div>
                    ))}
                  </div>
                )}

                {detail.html_body && viewMode === "html" ? (
                  <iframe
                    className={wm.htmlFrame}
                    sandbox=""
                    title={`Email: ${detail.subject}`}
                    srcDoc={detail.html_body}
                  />
                ) : (
                  <pre className={wm.textBody}>{detail.text_body || "(no text body)"}</pre>
                )}
              </div>
            </>
          ) : (
            <div className={wm.emptyPane}>
              Select a message to read, or click <strong>Compose</strong> to send a new email from{" "}
              <code className={styles.code}>{account}</code>.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
