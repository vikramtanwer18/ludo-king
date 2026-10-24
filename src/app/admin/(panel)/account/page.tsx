import { requireAdmin } from "@/server/auth";
import { adminList } from "@/server/admin";
import { changePasswordAction } from "../../actions";
import ActionForm from "@/components/admin/ActionForm";
import { PageHead, ago } from "@/components/admin/kit";

export default async function Account() {
  const me = await requireAdmin();
  const admins = await adminList();
  return (
    <div className="space-y-5 max-w-2xl">
      <PageHead title="My account" sub={`${me.name} · ${me.email}`} />

      <section className="card p-5">
        <h2 className="text-xl font-semibold mb-4">Change password</h2>
        <ActionForm action={changePasswordAction} submit="Change password">
          <div>
            <label className="label" htmlFor="current">Current password</label>
            <input id="current" name="current" type="password" className="field" autoComplete="current-password" required />
          </div>
          <div>
            <label className="label" htmlFor="next">New password</label>
            <input id="next" name="next" type="password" className="field" autoComplete="new-password" minLength={8} required />
            <p className="text-sm text-muted mt-1">At least 8 characters, with letters and numbers.</p>
          </div>
          <div>
            <label className="label" htmlFor="confirm">Repeat new password</label>
            <input id="confirm" name="confirm" type="password" className="field" autoComplete="new-password" required />
          </div>
        </ActionForm>
      </section>

      <section className="card p-5">
        <h2 className="text-xl font-semibold mb-3">Admins</h2>
        <ul className="divide-y divide-line">
          {admins.map((a) => (
            <li key={a.id} className="py-2.5 flex justify-between gap-3">
              <span>
                <span className="block font-medium">{a.name}</span>
                <span className="text-sm text-muted">{a.email}</span>
              </span>
              <span className="text-sm text-muted">Last sign-in {ago(a.lastLoginAt)}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted mt-3">Add more admins with ADMIN_EMAIL / ADMIN_PASSWORD on the server, or insert into the admins table.</p>
      </section>
    </div>
  );
}
