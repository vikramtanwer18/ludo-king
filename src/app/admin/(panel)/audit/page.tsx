import Link from "next/link";
import { auditLog } from "@/server/admin";
import { PageHead, Table, fmtDateTime } from "@/components/admin/kit";

const LABELS: Record<string, string> = {
  "admin.login": "Signed in",
  "admin.password_changed": "Changed password",
  "user.suspend": "Suspended player",
  "user.unsuspend": "Lifted suspension",
  "user.force_logout": "Signed player out",
  "user.rename": "Renamed player",
  "user.message": "Messaged player",
  "match.resolve": "Settled match",
  "match.cancel": "Cancelled match",
  "match.delete_room": "Removed room",
  "settings.announcement": "Announcement",
  "settings.games": "Games",
  "settings.maintenance": "Maintenance",
  broadcast: "Broadcast",
};

const targetHref = (action: string, target: string | null) =>
  !target ? null : action.startsWith("user.") ? `/admin/users/${target}` : action.startsWith("match.") ? `/admin/matches/${target}` : null;

export default async function Audit() {
  const rows = await auditLog();
  return (
    <div>
      <PageHead title="Activity log" sub="Every admin action, newest first." />
      <Table head={["When", "Admin", "Action", "Target", "Details"]} empty={rows.length ? undefined : "Nothing logged yet."}>
        {rows.map((r) => {
          const href = targetHref(r.action, r.target);
          return (
            <tr key={r.id}>
              <td className="text-muted whitespace-nowrap">{fmtDateTime(r.at)}</td>
              <td>{r.admin ?? "—"}</td>
              <td className="font-medium whitespace-nowrap">{LABELS[r.action] ?? r.action}</td>
              <td>{href ? <Link href={href} className="font-mono text-sm text-blue hover:underline">{r.target}</Link> : <span className="text-muted">{r.target ?? "—"}</span>}</td>
              <td className="text-muted max-w-md">{r.detail ?? ""}</td>
            </tr>
          );
        })}
      </Table>
    </div>
  );
}
