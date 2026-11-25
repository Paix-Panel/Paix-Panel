import { requireSession } from "@/lib/auth";
import { agent, type WebmailFolderSummary, type WebmailMessageSummary } from "@/lib/agent";
import styles from "@/components/page.module.css";
import WebmailClient from "./WebmailClient";

export const dynamic = "force-dynamic";

export default async function WebmailPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  const s = await requireSession();
  if (s.role !== "admin") {
    return (
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Webmail</h1>
          <div className={styles.subtitle}>Only admins can access server mailboxes from the panel.</div>
        </div>
      </div>
    );
  }

  const sp = await searchParams;
  let accounts: string[] = [];
  let initialError: string | null = null;

  try {
    const resp = await agent.mail.listMailboxes();
    accounts = resp.mailboxes.map((m) => m.email);
  } catch (e) {
    initialError = e instanceof Error ? e.message : "Could not load mailboxes.";
  }

  const requested = sp.account?.trim().toLowerCase() ?? "";
  const initialAccount =
    accounts.find((a) => a.toLowerCase() === requested) ?? accounts[0] ?? "";

  let initialFolders: WebmailFolderSummary[] = [];
  let initialMessages: WebmailMessageSummary[] = [];

  if (initialAccount) {
    const [fRes, mRes] = await Promise.all([
      agent.webmail.folders(initialAccount).catch((e) => {
        if (!initialError) initialError = e instanceof Error ? e.message : "Could not read folders.";
        return [] as WebmailFolderSummary[];
      }),
      agent.webmail.messages(initialAccount, "INBOX", "").catch((e) => {
        if (!initialError) initialError = e instanceof Error ? e.message : "Could not read inbox.";
        return [] as WebmailMessageSummary[];
      }),
    ]);
    initialFolders = fRes;
    initialMessages = mRes;
  }

  return (
    <div>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Webmail</h1>
          <div className={styles.subtitle}>
            Built-in browser mail client backed directly by Postfix &amp; Dovecot Maildir.
          </div>
        </div>
      </div>

      <WebmailClient
        accounts={accounts}
        initialAccount={initialAccount}
        initialFolders={initialFolders}
        initialMessages={initialMessages}
        initialError={initialError}
      />
    </div>
  );
}
