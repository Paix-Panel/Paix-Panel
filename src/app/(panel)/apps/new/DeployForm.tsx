"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import TaskProgress from "@/components/TaskProgress/TaskProgress";
import EnvFilesEditor from "../[name]/EnvFilesEditor";
import styles from "@/components/page.module.css";

type Result = { ok: true; data?: { taskId: string } } | { ok: false; error: string };

type PortSite = { domain: string; upstream_port: number };

type SourceState = "missing" | "empty" | "populated" | null;

type Props = {
  action: (prev: Result | null, fd: FormData) => Promise<Result>;
  portSites: PortSite[];
  /** Server action that probes `/srv/apps/<name>/` and returns whether
   *  it's missing / empty / populated. The Deploy button is disabled
   *  until this resolves to "populated" — otherwise the agent would
   *  write a systemd unit pointing at an empty folder. */
  checkSourceState: (name: string) => Promise<SourceState>;
  /** "github" → show the Repository URL field and submit repo_url so the
   *  agent's deploy task git-clones into source_dir first.
   *  "manual" (default) → assume code is already in source_dir. */
  sourceMethod?: "github" | "manual";
  /** Host-alias names from /root/.ssh/config that have a private key on
   *  disk under /root/.ssh/<name>. Surfaced as a clickable list so the
   *  operator can pick one and build the correct URL form without
   *  guessing whether the alias goes in user@ or host position. */
  rootKeypairs?: string[];
  /** When set, render the App name input read-only and pre-filled with
   *  this value. Used by the external-app recovery flow on
   *  /apps/[name] where the operator is binding an existing
   *  /srv/apps/<name>/ folder to panel management — the name is fixed by
   *  the URL and must not change. */
  lockedName?: string;
  /** Optional pre-fill for the Repository URL field. Used by the
   *  external-app recovery flow so the operator's saved repo URL (if any)
   *  shows up without re-typing. */
  initialRepoUrl?: string;
  /** Optional runtime pre-selected from query param (e.g. ?runtime=python). */
  initialRuntime?: string;
};

// Hard-coded by the agent (agent/src/handlers/apps.rs::APPS_BASE_DIR). All
// panel-deployed apps live under this prefix; the operator only picks the
// leaf folder name (which is always the app name itself).
const APPS_BASE_DIR = "/srv/apps";

function slotKey(s: PortSite | null | undefined): string {
  return s ? `${s.domain}|${s.upstream_port}` : "";
}

const RUNTIME_OPTIONS = [
  { value: "node", label: "Node.js (npm / Next.js / Express)" },
  { value: "python", label: "Python 3 (FastAPI / Django / Flask)" },
  { value: "php", label: "PHP (Laravel / Symfony / Built-in)" },
  { value: "go", label: "Go (Golang binary)" },
  { value: "bun", label: "Bun (TypeScript / JS)" },
  { value: "deno", label: "Deno 2 (TypeScript / JS)" },
  { value: "ruby", label: "Ruby (Rails / Puma / Sinatra)" },
  { value: "rust", label: "Rust (Cargo release binary)" },
  { value: "java", label: "Java (Spring Boot / JAR)" },
  { value: "dotnet", label: ".NET 8 (ASP.NET Core)" },
  { value: "custom", label: "Custom binary / script" },
] as const;

type RuntimeValue = (typeof RUNTIME_OPTIONS)[number]["value"];

type EntryPreset = { label: string; cmd: string };

function presetsForRuntime(runtime: string, port: number): EntryPreset[] {
  const p = port > 0 ? port : 3000;
  switch (runtime) {
    case "node":
      return [
        { label: "npm start", cmd: "/usr/bin/npm start" },
        { label: "node dist/server.js", cmd: "/usr/bin/node dist/server.js" },
        { label: "pm2-runtime", cmd: "/usr/bin/npx pm2-runtime ecosystem.config.js" },
      ];
    case "python":
      return [
        {
          label: "Uvicorn (FastAPI)",
          cmd: `.venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port ${p}`,
        },
        {
          label: "Gunicorn (Flask/Django)",
          cmd: `.venv/bin/gunicorn -w 4 -b 127.0.0.1:${p} app:app`,
        },
        { label: "python3 app.py", cmd: ".venv/bin/python app.py" },
      ];
    case "php":
      return [
        { label: "PHP server (public/)", cmd: `/usr/bin/php -S 127.0.0.1:${p} -t public` },
        {
          label: "Laravel artisan",
          cmd: `/usr/bin/php artisan serve --host=127.0.0.1 --port=${p}`,
        },
        { label: "PHP server (root)", cmd: `/usr/bin/php -S 127.0.0.1:${p}` },
      ];
    case "go":
      return [
        { label: "./app", cmd: "./app" },
        { label: "./server", cmd: "./server" },
      ];
    case "bun":
      return [
        { label: "bun run start", cmd: "/usr/local/bin/bun run start" },
        { label: "bun index.ts", cmd: "/usr/local/bin/bun index.ts" },
      ];
    case "deno":
      return [
        { label: "deno task start", cmd: "/usr/local/bin/deno task start" },
        { label: "deno main.ts", cmd: "/usr/local/bin/deno run --allow-all main.ts" },
      ];
    case "ruby":
      return [
        {
          label: "Rails server",
          cmd: `/usr/bin/bundle exec rails server -b 127.0.0.1 -p ${p}`,
        },
        {
          label: "Puma",
          cmd: `/usr/bin/bundle exec puma -C config/puma.rb -p ${p}`,
        },
      ];
    case "rust":
      return [
        { label: "./target/release/app", cmd: "./target/release/app" },
        { label: "./target/release/server", cmd: "./target/release/server" },
      ];
    case "java":
      return [
        { label: "java -jar app.jar", cmd: "/usr/bin/java -jar app.jar" },
        {
          label: "Spring Boot JAR",
          cmd: "/usr/bin/java -jar target/app.jar",
        },
      ];
    case "dotnet":
      return [
        { label: "dotnet out/app.dll", cmd: "/usr/bin/dotnet out/app.dll" },
        { label: "dotnet run", cmd: "/usr/bin/dotnet run --no-build" },
      ];
    default:
      return [{ label: "./start.sh", cmd: "./start.sh" }];
  }
}

export default function DeployForm({
  action,
  checkSourceState,
  portSites,
  sourceMethod = "manual",
  rootKeypairs = [],
  lockedName,
  initialRepoUrl = "",
  initialRuntime,
}: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<Result | null, FormData>(action, null);
  const [name, setName] = useState(lockedName ?? "");
  // Cached folder state for the current name. `null` = unknown (either we
  // haven't checked yet, or the name doesn't pass the agent's validator).
  // Deploy stays disabled unless this is "populated".
  const [sourceState, setSourceState] = useState<SourceState>(null);
  // `true` while the source-state probe is in flight. Hides the disabled
  // tooltip flicker when the operator quickly types a valid name.
  const [sourceChecking, setSourceChecking] = useState(false);
  // Tracks which submit button was last clicked so TaskProgress's onComplete
  // knows whether to bounce the operator back to /apps (only on Deploy / All)
  // or leave them on the form to continue staging (Pull / Install / Build).
  const lastStepRef = useRef<string>("deploy");
  // Track the picked slot via a stable string "domain|port" key instead of
  // an object reference. Two reasons: (a) survives reference changes if the
  // server re-renders portSites, (b) makes the select element's `value`
  // prop a primitive string so React's reconciler can detect changes
  // reliably even after the form is reset.
  const [pickedSlotKey, setPickedSlotKey] = useState<string>(
    slotKey(portSites[0]),
  );
  const pickedSlot =
    portSites.find((s) => slotKey(s) === pickedSlotKey) ?? portSites[0] ?? null;
  const activePort = pickedSlot?.upstream_port ?? 3000;
  const [repoUrl, setRepoUrl] = useState(initialRepoUrl);
  const validRuntime = RUNTIME_OPTIONS.find((o) => o.value === initialRuntime)?.value ?? "node";
  const [runtime, setRuntime] = useState<RuntimeValue>(validRuntime);
  // Exec start must survive the post-action form.reset() (React 19) like the
  // other operator-typed fields, or a multi-step deploy silently reverts it to
  // the default and starts the wrong entrypoint.
  const [execStart, setExecStart] = useState(
    () => presetsForRuntime(validRuntime, activePort)[0]?.cmd ?? "/usr/bin/npm start",
  );
  const [customExecEdited, setCustomExecEdited] = useState(false);
  const sourceDir = name ? `${APPS_BASE_DIR}/${name}` : `${APPS_BASE_DIR}/<app-name>`;
  const nameLocked = !!lockedName;
  const presets = presetsForRuntime(runtime, activePort);

  const handleRuntimeChange = (nextRuntime: RuntimeValue) => {
    setRuntime(nextRuntime);
    if (!customExecEdited) {
      const nextPresets = presetsForRuntime(nextRuntime, activePort);
      if (nextPresets[0]) {
        setExecStart(nextPresets[0].cmd);
      }
    }
  };

  const handleSlotChange = (nextKey: string) => {
    setPickedSlotKey(nextKey);
    const nextSlot = portSites.find((s) => slotKey(s) === nextKey);
    const nextPort = nextSlot?.upstream_port ?? 3000;
    if (!customExecEdited) {
      const nextPresets = presetsForRuntime(runtime, nextPort);
      if (nextPresets[0]) {
        setExecStart(nextPresets[0].cmd);
      }
    }
  };

  // React 19 calls form.reset() after a successful server action. The DOM
  // resets all fields (the <select> snaps back to the first option), and
  // for controlled inputs whose React-computed value didn't change between
  // renders, the reconciler skips re-writing the DOM — leaving the visual
  // reset stuck. Counter that by re-applying our React state to the DOM
  // immediately after the form fires its `reset` event. Runs on the next
  // microtask so it lands after React's reset has finished.
  const formRef = useRef<HTMLFormElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const runtimeRef = useRef<HTMLSelectElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const repoUrlRef = useRef<HTMLInputElement>(null);
  const execStartRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const onReset = () => {
      // Defer to after the reset has applied so we overwrite the cleared
      // DOM values, not the values we already had.
      queueMicrotask(() => {
        if (selectRef.current) selectRef.current.value = pickedSlotKey;
        if (runtimeRef.current) runtimeRef.current.value = runtime;
        if (nameRef.current) nameRef.current.value = name;
        if (repoUrlRef.current) repoUrlRef.current.value = repoUrl;
        if (execStartRef.current) execStartRef.current.value = execStart;
      });
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [pickedSlotKey, runtime, name, repoUrl, execStart]);

  // Probe the source folder whenever the name changes. Debounced so we don't
  // hammer the agent on every keystroke. Stale-result guarded via `cancelled`
  // so an in-flight probe for an old name can't overwrite a newer name's
  // result. A short name (< 2 chars) wouldn't satisfy the agent validator
  // anyway, so skip the round-trip there.
  useEffect(() => {
    if (!name || name.length < 2) {
      setSourceState(null);
      setSourceChecking(false);
      return;
    }
    let cancelled = false;
    setSourceChecking(true);
    const t = setTimeout(async () => {
      const result = await checkSourceState(name);
      if (cancelled) return;
      setSourceState(result);
      setSourceChecking(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [name, checkSourceState]);

  // Re-probe whenever a pipeline step finishes successfully. Pull most
  // obviously flips the folder from "empty" → "populated", but Install /
  // Build also touch on-disk state, and the operator might also have
  // cp'd files into /srv/apps/<name> in another terminal between steps.
  const reprobeSourceState = async () => {
    if (!name) return;
    setSourceChecking(true);
    const r = await checkSourceState(name);
    setSourceState(r);
    setSourceChecking(false);
  };

  if (portSites.length === 0) {
    return (
      <div className={styles.notice}>
        <p style={{ marginTop: 0 }}>
          You don&apos;t have any port-mode sites yet. The deploy flow attaches
          an app to an existing HTTP routing slot &mdash; create one first.
        </p>
        <p>
          Go to <Link href="/domains" className={styles.code}>/domains</Link>{" "}
          and add a site with{" "}
          <strong>Mode = Reverse proxy to port</strong>. Pick the subdomain
          you want the app served at and any free loopback port (e.g. 3001).
          Then come back here to deploy.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} ref={formRef}>
      {/* The agent always provisions code under /srv/apps/<name>. We submit a
          hidden source_dir computed from the app name so the operator can't
          point the deploy at an arbitrary path on disk. */}
      <input type="hidden" name="source_dir" value={name ? `${APPS_BASE_DIR}/${name}` : ""} />

      {/* Subdomain + port come from the chosen site; submit as hidden so the
          existing server action signature stays unchanged. */}
      <input type="hidden" name="subdomain" value={pickedSlot?.domain ?? ""} />
      <input
        type="hidden"
        name="port"
        value={pickedSlot ? String(pickedSlot.upstream_port) : ""}
      />

      <div className={styles.formRow}>
        <label className={styles.field}>
          App name
          <input
            ref={nameRef}
            name="name"
            className={styles.input}
            required
            pattern="[a-z0-9][a-z0-9-]{1,30}[a-z0-9]"
            placeholder="myapp"
            value={name}
            readOnly={nameLocked}
            onChange={(e) => {
              if (nameLocked) return;
              setName(
                e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9-]/g, "")
                  .slice(0, 32),
              );
            }}
            autoComplete="off"
            style={
              nameLocked
                ? { background: "var(--bg-elev-2)", cursor: "not-allowed" }
                : undefined
            }
            title={nameLocked ? "Name is fixed by the existing folder under /srv/apps/" : undefined}
          />
          {nameLocked && (
            <span className={styles.muted} style={{ fontSize: 12, marginTop: 4 }}>
              Locked — bound to the existing folder{" "}
              <span className={styles.code}>{`${APPS_BASE_DIR}/${name}`}</span>.
            </span>
          )}
        </label>
        <label className={styles.field}>
          Routing slot (from /domains)
          <select
            ref={selectRef}
            className={styles.select}
            required
            value={pickedSlotKey}
            onChange={(e) => handleSlotChange(e.target.value)}
          >
            {portSites.map((s) => (
              <option
                key={`${s.domain}:${s.upstream_port}`}
                value={`${s.domain}|${s.upstream_port}`}
              >
                {s.domain} → 127.0.0.1:{s.upstream_port}
              </option>
            ))}
          </select>
          {portSites.length === 0 && (
            <span className={styles.error} style={{ fontSize: 12, marginTop: 4 }}>
              No free routing slot - add a port-mode site on /domains first.
            </span>
          )}
          <span className={styles.muted} style={{ fontSize: 12, marginTop: 4 }}>
            Manage these under{" "}
            <Link href="/domains" className={styles.code}>
              /domains
            </Link>
            . Slots already bound to another app or a quick-install service
            are not listed. The agent skips nginx vhost creation and injects{" "}
            <span className={styles.code}>PORT={pickedSlot?.upstream_port ?? "?"}</span>{" "}
            into the systemd unit so your app listens on this slot.
          </span>
        </label>
      </div>

      <div className={styles.formRow}>
        <label className={styles.field}>
          Source folder
          <div
            className={styles.input}
            aria-readonly
            style={{
              display: "flex",
              alignItems: "center",
              gap: 0,
              padding: 0,
              overflow: "hidden",
            }}
          >
            <span
              className={styles.muted}
              style={{
                padding: "8px 4px 8px 10px",
                background: "rgba(255,255,255,0.04)",
                userSelect: "none",
                fontFamily: "var(--font-mono, ui-monospace, monospace)",
                fontSize: 13,
              }}
            >
              {APPS_BASE_DIR}/
            </span>
            <span
              style={{
                flex: 1,
                padding: "8px 10px",
                fontFamily: "var(--font-mono, ui-monospace, monospace)",
                fontSize: 13,
                color: name ? "inherit" : "var(--text-dim)",
              }}
            >
              {name || "<app-name>"}
            </span>
          </div>
          <span className={styles.muted} style={{ fontSize: 12, marginTop: 4 }}>
            Always derived from the app name. The agent creates this directory
            and owns it as <span className={styles.code}>apps:apps</span>.
          </span>
        </label>
        <label className={styles.field}>
          Runtime / Language
          <select
            ref={runtimeRef}
            name="runtime"
            className={styles.select}
            value={runtime}
            onChange={(e) => handleRuntimeChange(e.target.value as RuntimeValue)}
          >
            {RUNTIME_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <span className={styles.muted} style={{ fontSize: 12, marginTop: 4 }}>
            Make sure the language runtime is installed via the 1-Click App
            Store on <Link href="/apps" className={styles.code}>/apps</Link>{" "}
            (Runtimes &amp; Languages tab).
          </span>
        </label>
        <label className={styles.field}>
          Exec start
          <input
            ref={execStartRef}
            name="exec_start"
            className={styles.input}
            required
            value={execStart}
            onChange={(e) => {
              setExecStart(e.target.value);
              setCustomExecEdited(true);
            }}
          />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setExecStart(p.cmd);
                  setCustomExecEdited(false);
                }}
                style={{
                  background:
                    execStart === p.cmd ? "var(--bg-elev-2)" : "transparent",
                  border:
                    execStart === p.cmd
                      ? "1px solid var(--accent)"
                      : "1px solid var(--border)",
                  borderRadius: 4,
                  padding: "2px 8px",
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  cursor: "pointer",
                  color: execStart === p.cmd ? "var(--accent)" : "var(--text-dim)",
                }}
                title={p.cmd}
              >
                {p.label}
              </button>
            ))}
          </div>
          <span className={styles.muted} style={{ fontSize: 12, marginTop: 4 }}>
            Command the systemd unit runs inside{" "}
            <span className={styles.code}>{sourceDir}</span>. Click a preset
            above or enter your own startup command.
          </span>
        </label>
      </div>

      {sourceMethod === "github" && (
        <label className={styles.field} style={{ marginBottom: 12 }}>
          Repository URL
          <input
            ref={repoUrlRef}
            name="repo_url"
            className={styles.input}
            type="text"
            placeholder={
              rootKeypairs[0]
                ? `git@${rootKeypairs[0]}:owner/repo.git`
                : "https://github.com/owner/repo.git"
            }
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            required
            autoComplete="off"
          />
          <div
            className={styles.muted}
            style={{ fontSize: 12, marginTop: 6, lineHeight: 1.55 }}
          >
            <div style={{ marginBottom: 4 }}>
              <strong>Public repo:</strong>{" "}
              <span className={styles.code}>https://github.com/owner/repo.git</span>{" "}
              — no keypair needed.
            </div>
            <div style={{ marginBottom: 4 }}>
              <strong>Private repo:</strong>{" "}
              <span className={styles.code}>git@&lt;alias&gt;:owner/repo.git</span>{" "}
              where <span className={styles.code}>&lt;alias&gt;</span> is a
              keypair name from{" "}
              <Link href="/ssh-keys" className={styles.code}>/ssh-keys</Link>{" "}
              under the <strong>root</strong> user section (the agent runs git
              as root). Add the matching{" "}
              <span className={styles.code}>.pub</span> as a Deploy Key on the
              GitHub repo first.
            </div>
            {rootKeypairs.length > 0 ? (
              <div style={{ marginTop: 8 }}>
                <span style={{ marginRight: 6 }}>Available aliases on root:</span>
                {rootKeypairs.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() =>
                      setRepoUrl((prev) => {
                        // If the field is empty or doesn't already use the
                        // git@alias: form, inject a template. Otherwise just
                        // swap the alias and keep the owner/repo path.
                        const m = prev.match(/^git@[^:]+:(.*)$/);
                        const tail = m ? m[1] : "owner/repo.git";
                        return `git@${name}:${tail}`;
                      })
                    }
                    className={styles.code}
                    style={{
                      marginRight: 6,
                      marginBottom: 4,
                      background: "var(--bg-elev-2)",
                      border: "1px solid var(--border)",
                      borderRadius: 4,
                      padding: "2px 8px",
                      fontFamily: "var(--mono)",
                      fontSize: 11,
                      cursor: "pointer",
                      color: "var(--accent)",
                    }}
                    title={`Build URL using git@${name}:…`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ marginTop: 8 }}>
                No deploy keypairs registered on root yet. Generate one at{" "}
                <Link href="/ssh-keys" className={styles.code}>/ssh-keys</Link>{" "}
                (user = root), add its public key to your GitHub repo&apos;s
                Deploy Keys, then come back here.
              </div>
            )}
            <div style={{ marginTop: 8 }}>
              The agent clones into{" "}
              <span className={styles.code}>{sourceDir}</span>, auto-detects and
              installs dependencies (Node, Bun, Python{" "}
              <span className={styles.code}>.venv</span>, PHP{" "}
              <span className={styles.code}>composer</span>, Go, Ruby, Rust,
              Java, .NET), builds, and starts the systemd unit.
            </div>
          </div>
        </label>
      )}

      {/* Project .env files - the files the app's framework actually loads
          (e.g. Next.js .env.local). Editable once the source folder has code
          (after Pull), so the operator can create/edit .env before Build and
          Deploy. Its Save/Create buttons are type="button" and call the agent
          directly, so they don't submit this deploy form. */}
      {name && sourceState === "populated" && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            Project env files
          </div>
          <EnvFilesEditor name={name} preDeploy />
        </div>
      )}

      {/* SSL + DNS for this subdomain are owned by the /domains site; the
          apps deploy reuses whatever's already set up there. */}
      <input type="hidden" name="issue_ssl" value="" />
      <input type="hidden" name="skip_dns_check" value="on" />

      {state?.ok === false && <div className={styles.error}>{state.error}</div>}

      {/* Source-folder gate hint. Visible whenever Deploy would be disabled
          because /srv/apps/<name>/ doesn't have any code yet. Wrapped in a
          stable height container so the button row doesn't jump up when the
          hint disappears after a successful Pull. */}
      {name && sourceState !== "populated" && !sourceChecking && (
        <div className={styles.muted} style={{ fontSize: 12, marginBottom: 10 }}>
          {sourceMethod === "github" ? (
            <>
              <strong>Deploy is locked</strong> — source folder{" "}
              <span className={styles.code}>{sourceDir}</span>{" "}
              {sourceState === "missing"
                ? "doesn't exist yet"
                : "is empty"}
              . Click <strong>Pull</strong> first to clone the repo, then
              Deploy will unlock.
            </>
          ) : (
            <>
              <strong>Deploy is locked</strong> — source folder{" "}
              <span className={styles.code}>{sourceDir}</span>{" "}
              {sourceState === "missing" ? "doesn't exist yet" : "is empty"}.
              Place your code there (e.g.{" "}
              <span className={styles.code}>rsync</span>,{" "}
              <span className={styles.code}>git clone</span>, or upload) and
              Deploy will unlock.
            </>
          )}
        </div>
      )}

      {/* Four-stage pipeline. Each button submits the same form but with a
          different `step` value, the agent only runs the matching stage.
          Pull/Install/Build are "preview" stages: they don't write to
          panel.db. Deploy commits the systemd unit + persists the row. */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {sourceMethod === "github" && (
          <button
            type="submit"
            name="step"
            value="pull"
            className={styles.btnGhost}
            disabled={pending}
            onClick={() => { lastStepRef.current = "pull"; }}
            title="Run git clone / git pull only"
          >
            {pending ? "..." : "Pull"}
          </button>
        )}
        <button
          type="submit"
          name="step"
          value="install"
          className={styles.btnGhost}
          disabled={pending}
          onClick={() => { lastStepRef.current = "install"; }}
          title="Auto-detect and install dependencies (npm, bun, pip .venv, composer, go, bundle, cargo, maven, dotnet)"
        >
          {pending ? "..." : "Install"}
        </button>
        <button
          type="submit"
          name="step"
          value="build"
          className={styles.btnGhost}
          disabled={pending}
          onClick={() => { lastStepRef.current = "build"; }}
          title="Run project build step (npm/bun build, cargo build --release, go build, mvn package, dotnet publish, etc.)"
        >
          {pending ? "..." : "Build"}
        </button>
        <button
          type="submit"
          name="step"
          value="deploy"
          className={styles.btn}
          disabled={pending || sourceState !== "populated"}
          onClick={() => { lastStepRef.current = "deploy"; }}
          title={
            sourceState !== "populated"
              ? `Source folder ${sourceDir} is ${sourceState ?? "unknown"} — pull or stage code first`
              : "Write systemd unit + start the app"
          }
        >
          {pending ? "..." : "Deploy"}
        </button>
      </div>

      {state?.ok && state.data?.taskId && (
        // Keyed by task: each step starts with an empty log and its own
        // status, not the previous step's lines under the new task's id.
        <TaskProgress
          key={state.data.taskId}
          taskId={state.data.taskId}
          onComplete={(s) => {
            // Re-probe the folder state regardless of which step ran — Pull
            // flips empty → populated, Install/Build can change file count
            // too, and the operator may have copied files in by hand
            // between steps.
            if (s === "succeeded") {
              reprobeSourceState();
            }
            // Bounce back to /apps once the systemd unit is up so the
            // operator sees their new row. Pull / Install / Build are
            // preview stages — leave them on the form to continue staging.
            if (
              s === "succeeded" &&
              (lastStepRef.current === "deploy" || lastStepRef.current === "all")
            ) {
              router.push("/apps");
              router.refresh();
            }
          }}
        />
      )}
    </form>
  );
}
