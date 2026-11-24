import { loginAction } from "@/server-actions/auth";
import { config } from "@/lib/config";
import BoltMark from "@/components/BoltMark/BoltMark";
import LoginForm from "./LoginForm";
import styles from "./page.module.css";

export const metadata = { title: "Sign in" };

// The root layout reads the operator's accent from panel.db to build the
// palette. Without this, /login would be prerendered at build time and keep
// serving whatever accent was set when the panel was last built.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  const defaultEmail = config.isPreviewMock ? (config.bootstrapEmail ?? "") : "";
  const defaultPassword = config.isPreviewMock ? (config.bootstrapPassword ?? "") : "";
  return (
    <div className={styles.shell}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <BoltMark size={48} />
          <h1 className={styles.title}>Paix Panel</h1>
        </div>
        <p className={styles.subtitle}>Sign in to manage your server.</p>
        <LoginForm
          action={loginAction}
          defaultEmail={defaultEmail}
          defaultPassword={defaultPassword}
        />
        <p className={styles.footer}>© 2026 Amani Sinkala · Created 2026</p>
      </div>
    </div>
  );
}
