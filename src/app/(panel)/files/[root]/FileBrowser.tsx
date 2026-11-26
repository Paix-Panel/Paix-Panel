"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  FileArchive,
  FilePlus,
  FolderPlus,
  FolderUp,
  PackageOpen,
  Upload,
} from "lucide-react";
import type { FileEntry, FileListing } from "@/lib/agent";
import ConfirmDialog from "@/components/ConfirmDialog/ConfirmDialog";
import pageStyles from "@/components/page.module.css";
import styles from "../files.module.css";
import {
  compressFilesAction,
  createFileAction,
  createFolderAction,
  ensureFoldersAction,
  extractArchiveAction,
  listDirAction,
  moveAction,
  renameAction,
  trashAction,
} from "@/server-actions/files";

type DialogKind =
  | "newFolder"
  | "newFile"
  | "rename"
  | "delete"
  | "compress"
  | "extract"
  | "uploadZip";

type UploadItem = {
  file: File;
  /** Subfolder path relative to the current directory ("" for top-level). */
  relDir: string;
};

/** An error to show: a sentence, or a summary with one line per item that a
 *  move or a move to Trash refused. */
type ErrorState = string | { summary: string; items: string[] };

/** The agent's sentence out of an action's error. A refusal of the whole
 *  request reaches us as `agent <status>: <JSON body>`; per-item errors keep
 *  the agent's "conflict: " / "invalid input: " prefixes. */
function agentSentence(msg: string): string {
  let s = msg;
  const m = /^agent \d+: ([\s\S]*)$/.exec(s);
  if (m) {
    s = m[1];
    try {
      const body = JSON.parse(s) as { error?: unknown };
      if (typeof body.error === "string") s = body.error;
    } catch {
      // not JSON: keep the body as it is
    }
  }
  return s.replace(/(^|: |; )(?:conflict|invalid input): /g, "$1");
}

/** A failed move or move to Trash of `count` items, from moveAction's /
 *  trashAction's "Moved N[ to Trash], failed M: <item>: <why>; ..." text:
 *  what did go, then each refused item with the agent's reason. */
function itemErrors(error: string, count: number, toTrash: boolean): ErrorState {
  const s = agentSentence(error);
  if (count < 2) return s;
  const m = /^Moved (\d+)(?: to Trash)?, failed \d+: ([\s\S]*)$/.exec(s);
  const moved = m ? Number(m[1]) : 0;
  const where = toTrash ? " to Trash" : "";
  return {
    summary:
      moved > 0
        ? `Moved ${moved} of ${count} items${where}. These were not:`
        : `None of the ${count} items were moved${where}:`,
    items: (m ? m[2] : s).split("; "),
  };
}

function ErrorBody({ error }: { error: ErrorState }) {
  if (typeof error === "string") return <>{error}</>;
  return (
    <>
      {error.summary}
      <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
        {error.items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </>
  );
}

/** Join a directory path and a name, both relative to the root. */
function joinPath(dir: string, name: string): string {
  if (!dir) return name;
  if (!name) return dir;
  return `${dir}/${name}`;
}

function parentOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[u]}`;
}

/** "2026-08-15T14:03:07Z" -> "2026-08-15 14:03". Sliced rather than
 *  locale-formatted so the server and client render identical markup. */
function formatTs(iso: string | null): string {
  if (!iso) return "-";
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

function isDirLike(e: FileEntry): boolean {
  return e.kind === "dir" || (e.kind === "symlink" && e.link_is_dir);
}

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}

function isZipName(name: string): boolean {
  return name.toLowerCase().endsWith(".zip");
}

function zipStem(name: string): string {
  return isZipName(name) ? name.slice(0, -4) || "extracted" : name;
}

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "ico"]);
const TEXT_EXT = new Set([
  "txt", "md", "log", "csv", "xml", "yaml", "yml", "toml", "ini", "conf",
  "sh", "rs", "ts", "tsx", "js", "jsx", "css", "sql", "json", "env",
]);

/** What the preview modal can render. SVG and HTML are excluded on purpose —
 *  the agent refuses to serve them inline (they can carry script, and the
 *  panel's own origin is what would run it), so they'd render as a broken
 *  frame anyway. Download them instead. */
function previewKind(name: string): "image" | "pdf" | "text" | null {
  const ext = extOf(name);
  if (IMAGE_EXT.has(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (TEXT_EXT.has(ext) || ext === "") return "text";
  return null;
}

function downloadUrl(root: string, path: string, inline = false): string {
  const q = new URLSearchParams({ root, path });
  if (inline) q.set("inline", "1");
  return `/api/files/download?${q.toString()}`;
}

/** Cap on what the text preview pulls down — a 200 MB log shouldn't be
 *  streamed into a <pre> just because it ends in `.log`. */
const TEXT_PREVIEW_LIMIT = 512 * 1024;

type UploadResult = { ok: boolean; status: number; body: string };

/**
 * POST one file, reporting progress as it goes.
 *
 * XHR rather than `fetch` purely for `upload.onprogress` — fetch still can't
 * report request-body progress in any shipping browser, and an upload with no
 * feedback is indistinguishable from a hung one.
 */
function putFile(
  url: string,
  file: File,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () =>
      resolve({ ok: xhr.status < 400, status: xhr.status, body: xhr.responseText });
    xhr.onerror = () =>
      reject(new Error("network error — the connection dropped mid-upload"));
    xhr.ontimeout = () => reject(new Error("upload timed out"));
    xhr.onabort = () => reject(new DOMException("aborted", "AbortError"));
    signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

/** Pull the agent's error text out of a JSON body, falling back to the raw
 *  body — which for a proxy-level rejection is HTML, not JSON. */
function errorText(res: UploadResult): string {
  try {
    return (JSON.parse(res.body) as { error?: string }).error ?? res.body;
  } catch {
    if (res.status === 413) {
      return "rejected as too large by the web server (nginx client_max_body_size)";
    }
    return res.body.slice(0, 200) || `upload failed (${res.status})`;
  }
}

function readAllDirectoryEntries(
  reader: FileSystemDirectoryReader,
): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    const step = () => {
      reader.readEntries(
        (batch) => {
          if (batch.length === 0) resolve(all);
          else {
            all.push(...batch);
            step();
          }
        },
        (err) => reject(err),
      );
    };
    step();
  });
}

function readFileEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function collectDroppedEntries(
  entries: FileSystemEntry[],
): Promise<{ items: UploadItem[]; dirs: string[] }> {
  const items: UploadItem[] = [];
  const dirs: string[] = [];

  async function walk(entry: FileSystemEntry, parentRel: string) {
    if (entry.isFile) {
      const file = await readFileEntry(entry as FileSystemFileEntry);
      items.push({ file, relDir: parentRel });
    } else if (entry.isDirectory) {
      const dirEntry = entry as FileSystemDirectoryEntry;
      const rel = parentRel ? `${parentRel}/${entry.name}` : entry.name;
      dirs.push(rel);
      const children = await readAllDirectoryEntries(dirEntry.createReader());
      for (const child of children) {
        await walk(child, rel);
      }
    }
  }

  for (const entry of entries) {
    await walk(entry, "");
  }
  return { items, dirs };
}

/**
 * The file manager itself.
 *
 * Navigation updates the URL with `history.pushState` and swaps the listing in
 * place, so clicking through a deep tree doesn't cost a full route render.
 * Back/forward still work: those go through the router, which re-renders the
 * server component and remounts this one via its `key`.
 *
 * `maxUploadMb` is the upload limit from Settings; the route enforces it too,
 * this only saves sending a file that would be refused.
 */
export default function FileBrowser({
  initial,
  maxUploadMb,
}: {
  initial: FileListing;
  maxUploadMb: number;
}) {
  const [listing, setListing] = useState<FileListing>(initial);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<ErrorState | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [overwriteInput, setOverwriteInput] = useState(false);
  const [extractMode, setExtractMode] = useState<"here" | "subfolder">("here");
  const [extractSubdir, setExtractSubdir] = useState("");
  const [extractTargetName, setExtractTargetName] = useState<string | null>(null);
  const [pendingZipFile, setPendingZipFile] = useState<File | null>(null);
  const [zipAutoExtract, setZipAutoExtract] = useState(true);
  const [zipRemoveAfter, setZipRemoveAfter] = useState(false);
  const [pending, startTransition] = useTransition();
  // Which drop target is lit: a directory name, "..", or `crumb:<path>`.
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  // dataTransfer can't be read during dragover, so the payload lives here too.
  const dragPaths = useRef<string[]>([]);
  const nameRef = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);
  const uploadAbort = useRef<AbortController | null>(null);
  // Upload progress: which file, how far through the batch, and how far
  // through this file.
  const [uploading, setUploading] = useState<{
    name: string;
    done: number;
    total: number;
    pct: number;
  } | null>(null);
  // True while a drag carrying OS files is over the list.
  const [fileDrag, setFileDrag] = useState(false);
  const [preview, setPreview] = useState<FileEntry | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);

  // Set directory-picking attributes via DOM so React 19 doesn't warn on unknown attributes.
  useEffect(() => {
    const el = folderInput.current;
    if (!el) return;
    el.setAttribute("webkitdirectory", "");
    el.setAttribute("directory", "");
  }, [listing.writable]);

  // ConfirmDialog focuses its Confirm button on open, which lands AFTER the
  // input's autoFocus and steals it. Claim focus back once, on open, so a
  // "New folder" dialog is immediately typeable.
  useEffect(() => {
    if (
      dialog === "newFolder" ||
      dialog === "newFile" ||
      dialog === "rename" ||
      dialog === "compress"
    ) {
      const input = nameRef.current;
      if (!input) return;
      input.focus();
      input.select();
    }
  }, [dialog]);

  // A refused drop happens down in a long list; the banner is above it.
  useEffect(() => {
    if (error && !dialog) errorRef.current?.scrollIntoView({ block: "nearest" });
  }, [error, dialog]);

  const root = listing.root;
  const path = listing.path;
  // The folder on screen now, for work that finishes after the operator may
  // have moved on (an upload keeps running while they browse).
  const pathRef = useRef(path);
  pathRef.current = path;
  // Bumped per preview opened or closed, so a slow text fetch for an earlier
  // preview cannot fill in a later one.
  const previewSeq = useRef(0);

  const load = useCallback(
    (next: string, push: boolean) => {
      startTransition(async () => {
        const res = await listDirAction(root.id, next);
        if (!res.ok) {
          setError(agentSentence(res.error));
          return;
        }
        setListing(res.listing);
        setSelected(new Set());
        setError(null);
        setNotice(null);
        if (push) {
          const url = next
            ? `/files/${root.id}?path=${encodeURIComponent(next)}`
            : `/files/${root.id}`;
          window.history.pushState(null, "", url);
        }
      });
    },
    [root.id],
  );

  const reload = useCallback(() => load(path, false), [load, path]);

  const selectedEntries = listing.entries.filter((e) => selected.has(e.name));
  const canActOnSelection =
    selectedEntries.length > 0 && selectedEntries.every((e) => !e.locked) && root.writable;
  const selectedSingleZip =
    selectedEntries.length === 1 &&
    !isDirLike(selectedEntries[0]) &&
    isZipName(selectedEntries[0].name) &&
    listing.writable;

  const toggle = (name: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  // --- drag and drop --------------------------------------------------------

  const onDragStart = (e: React.DragEvent, entry: FileEntry) => {
    // Dragging an unselected row drags just that row; dragging a selected one
    // takes the whole selection with it.
    const names = selected.has(entry.name) ? [...selected] : [entry.name];
    dragPaths.current = names.map((n) => joinPath(path, n));
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dragPaths.current.join("\n"));
  };

  const dropInto = (dest: string) => {
    setDropTarget(null);
    const paths = dragPaths.current;
    dragPaths.current = [];
    if (paths.length === 0) return;
    // Dropping onto the folder something already lives in is a no-op, not an
    // error worth a banner.
    if (paths.every((p) => parentOf(p) === dest)) return;
    startTransition(async () => {
      const res = await moveAction(root.id, paths, dest);
      if (!res.ok) {
        setError(itemErrors(res.error, paths.length, false));
      } else {
        setError(null);
        setNotice(
          `Moved ${paths.length} item${paths.length === 1 ? "" : "s"} to ${dest || root.path}.`,
        );
      }
      const fresh = await listDirAction(root.id, path);
      if (fresh.ok) setListing(fresh.listing);
      // Keep the selection when the action failed so a retry acts on the
      // same items; clearing it made a retried Rename do nothing and a
      // retried Delete trash zero items.
      if (res.ok) setSelected(new Set());
    });
  };

  const allowDrop = (e: React.DragEvent, key: string) => {
    if (!root.writable || dragPaths.current.length === 0) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget((t) => (t === key ? t : key));
  };

  /**
   * `dragleave` fires every time the pointer crosses into a CHILD element, so
   * clearing unconditionally makes the highlight strobe as you move across a
   * row. Only clear when the pointer has genuinely left the row's subtree.
   */
  const leaveDrop = (e: React.DragEvent, key: string) => {
    const next = e.relatedTarget as Node | null;
    if (next && e.currentTarget.contains(next)) return;
    setDropTarget((t) => (t === key ? null : t));
  };

  // --- upload / download / preview ------------------------------------------

  /**
   * Uploads run sequentially, not in parallel: the agent aborts an upload that
   * would push the filesystem under its free-space floor, and three concurrent
   * 2 GB streams would each pass that check on the way in and collectively
   * blow through it.
   */
  const uploadItems = useCallback(
    async (
      items: UploadItem[],
      emptyDirs: string[] = [],
      opts?: { overwrite?: boolean },
    ): Promise<{ uploaded: number; failures: string[] }> => {
      if (items.length === 0 && emptyDirs.length === 0) {
        return { uploaded: 0, failures: [] };
      }
      setError(null);
      setNotice(null);
      const controller = new AbortController();
      uploadAbort.current = controller;
      const failures: string[] = [];
      let done = 0;

      const uniqueDirs = Array.from(
        new Set([
          ...emptyDirs.filter(Boolean),
          ...items.map((it) => it.relDir).filter(Boolean),
        ]),
      );

      if (uniqueDirs.length > 0) {
        setUploading({
          name: `Preparing ${uniqueDirs.length} folder${uniqueDirs.length === 1 ? "" : "s"}…`,
          done: 0,
          total: items.length || 1,
          pct: 0,
        });
        const dirRes = await ensureFoldersAction(root.id, path, uniqueDirs);
        if (!dirRes.ok) {
          uploadAbort.current = null;
          setUploading(null);
          const msg = agentSentence(dirRes.error);
          setError(msg);
          return { uploaded: 0, failures: [msg] };
        }
      }

      for (let i = 0; i < items.length; i++) {
        const { file, relDir } = items[i];
        const displayName = relDir ? `${relDir}/${file.name}` : file.name;
        if (file.size > maxUploadMb * 1024 * 1024) {
          failures.push(
            `${displayName}: larger than the ${maxUploadMb} MB upload limit (Settings > Panel > Uploads)`,
          );
          continue;
        }
        setUploading({ name: displayName, done: i, total: items.length, pct: 0 });
        const targetDir = joinPath(path, relDir);
        const q = new URLSearchParams({
          root: root.id,
          path: targetDir,
          name: file.name,
        });
        if (opts?.overwrite) q.set("overwrite", "1");
        try {
          const res = await putFile(
            `/api/files/upload?${q.toString()}`,
            file,
            (fraction) =>
              setUploading({
                name: displayName,
                done: i,
                total: items.length,
                pct: Math.round(fraction * 100),
              }),
            controller.signal,
          );
          if (res.ok) done++;
          else failures.push(`${displayName}: ${errorText(res)}`);
        } catch (e: unknown) {
          if (e instanceof DOMException && e.name === "AbortError") {
            failures.push(`${displayName}: cancelled`);
            break; // don't start the remaining files
          }
          failures.push(`${displayName}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      uploadAbort.current = null;
      setUploading(null);
      if (failures.length > 0) setError(failures.join("; "));
      if (done > 0 || (uniqueDirs.length > 0 && failures.length === 0)) {
        const folderNote =
          uniqueDirs.length > 0
            ? ` across ${uniqueDirs.length} folder${uniqueDirs.length === 1 ? "" : "s"}`
            : "";
        setNotice(
          done > 0
            ? `Uploaded ${done} file${done === 1 ? "" : "s"}${folderNote}.`
            : `Created ${uniqueDirs.length} folder${uniqueDirs.length === 1 ? "" : "s"}.`,
        );
      }
      // Re-read the folder being shown, which is not the upload's folder if
      // the operator browsed on meanwhile: showing that listing again put
      // them back in it under the other folder's URL.
      const fresh = await listDirAction(root.id, pathRef.current);
      if (fresh.ok) setListing(fresh.listing);
      return { uploaded: done, failures };
    },
    [root.id, path, maxUploadMb],
  );

  const uploadFiles = useCallback(
    async (files: File[]) => {
      const items: UploadItem[] = files.map((file) => {
        const relPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? "";
        const slash = relPath.lastIndexOf("/");
        const relDir = slash > 0 ? relPath.slice(0, slash) : "";
        return { file, relDir };
      });
      await uploadItems(items);
    },
    [uploadItems],
  );

  const openPreview = useCallback(
    async (entry: FileEntry) => {
      const seq = ++previewSeq.current;
      setPreview(entry);
      setPreviewText(null);
      if (previewKind(entry.name) !== "text") return;
      if (entry.size > TEXT_PREVIEW_LIMIT) {
        setPreviewText(
          `This file is ${formatBytes(entry.size)} — too large to preview. Download it instead.`,
        );
        return;
      }
      let text: string;
      try {
        const res = await fetch(downloadUrl(root.id, joinPath(path, entry.name)));
        text = res.ok ? await res.text() : `Couldn't read this file (${res.status}).`;
      } catch (e: unknown) {
        text = e instanceof Error ? e.message : String(e);
      }
      if (seq === previewSeq.current) setPreviewText(text);
    },
    [root.id, path],
  );

  // --- mutations ------------------------------------------------------------

  const runDialog = () => {
    const name = nameInput.trim();
    if (dialog === "uploadZip") {
      const zipFile = pendingZipFile;
      if (!zipFile) return;
      const shouldExtract = zipAutoExtract;
      const mode = extractMode;
      const subdir = extractSubdir.trim();
      const overwrite = overwriteInput;
      const removeAfter = zipRemoveAfter;
      setDialog(null);
      setPendingZipFile(null);

      void (async () => {
        const { uploaded } = await uploadItems([{ file: zipFile, relDir: "" }], [], {
          overwrite,
        });
        if (uploaded !== 1 || !shouldExtract) return;

        const destRel =
          mode === "subfolder" && subdir ? joinPath(path, subdir) : path || undefined;
        const zipPath = joinPath(path, zipFile.name);
        startTransition(async () => {
          const ex = await extractArchiveAction(root.id, zipPath, destRel, overwrite);
          if (!ex.ok) {
            setError(agentSentence(ex.error));
            return;
          }
          if (removeAfter) {
            await trashAction(root.id, [zipPath]);
          }
          setError(null);
          setNotice(
            `Uploaded ${zipFile.name} and extracted ${ex.extracted} item${
              ex.extracted === 1 ? "" : "s"
            }${ex.dest ? ` into ${ex.dest}` : ""}.`,
          );
          const fresh = await listDirAction(root.id, pathRef.current);
          if (fresh.ok) setListing(fresh.listing);
        });
      })();
      return;
    }

    startTransition(async () => {
      let res:
        | { ok: true; path?: string; size?: number; dest?: string; extracted?: number }
        | { ok: false; error: string };
      const count = selectedEntries.length;
      if (dialog === "newFolder") res = await createFolderAction(root.id, path, name);
      else if (dialog === "newFile") res = await createFileAction(root.id, path, name);
      else if (dialog === "rename") {
        const target = selectedEntries[0];
        if (!target) return;
        res = await renameAction(root.id, joinPath(path, target.name), name);
      } else if (dialog === "delete") {
        res = await trashAction(
          root.id,
          selectedEntries.map((e) => joinPath(path, e.name)),
        );
      } else if (dialog === "compress") {
        res = await compressFilesAction(
          root.id,
          path,
          selectedEntries.map((e) => joinPath(path, e.name)),
          name,
          overwriteInput,
        );
      } else if (dialog === "extract") {
        const targetName = extractTargetName ?? selectedEntries[0]?.name;
        if (!targetName) return;
        const destRel =
          extractMode === "subfolder" && extractSubdir.trim()
            ? joinPath(path, extractSubdir.trim())
            : path || undefined;
        res = await extractArchiveAction(
          root.id,
          joinPath(path, targetName),
          destRel,
          overwriteInput,
        );
      } else return;

      if (!res.ok) {
        // Shown in the dialog, which stays open: on the page behind it the
        // refusal went unseen and the click looked like it did nothing.
        setError(
          dialog === "delete" ? itemErrors(res.error, count, true) : agentSentence(res.error),
        );
      } else {
        setError(null);
        if (dialog === "delete") {
          setNotice(
            `Moved ${selectedEntries.length} item${
              selectedEntries.length === 1 ? "" : "s"
            } to Trash. Restorable for 30 days.`,
          );
        } else if (dialog === "compress") {
          setNotice(
            `Created ${res.path ?? name} (${formatBytes(res.size ?? 0)}).`,
          );
        } else if (dialog === "extract") {
          const n = res.extracted ?? 0;
          setNotice(
            `Extracted ${n} item${n === 1 ? "" : "s"}${
              res.dest ? ` into ${res.dest}` : " into current folder"
            }.`,
          );
        } else {
          setNotice(null);
        }
        setDialog(null);
        setNameInput("");
        setExtractTargetName(null);
      }
      const fresh = await listDirAction(root.id, path);
      if (fresh.ok) setListing(fresh.listing);
      // Keep the selection when the action failed so a retry acts on the
      // same items; clearing it made a retried Rename do nothing and a
      // retried Delete trash zero items.
      if (res.ok) setSelected(new Set());
    });
  };

  const openDialog = (kind: DialogKind, zipOverrideName?: string) => {
    setError(null);
    setNotice(null);
    setOverwriteInput(false);
    if (kind === "rename") {
      setNameInput(selectedEntries[0]?.name ?? "");
    } else if (kind === "compress") {
      const def =
        selectedEntries.length === 1
          ? isZipName(selectedEntries[0].name)
            ? `${zipStem(selectedEntries[0].name)}-copy.zip`
            : `${selectedEntries[0].name}.zip`
          : "archive.zip";
      setNameInput(def);
    } else if (kind === "extract") {
      const zName = zipOverrideName ?? selectedEntries[0]?.name ?? "";
      setExtractTargetName(zName);
      setExtractMode("here");
      setExtractSubdir(zipStem(zName));
      setNameInput("");
    } else {
      setNameInput("");
    }
    setDialog(kind);
  };

  const openUploadZipDialog = (file: File) => {
    setError(null);
    setNotice(null);
    setPendingZipFile(file);
    setZipAutoExtract(true);
    setZipRemoveAfter(false);
    setOverwriteInput(false);
    setExtractMode("here");
    setExtractSubdir(zipStem(file.name));
    setDialog("uploadZip");
  };

  // --- render ---------------------------------------------------------------

  const segments = path ? path.split("/") : [];

  return (
    <div>
      <Link href="/files" className={pageStyles.backArrow} aria-label="Back to Files">
        ←
      </Link>

      <div className={pageStyles.head}>
        <div>
          <h1 className={pageStyles.title}>{root.label}</h1>
          <div className={pageStyles.subtitle}>
            {/* The path is the breadcrumb: click a part to go there, drop
                onto one to move the dragged items into it. */}
            <span className={`${pageStyles.code} ${styles.pathCrumbs}`}>
              <button
                type="button"
                className={[styles.pathCrumb, dropTarget === "crumb:" ? styles.crumbDrop : ""]
                  .join(" ")
                  .trim()}
                onClick={() => load("", true)}
                disabled={pending || segments.length === 0}
                onDragOver={(e) => allowDrop(e, "crumb:")}
                onDragLeave={(e) => leaveDrop(e, "crumb:")}
                onDrop={() => dropInto("")}
              >
                {root.path}
              </button>
              {segments.map((seg, i) => {
                const target = segments.slice(0, i + 1).join("/");
                const isLast = i === segments.length - 1;
                return (
                  <span key={target} className={styles.pathCrumbs}>
                    {(i > 0 || !root.path.endsWith("/")) && (
                      <span className={styles.pathSep}>/</span>
                    )}
                    <button
                      type="button"
                      className={[
                        styles.pathCrumb,
                        dropTarget === `crumb:${target}` ? styles.crumbDrop : "",
                      ]
                        .join(" ")
                        .trim()}
                      onClick={() => load(target, true)}
                      disabled={pending || isLast}
                      onDragOver={(e) => allowDrop(e, `crumb:${target}`)}
                      onDragLeave={(e) => leaveDrop(e, `crumb:${target}`)}
                      onDrop={() => dropInto(target)}
                    >
                      {seg}
                    </button>
                  </span>
                );
              })}
            </span>
            {!root.writable && " · browse-only"}
          </div>
        </div>
        <div className={pageStyles.actions}>
          <Link href="/files/trash" className={pageStyles.btnGhost}>
            Trash
          </Link>
        </div>
      </div>

      {/* While a dialog is open its own copy is the one in view. */}
      {error && !dialog && (
        <div ref={errorRef} className={pageStyles.error} role="alert">
          <ErrorBody error={error} />
        </div>
      )}
      {notice && <div className={pageStyles.notice}>{notice}</div>}

      <div className={styles.bar}>
        <div className={styles.toolbar}>
          {listing.writable && (
            <>
              <button
                type="button"
                className={pageStyles.btnGhost}
                onClick={() => openDialog("newFolder")}
                disabled={pending}
              >
                <span className={styles.btnInner}>
                  <FolderPlus size={14} />
                  Folder
                </span>
              </button>
              <button
                type="button"
                className={pageStyles.btnGhost}
                onClick={() => openDialog("newFile")}
                disabled={pending}
              >
                <span className={styles.btnInner}>
                  <FilePlus size={14} />
                  File
                </span>
              </button>
              <button
                type="button"
                className={pageStyles.btnGhost}
                onClick={() => fileInput.current?.click()}
                disabled={pending || uploading !== null}
              >
                <span className={styles.btnInner}>
                  <Upload size={14} />
                  Upload
                </span>
              </button>
              <button
                type="button"
                className={pageStyles.btnGhost}
                onClick={() => folderInput.current?.click()}
                disabled={pending || uploading !== null}
                title="Upload an entire folder and all subfolders"
              >
                <span className={styles.btnInner}>
                  <FolderUp size={14} />
                  Upload Folder
                </span>
              </button>
              <button
                type="button"
                className={pageStyles.btnGhost}
                onClick={() => zipInput.current?.click()}
                disabled={pending || uploading !== null}
                title="Upload a .zip archive and optionally extract it"
              >
                <span className={styles.btnInner}>
                  <PackageOpen size={14} />
                  Upload ZIP
                </span>
              </button>
              <input
                ref={fileInput}
                type="file"
                multiple
                hidden
                onChange={(ev) => {
                  const files = Array.from(ev.target.files ?? []);
                  // Reset first so re-picking the same file still fires change.
                  ev.target.value = "";
                  void uploadFiles(files);
                }}
              />
              <input
                ref={folderInput}
                type="file"
                multiple
                hidden
                onChange={(ev) => {
                  const files = Array.from(ev.target.files ?? []);
                  ev.target.value = "";
                  void uploadFiles(files);
                }}
              />
              <input
                ref={zipInput}
                type="file"
                accept=".zip,application/zip"
                hidden
                onChange={(ev) => {
                  const file = ev.target.files?.[0];
                  ev.target.value = "";
                  if (file) openUploadZipDialog(file);
                }}
              />
            </>
          )}
          {selectedEntries.length === 1 && !isDirLike(selectedEntries[0]) && (
            <a
              className={pageStyles.btnGhost}
              href={downloadUrl(root.id, joinPath(path, selectedEntries[0].name))}
              download={selectedEntries[0].name}
            >
              Download
            </a>
          )}
          {listing.writable && (
            <>
              <button
                type="button"
                className={pageStyles.btnGhost}
                onClick={() => openDialog("compress")}
                disabled={pending || uploading !== null || !canActOnSelection}
                title="Compress selected files and folders into a .zip archive"
              >
                <span className={styles.btnInner}>
                  <FileArchive size={14} />
                  Compress
                </span>
              </button>
              {selectedSingleZip && (
                <button
                  type="button"
                  className={pageStyles.btnGhost}
                  onClick={() => openDialog("extract")}
                  disabled={pending || uploading !== null}
                  title="Extract selected .zip archive"
                >
                  <span className={styles.btnInner}>
                    <PackageOpen size={14} />
                    Extract
                  </span>
                </button>
              )}
            </>
          )}
          <button
            type="button"
            className={pageStyles.btnGhost}
            onClick={() => openDialog("rename")}
            disabled={pending || selectedEntries.length !== 1 || !canActOnSelection}
          >
            Rename
          </button>
          <button
            type="button"
            className={pageStyles.btnDanger}
            onClick={() => openDialog("delete")}
            disabled={pending || !canActOnSelection}
          >
            Delete{selectedEntries.length > 1 ? ` (${selectedEntries.length})` : ""}
          </button>
          <button
            type="button"
            className={pageStyles.btnGhost}
            onClick={reload}
            disabled={pending}
          >
            {pending ? "..." : "Refresh"}
          </button>
        </div>
      </div>

      {root.writable && (
        <div className={styles.hint}>
          Drag rows onto a folder or breadcrumb to move them. Drop files, folders, or{" "}
          <span className={pageStyles.code}>.zip</span> archives anywhere on the list to
          upload. Select items to compress into a <span className={pageStyles.code}>.zip</span>{" "}
          or click a <span className={pageStyles.code}>.zip</span> file to extract it.
        </div>
      )}

      {uploading && (
        <div className={styles.uploadBar}>
          <div className={styles.uploadHead}>
            <span>
              Uploading <strong>{uploading.name}</strong>
              {uploading.total > 1 && ` (${uploading.done + 1} of ${uploading.total})`} —{" "}
              {uploading.pct}%
            </span>
            <button
              type="button"
              className={pageStyles.btnGhost}
              onClick={() => uploadAbort.current?.abort()}
            >
              Cancel
            </button>
          </div>
          <div className={styles.uploadTrack}>
            <div className={styles.uploadFill} style={{ width: `${uploading.pct}%` }} />
          </div>
          {uploading.pct === 100 && (
            <div className={styles.uploadNote}>
              Transferred — waiting for the server to finish writing it to disk.
            </div>
          )}
        </div>
      )}

      <div
        className={[
          styles.list,
          styles.dropRoot,
          fileDrag ? styles.dropRootActive : "",
        ]
          .join(" ")
          .trim()}
        // An OS-file drag advertises the "Files" type; an internal row drag
        // doesn't. Checking that is what keeps "move this row" and "upload
        // from my desktop" from fighting over the same drop.
        onDragOver={(e) => {
          if (!listing.writable || !e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setFileDrag(true);
        }}
        onDragLeave={(e) => {
          const next = e.relatedTarget as Node | null;
          if (next && e.currentTarget.contains(next)) return;
          setFileDrag(false);
        }}
        onDrop={(e) => {
          if (!listing.writable || !e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setFileDrag(false);
          const dtItems = Array.from(e.dataTransfer.items ?? []);
          const fsEntries = dtItems
            .map((it) =>
              typeof it.webkitGetAsEntry === "function" ? it.webkitGetAsEntry() : null,
            )
            .filter((entry): entry is FileSystemEntry => entry !== null);

          if (fsEntries.length > 0) {
            void collectDroppedEntries(fsEntries)
              .then(({ items, dirs }) => uploadItems(items, dirs))
              .catch((err: unknown) =>
                setError(err instanceof Error ? err.message : String(err)),
              );
          } else {
            void uploadFiles(Array.from(e.dataTransfer.files));
          }
        }}
      >
        <div className={[styles.row, styles.rowHead].join(" ")}>
          <span />
          <span>Name</span>
          <span>Size</span>
          <span className={styles.hideSmall}>Modified (UTC)</span>
          <span className={styles.hideSmall}>Owner / mode</span>
        </div>

        {path !== "" && (
          <div
            className={[styles.row, dropTarget === ".." ? styles.rowDrop : ""].join(" ").trim()}
            onDragOver={(e) => allowDrop(e, "..")}
            onDragLeave={(e) => leaveDrop(e, "..")}
            onDrop={() => dropInto(parentOf(path))}
          >
            <span />
            <span className={styles.cellName}>
              <span className={[styles.icon, styles.iconDir].join(" ")} aria-hidden="true">
                ↰
              </span>
              <button
                type="button"
                className={styles.nameBtn}
                onClick={() => load(parentOf(path), true)}
                disabled={pending}
              >
                .. (parent folder)
              </button>
            </span>
            <span />
            <span className={styles.hideSmall} />
            <span className={styles.hideSmall} />
          </div>
        )}

        {listing.entries.length === 0 && (
          <div className={styles.row}>
            <span />
            <span className={pageStyles.muted}>This folder is empty.</span>
            <span />
            <span className={styles.hideSmall} />
            <span className={styles.hideSmall} />
          </div>
        )}

        {listing.entries.map((e) => {
          const dir = isDirLike(e);
          const isZip = !dir && e.kind === "file" && isZipName(e.name);
          const isSelected = selected.has(e.name);
          const isDropTarget = dropTarget === e.name;
          return (
            <div
              key={e.name}
              className={[
                styles.row,
                isSelected ? styles.rowSelected : "",
                isDropTarget ? styles.rowDrop : "",
              ]
                .join(" ")
                .trim()}
              draggable={root.writable && !e.locked}
              onDragStart={(ev) => onDragStart(ev, e)}
              onDragEnd={() => {
                dragPaths.current = [];
                setDropTarget(null);
              }}
              onDragOver={(ev) => {
                // Only folders accept a drop, and never the folder being dragged.
                if (!dir || dragPaths.current.includes(joinPath(path, e.name))) return;
                allowDrop(ev, e.name);
              }}
              onDragLeave={(ev) => leaveDrop(ev, e.name)}
              onDrop={() => {
                if (!dir) return;
                dropInto(joinPath(path, e.name));
              }}
              onClick={() => toggle(e.name)}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggle(e.name)}
                onClick={(ev) => ev.stopPropagation()}
                aria-label={`Select ${e.name}`}
                disabled={e.locked}
              />
              <span className={styles.cellName}>
                <span
                  className={[styles.icon, dir ? styles.iconDir : ""].join(" ").trim()}
                  aria-hidden="true"
                >
                  {dir ? "▸" : e.kind === "symlink" ? "↳" : "·"}
                </span>
                {dir ? (
                  <button
                    type="button"
                    className={styles.nameBtn}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      load(joinPath(path, e.name), true);
                    }}
                    disabled={pending}
                    title={e.name}
                  >
                    {e.name}
                  </button>
                ) : isZip && listing.writable ? (
                  <button
                    type="button"
                    className={styles.nameBtn}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      openDialog("extract", e.name);
                    }}
                    title={`Extract ${e.name}`}
                  >
                    {e.name}
                  </button>
                ) : e.kind === "file" && previewKind(e.name) ? (
                  <button
                    type="button"
                    className={styles.nameBtn}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      void openPreview(e);
                    }}
                    title={`Preview ${e.name}`}
                  >
                    {e.name}
                  </button>
                ) : (
                  <span className={styles.nameStatic} title={e.name}>
                    {e.name}
                  </span>
                )}
                {isZip && <span className={styles.zipBadge}>zip</span>}
                {e.link_target && (
                  <span className={styles.linkTarget} title={e.link_target}>
                    → {e.link_target}
                  </span>
                )}
                {e.locked && (
                  <span className={styles.lockIcon} title="Protected system path — read-only">
                    🔒
                  </span>
                )}
              </span>
              <span className={styles.meta}>{dir ? "-" : formatBytes(e.size)}</span>
              <span className={[styles.meta, styles.hideSmall].join(" ")}>
                {formatTs(e.modified)}
              </span>
              <span className={[styles.meta, styles.hideSmall].join(" ")}>
                {e.owner}:{e.group} {e.mode}
              </span>
            </div>
          );
        })}
      </div>

      <div className={styles.footer}>
        <span>
          {listing.entries.length} item{listing.entries.length === 1 ? "" : "s"}
          {/* Counted from the listing: a selection kept after a partly failed
              delete still names the items that did go. */}
          {selectedEntries.length > 0 && ` · ${selectedEntries.length} selected`}
        </span>
        {listing.truncated && (
          <span className={pageStyles.muted}>
            Only the first 5000 entries are shown.
          </span>
        )}
      </div>

      <ConfirmDialog
        open={dialog === "newFolder" || dialog === "newFile" || dialog === "rename"}
        title={
          dialog === "newFolder"
            ? "New folder"
            : dialog === "newFile"
              ? "New file"
              : `Rename ${selectedEntries[0]?.name ?? ""}`
        }
        confirmLabel={dialog === "rename" ? "Rename" : "Create"}
        pending={pending}
        onConfirm={runDialog}
        onCancel={() => {
          setDialog(null);
          setNameInput("");
        }}
      >
        <div className={pageStyles.field}>
          <label htmlFor="files-name-input">
            {dialog === "rename" ? "New name" : "Name"}
          </label>
          <input
            id="files-name-input"
            ref={nameRef}
            className={pageStyles.input}
            value={nameInput}
            onChange={(ev) => setNameInput(ev.target.value)}
            onKeyDown={(ev) => {
              // Not while a submit is running: a second Enter sent it twice.
              if (ev.key === "Enter" && nameInput.trim() && !pending) runDialog();
            }}
          />
        </div>
        <div className={pageStyles.muted} style={{ fontSize: 12, marginTop: 8 }}>
          In <span className={pageStyles.code}>{listing.abs_path}</span>
        </div>
        {error && (
          <div className={pageStyles.error} role="alert" style={{ marginTop: 10 }}>
            <ErrorBody error={error} />
          </div>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "compress"}
        title={`Compress ${selectedEntries.length} item${selectedEntries.length === 1 ? "" : "s"}`}
        confirmLabel="Create .zip"
        pending={pending}
        onConfirm={runDialog}
        onCancel={() => {
          setDialog(null);
          setNameInput("");
        }}
      >
        <div className={pageStyles.field}>
          <label htmlFor="files-zip-name-input">Archive name</label>
          <input
            id="files-zip-name-input"
            ref={nameRef}
            className={pageStyles.input}
            value={nameInput}
            onChange={(ev) => setNameInput(ev.target.value)}
            placeholder="archive.zip"
            onKeyDown={(ev) => {
              if (ev.key === "Enter" && nameInput.trim() && !pending) runDialog();
            }}
          />
        </div>
        <div className={styles.optionGroup}>
          <label className={styles.optionRow}>
            <input
              type="checkbox"
              checked={overwriteInput}
              onChange={(ev) => setOverwriteInput(ev.target.checked)}
            />
            <span>Overwrite if archive already exists</span>
          </label>
        </div>
        <div className={pageStyles.muted} style={{ fontSize: 12, marginTop: 8 }}>
          Output in <span className={pageStyles.code}>{listing.abs_path}</span>
        </div>
        <ul className={styles.dialogList}>
          {selectedEntries.map((e) => (
            <li key={e.name}>
              {e.name}
              {isDirLike(e) ? "/" : ""}
            </li>
          ))}
        </ul>
        {error && (
          <div className={pageStyles.error} role="alert" style={{ marginTop: 10 }}>
            <ErrorBody error={error} />
          </div>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "extract"}
        title={`Extract ${extractTargetName ?? ""}`}
        confirmLabel="Extract ZIP"
        pending={pending}
        onConfirm={runDialog}
        onCancel={() => {
          setDialog(null);
          setExtractTargetName(null);
        }}
      >
        <div style={{ fontSize: 13 }}>
          Choose where to extract the archive contents:
        </div>
        <div className={styles.optionGroup}>
          <label className={styles.optionRow}>
            <input
              type="radio"
              name="extract-dest-mode"
              checked={extractMode === "here"}
              onChange={() => setExtractMode("here")}
            />
            <span>
              Current folder (<span className={pageStyles.code}>{listing.abs_path}</span>)
            </span>
          </label>
          <label className={styles.optionRow}>
            <input
              type="radio"
              name="extract-dest-mode"
              checked={extractMode === "subfolder"}
              onChange={() => setExtractMode("subfolder")}
            />
            <span>Into subfolder:</span>
          </label>
          {extractMode === "subfolder" && (
            <div className={styles.subField}>
              <input
                className={pageStyles.input}
                value={extractSubdir}
                onChange={(ev) => setExtractSubdir(ev.target.value)}
                placeholder="folder-name"
              />
            </div>
          )}
          <label className={styles.optionRow} style={{ marginTop: 4 }}>
            <input
              type="checkbox"
              checked={overwriteInput}
              onChange={(ev) => setOverwriteInput(ev.target.checked)}
            />
            <span>Overwrite existing files</span>
          </label>
        </div>
        {error && (
          <div className={pageStyles.error} role="alert" style={{ marginTop: 10 }}>
            <ErrorBody error={error} />
          </div>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "uploadZip" && pendingZipFile !== null}
        title="Upload ZIP archive"
        confirmLabel={zipAutoExtract ? "Upload & Extract" : "Upload ZIP"}
        pending={pending || uploading !== null}
        onConfirm={runDialog}
        onCancel={() => {
          setDialog(null);
          setPendingZipFile(null);
        }}
      >
        {pendingZipFile && (
          <div>
            <div style={{ fontSize: 13 }}>
              File: <span className={pageStyles.code}>{pendingZipFile.name}</span> (
              {formatBytes(pendingZipFile.size)})
            </div>
            <div className={styles.optionGroup}>
              <label className={styles.optionRow}>
                <input
                  type="checkbox"
                  checked={zipAutoExtract}
                  onChange={(ev) => setZipAutoExtract(ev.target.checked)}
                />
                <span>Extract archive immediately after upload</span>
              </label>
              {zipAutoExtract && (
                <>
                  <label className={styles.optionRow}>
                    <input
                      type="radio"
                      name="upload-zip-dest"
                      checked={extractMode === "here"}
                      onChange={() => setExtractMode("here")}
                    />
                    <span>
                      Extract into current folder (
                      <span className={pageStyles.code}>{listing.abs_path}</span>)
                    </span>
                  </label>
                  <label className={styles.optionRow}>
                    <input
                      type="radio"
                      name="upload-zip-dest"
                      checked={extractMode === "subfolder"}
                      onChange={() => setExtractMode("subfolder")}
                    />
                    <span>Extract into subfolder:</span>
                  </label>
                  {extractMode === "subfolder" && (
                    <div className={styles.subField}>
                      <input
                        className={pageStyles.input}
                        value={extractSubdir}
                        onChange={(ev) => setExtractSubdir(ev.target.value)}
                        placeholder="folder-name"
                      />
                    </div>
                  )}
                  <label className={styles.optionRow}>
                    <input
                      type="checkbox"
                      checked={zipRemoveAfter}
                      onChange={(ev) => setZipRemoveAfter(ev.target.checked)}
                    />
                    <span>Move uploaded .zip to Trash after extracting</span>
                  </label>
                </>
              )}
              <label className={styles.optionRow}>
                <input
                  type="checkbox"
                  checked={overwriteInput}
                  onChange={(ev) => setOverwriteInput(ev.target.checked)}
                />
                <span>Overwrite existing files if they collide</span>
              </label>
            </div>
          </div>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "delete"}
        title={`Move ${selectedEntries.length} item${
          selectedEntries.length === 1 ? "" : "s"
        } to Trash?`}
        confirmLabel="Move to Trash"
        tone="danger"
        pending={pending}
        onConfirm={runDialog}
        onCancel={() => setDialog(null)}
      >
        {error && (
          <div className={pageStyles.error} role="alert">
            <ErrorBody error={error} />
          </div>
        )}
        <div style={{ fontSize: 13 }}>
          These are moved to the panel&apos;s trash, not erased. You can restore them
          from the Trash page for 30 days, after which they&apos;re purged automatically.
        </div>
        <ul className={styles.dialogList}>
          {selectedEntries.map((e) => (
            <li key={e.name}>{e.name}</li>
          ))}
        </ul>
      </ConfirmDialog>

      <ConfirmDialog
        open={preview !== null}
        title={preview?.name ?? ""}
        confirmLabel="Download"
        cancelLabel="Close"
        onConfirm={() => {
          if (!preview) return;
          window.location.href = downloadUrl(root.id, joinPath(path, preview.name));
        }}
        onCancel={() => {
          previewSeq.current++;
          setPreview(null);
          setPreviewText(null);
        }}
      >
        {preview && (
          <div className={styles.preview}>
            {previewKind(preview.name) === "image" && (
              // eslint-disable-next-line @next/next/no-img-element -- served
              // through the agent proxy, not an optimisable static asset
              <img
                className={styles.previewImage}
                src={downloadUrl(root.id, joinPath(path, preview.name), true)}
                alt={preview.name}
              />
            )}
            {previewKind(preview.name) === "pdf" && (
              <iframe
                className={styles.previewFrame}
                src={downloadUrl(root.id, joinPath(path, preview.name), true)}
                title={preview.name}
              />
            )}
            {previewKind(preview.name) === "text" && (
              <pre className={pageStyles.log}>{previewText ?? "Loading…"}</pre>
            )}
            <div className={styles.previewMeta}>
              {formatBytes(preview.size)} · {preview.owner}:{preview.group} {preview.mode} ·
              modified {formatTs(preview.modified)}
            </div>
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}

