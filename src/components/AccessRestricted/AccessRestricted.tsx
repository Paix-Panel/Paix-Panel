import Link from "next/link";
import { Lock } from "lucide-react";
import styles from "@/components/page.module.css";

type Props = {
  title?: string;
  message?: string;
  backHref?: string;
  backLabel?: string;
};

export default function AccessRestricted({
  title = "Access restricted",
  message = "You do not have permission to view this section. Ask an Admin or Super Admin to assign this task to your account.",
  backHref = "/dashboard",
  backLabel = "Back to Dashboard",
}: Props) {
  return (
    <div className={styles.section} style={{ maxWidth: 560, margin: "24px auto" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            display: "grid",
            placeItems: "center",
            background: "var(--danger-bg)",
            border: "1px solid var(--danger-border)",
            color: "var(--danger)",
            flexShrink: 0,
          }}
        >
          <Lock size={18} />
        </div>
        <div>
          <h1 className={styles.title} style={{ fontSize: 18, marginBottom: 6 }}>
            {title}
          </h1>
          <p className={styles.muted} style={{ marginTop: 0, marginBottom: 14, lineHeight: 1.5 }}>
            {message}
          </p>
          <Link href={backHref} className={styles.btnGhost}>
            {backLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
