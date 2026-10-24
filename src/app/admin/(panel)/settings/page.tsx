import { getDb } from "@/server/db";
import { getSettings } from "@/server/settings";
import { requireAdmin } from "@/server/auth";
import { GAMES, WALLET, inr, prizeFor } from "@/lib/config";
import { broadcastAction, saveAnnouncementAction, saveGamesAction, saveMaintenanceAction, saveWalletSettingsAction } from "../../actions";
import ActionForm from "@/components/admin/ActionForm";
import { PageHead } from "@/components/admin/kit";

function Toggle({ name, label, defaultChecked, hint }: { name: string; label: string; defaultChecked: boolean; hint?: string }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="peer sr-only" />
      <span className="mt-0.5 w-11 h-6 shrink-0 rounded-full bg-line relative transition-colors peer-checked:bg-green after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5 peer-focus-visible:outline peer-focus-visible:outline-blue" />
      <span>
        <span className="block font-medium">{label}</span>
        {hint && <span className="block text-sm text-muted">{hint}</span>}
      </span>
    </label>
  );
}

export default async function SettingsPage() {
  await requireAdmin();
  const db = await getDb();
  const s = await getSettings(db.q);
  const [{ total, active7 }] = await db.q<{ total: number; active7: number }>(
    "SELECT COUNT(*) FILTER (WHERE status='active')::int total, COUNT(*) FILTER (WHERE status='active' AND last_seen_at >= $1)::int active7 FROM users",
    [Date.now() - 7 * 86400000]
  );

  return (
    <div className="space-y-5 max-w-3xl">
      <PageHead title="Settings & broadcast" sub="Changes show up on players' screens within a few seconds." />

      <section className="card p-5">
        <h2 className="text-xl font-semibold">Announcement banner</h2>
        <p className="text-muted mb-4">A yellow banner at the top of every player page.</p>
        <ActionForm action={saveAnnouncementAction} submit="Save announcement">
          <textarea name="text" aria-label="Announcement text" className="field h-24 py-2" maxLength={300} defaultValue={s.announcement.text} placeholder="e.g. Weekend tournament starts Saturday 7 pm. Create your rooms early." />
          <Toggle name="active" label="Show the banner" defaultChecked={s.announcement.active} />
        </ActionForm>
      </section>

      <section className="card p-5">
        <h2 className="text-xl font-semibold">Wallet & commission</h2>
        <p className="text-muted mb-4">
          Platform fee taken from each paid room&apos;s pot. Example at {s.wallet.commissionPct}%: two players pay ₹100 each, winner gets {inr(prizeFor(10000, s.wallet.commissionPct).prize)}. A new value applies to rooms created after you save.
        </p>
        <ActionForm action={saveWalletSettingsAction} submit="Save commission">
          <label className="label" htmlFor="commissionPct">Commission (% of pot)</label>
          <input id="commissionPct" name="commissionPct" type="number" min={0} max={50} step={0.5} defaultValue={s.wallet.commissionPct} className="field w-40" />
          <p className="text-sm text-muted">
            Limits: add cash ₹{WALLET.depositMin}–₹{WALLET.depositMax}, room amount ₹{WALLET.stakeMin}–₹{WALLET.stakeMax} in steps of ₹{WALLET.stakeStep}, withdraw from ₹{WALLET.withdrawMin}. These are in <span className="font-mono">src/lib/config.ts</span>.
          </p>
        </ActionForm>
      </section>

      <section className="card p-5">
        <h2 className="text-xl font-semibold">Games</h2>
        <p className="text-muted mb-4">Turned-off games show “not open right now” and no new rooms can be made. Running matches finish normally.</p>
        <ActionForm action={saveGamesAction} submit="Save games">
          <div className="space-y-3">
            {GAMES.map((g) => (
              <Toggle key={g.slug} name={`game_${g.slug}`} label={g.name} defaultChecked={!!s.games[g.slug]} />
            ))}
          </div>
        </ActionForm>
      </section>

      <section className="card p-5">
        <h2 className="text-xl font-semibold">Maintenance mode</h2>
        <p className="text-muted mb-4">Blocks new rooms and join requests, and shows a red banner. Players can still finish live matches.</p>
        <ActionForm action={saveMaintenanceAction} submit="Save maintenance">
          <input name="text" className="field" maxLength={300} defaultValue={s.maintenance.text} aria-label="Maintenance message" />
          <Toggle name="active" label="Maintenance mode on" defaultChecked={s.maintenance.active} />
        </ActionForm>
      </section>

      <section className="card p-5">
        <h2 className="text-xl font-semibold">Send a notification to players</h2>
        <p className="text-muted mb-4">Appears in each player&apos;s notifications with the bell badge.</p>
        <ActionForm action={broadcastAction} submit="Send" confirm="Send this message to players?">
          <textarea name="text" aria-label="Notification text" className="field h-24 py-2" maxLength={280} placeholder="e.g. New: Snakes & Ladders rooms are open." />
          <select name="audience" className="field" aria-label="Who gets it">
            <option value="all">All active players ({total})</option>
            <option value="active7">Players active in the last 7 days ({active7})</option>
          </select>
        </ActionForm>
      </section>
    </div>
  );
}
