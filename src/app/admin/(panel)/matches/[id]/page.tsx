import Link from "next/link";
import { notFound } from "next/navigation";
import { getMatch } from "@/server/admin";
import { CANCEL_REASONS, gameBySlug, inr, prizeFor } from "@/lib/config";
import { deleteRoomAction, resolveMatchAction } from "../../../actions";
import ActionForm, { ConfirmButton } from "@/components/admin/ActionForm";
import { Dot, MatchStatusBadge, fmtDateTime } from "@/components/admin/kit";

const outcomeLabel = { won: "I won", lost: "I lost", cancel: "Cancel" } as const;

function Money({ label, v }: { label: string; v: string }) {
  return (
    <div className="rounded-xl bg-board px-3 py-2">
      <p className="text-sm text-muted">{label}</p>
      <p className="font-display font-bold text-lg">{v}</p>
    </div>
  );
}

export default async function MatchDetail(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const data = await getMatch(params.id);
  if (!data) notFound();
  const { match: m, users, history } = data;
  const u = (id?: string) => users.find((x) => x.id === id);
  const host = u(m.createdBy)!;
  const guest = u(m.joinedBy);
  const settle = (m.status === "disputed" || m.status === "running") && guest;

  const timeline = [
    { t: m.createdAt, text: `${host.name} created the room` },
    m.startedAt && { t: m.startedAt, text: `${host.name} accepted ${guest?.name ?? "a player"}` },
    ...Object.entries(m.results).map(([uid, r]) => ({ t: r.at, text: `${u(uid)?.name ?? "Player"} posted “${outcomeLabel[r.outcome]}”` })),
    ...history.map((h) => ({ t: h.at, text: `${h.admin ?? "Admin"}: ${h.action.replace("match.", "").replace("_", " ")}${h.detail ? ` (${h.detail})` : ""}` })),
  ]
    .filter(Boolean)
    .sort((a, b) => (a as { t: number }).t - (b as { t: number }).t) as { t: number; text: string }[];

  return (
    <div className="space-y-6">
      <Link href="/admin/matches" className="text-muted hover:text-ink text-[15px]">‹ Matches</Link>

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[26px] font-bold">{gameBySlug(m.game)?.name} <span className="font-mono text-base text-muted">#{m.id}</span></h1>
            <p className="text-muted">
              Room code {m.roomCode ?? "not shared"}{m.note ? ` · “${m.note}”` : ""} · Created {fmtDateTime(m.createdAt)}
            </p>
          </div>
          <MatchStatusBadge s={m.status} />
        </div>
        {m.amount > 0 && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Money label="Entry per player" v={inr(m.amount)} />
            <Money label="Pot" v={inr(m.amount * 2)} />
            <Money label={`Commission (${m.feePct}%)`} v={inr(m.fee ?? prizeFor(m.amount, m.feePct).fee)} />
            <Money
              label={m.status === "completed" ? "Paid to winner" : m.status === "cancelled" ? "Refunded" : "Winner will get"}
              v={m.status === "cancelled" ? `${inr(m.amount)} each` : inr(m.prize ?? prizeFor(m.amount, m.feePct).prize)}
            />
          </div>
        )}
        {m.endedReason && <p className="mt-3 rounded-xl bg-board px-3 py-2 text-[15px]">{m.endedReason}</p>}
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        {[host, guest].map((p, i) =>
          p ? (
            <div key={p.id} className={`card p-5 ${m.winnerId === p.id ? "ring-2 ring-green" : ""}`}>
              <div className="flex items-center gap-3">
                <Dot name={p.name} tone={p.tone} size={44} />
                <div className="flex-1">
                  <Link href={`/admin/users/${p.id}`} className="font-semibold text-lg hover:underline">{p.name}</Link>
                  <p className="text-sm text-muted">{i === 0 ? "Host" : "Player 2"} · {p.wins}W / {p.losses}L overall · {p.disputes} {p.disputes === 1 ? "dispute" : "disputes"}</p>
                </div>
                {m.winnerId === p.id && <span className="rounded-full bg-green text-white text-sm px-3 py-1">Winner</span>}
              </div>
              <div className="mt-4">
                {m.results[p.id] ? (
                  <>
                    <p className="font-medium">
                      Posted “{outcomeLabel[m.results[p.id].outcome]}”
                      <span className="text-muted font-normal"> · {fmtDateTime(m.results[p.id].at)}</span>
                    </p>
                    {m.results[p.id].reason && <p className="text-muted">{CANCEL_REASONS.find((c) => c.id === m.results[p.id].reason)?.label}</p>}
                    {m.results[p.id].screenshot && (
                      <a href={`/api/screenshot/${m.id}/${p.id}`} target="_blank" rel="noreferrer" className="block mt-3">
                        <img src={m.results[p.id].screenshot} alt={`${p.name}'s screenshot`} className="max-h-72 rounded-xl border border-line" />
                      </a>
                    )}
                  </>
                ) : (
                  <p className="text-muted">No result posted.</p>
                )}
              </div>
            </div>
          ) : (
            <div key="empty" className="card p-5 text-muted">No second player yet.</div>
          )
        )}
      </section>

      {settle && (
        <section className="card p-5">
          <h2 className="text-xl font-semibold">Settle this match</h2>
          <p className="text-muted mb-4">
            Check the screenshots, then pick the winner or cancel. Both players get a notification.
            {m.amount > 0 && ` Winner gets ${inr(prizeFor(m.amount, m.feePct).prize)}; cancelling refunds ${inr(m.amount)} to each player.`}
          </p>
          <ActionForm action={resolveMatchAction} submit="Save decision" submitClass="btn-primary" confirm="Save this decision? It can't be undone.">
            <input type="hidden" name="id" value={m.id} />
            <fieldset className="grid sm:grid-cols-3 gap-2">
              <legend className="sr-only">Decision</legend>
              {[
                { v: host.id, l: `${host.name} won` },
                { v: guest!.id, l: `${guest!.name} won` },
                { v: "cancel", l: "Cancel match" },
              ].map((o) => (
                <label key={o.v} className="relative">
                  <input type="radio" name="decision" value={o.v} className="peer sr-only" required />
                  <span className="block text-center rounded-xl border border-line h-12 leading-[46px] font-medium cursor-pointer peer-checked:bg-ink peer-checked:text-white peer-checked:border-ink peer-focus-visible:outline peer-focus-visible:outline-blue">
                    {o.l}
                  </span>
                </label>
              ))}
            </fieldset>
            <label className="label" htmlFor="note">Note to players (optional)</label>
            <input id="note" name="note" className="field" maxLength={200} placeholder="e.g. Screenshot shows Meera's tokens all home" />
          </ActionForm>
        </section>
      )}

      {(m.status === "open" || m.status === "requested") && (
        <ConfirmButton action={deleteRoomAction} fields={{ id: m.id }} label="Remove this room" cls="btn-danger" confirm="Remove this room? The host is notified." />
      )}

      <section className="card p-5">
        <h2 className="text-xl font-semibold mb-3">Timeline</h2>
        <ol className="space-y-2">
          {timeline.map((e, i) => (
            <li key={i} className="flex gap-3 text-[15px]">
              <span className="text-muted whitespace-nowrap w-36 shrink-0">{fmtDateTime(e.t)}</span>
              <span>{e.text}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
