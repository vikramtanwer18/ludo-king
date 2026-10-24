"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Copy, ExternalLink, ImagePlus, Trash2 } from "lucide-react";
import { useMe, useStore, type Result } from "@/lib/store";
import { CANCEL_REASONS, RULES, gameBySlug, inr, prizeFor } from "@/lib/config";
import type { Match, Outcome, User } from "@/lib/types";
import { compressImage } from "@/lib/image";
import { Avatar, Empty, RoomCode, StatusPill, mmss, toast, useNow } from "@/components/ui";

const LUDO_KING = "https://play.google.com/store/apps/details?id=com.ludo.king";

export default function MatchPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const me = useMe()!;
  const m = useStore((s) => s.matches.find((x) => x.id === id));
  const users = useStore((s) => s.users);
  const now = useNow(1000);
  const [busy, setBusy] = useState(false);

  if (!m)
    return (
      <Empty
        title="This room isn't here"
        body="It may have been deleted by the host."
        action={<Link href="/" className="btn-primary">Back to games</Link>}
      />
    );

  const host = users.find((u) => u.id === m.createdBy)!;
  const guest = users.find((u) => u.id === m.joinedBy);
  const isHost = m.createdBy === me.id;
  const isGuest = m.joinedBy === me.id;
  const isPlayer = isHost || isGuest;
  const game = gameBySlug(m.game);

  const run = async (p: Promise<Result>, ok?: string, go?: string) => {
    setBusy(true);
    const r = await p;
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    if (ok) toast.ok(ok);
    if (go) router.push(go);
  };
  const s = useStore.getState();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Link href={`/play/${m.game}`} className="text-muted hover:text-ink text-[15px]">
          ‹ {game?.name}
        </Link>
        <StatusPill status={m.status} />
      </div>

      {/* Players */}
      <section className="card p-5">
        <div className="flex items-center justify-between gap-2">
          <Player u={host} label={isHost ? "You · host" : "Host"} winner={m.winnerId === host.id} />
          <span className="font-display font-bold text-2xl text-muted">vs</span>
          {guest ? (
            <Player u={guest} label={isGuest ? "You" : "Player 2"} winner={m.winnerId === guest.id} right />
          ) : (
            <div className="flex flex-col items-end gap-1.5 text-right">
              <span className="w-14 h-14 rounded-full border-2 border-dashed border-line grid place-items-center text-2xl text-muted">?</span>
              <span className="text-sm text-muted">Open seat</span>
            </div>
          )}
        </div>
        {m.amount > 0 ? (
          <div className="mt-4 border-t border-line pt-3 grid grid-cols-2 gap-3 text-center">
            <div>
              <p className="text-sm text-muted">Entry per player</p>
              <p className="font-display font-bold text-xl">{inr(m.amount)}</p>
            </div>
            <div>
              <p className="text-sm text-muted">Winner gets</p>
              <p className="font-display font-bold text-xl text-green">{inr(m.prize ?? prizeFor(m.amount, m.feePct).prize)}</p>
            </div>
          </div>
        ) : (
          m.note && <p className="mt-4 text-muted border-t border-line pt-3">“{m.note}”</p>
        )}
      </section>

      {/* ---- OPEN ---- */}
      {m.status === "open" &&
        (isHost ? (
          <Panel title="Waiting for a player" body="Your room is in the lobby. You'll get a notification when someone asks to join.">
            <button disabled={busy} className="btn-danger" onClick={() => run(s.deleteMatch(m.id), "Room deleted.", `/play/${m.game}`)}>
              <Trash2 size={18} /> Delete room
            </button>
          </Panel>
        ) : (
          <Panel
            title={`${host.name} is looking for a player`}
            body={m.amount ? `Ask to join. ${inr(m.amount)} is held from your wallet and returned if the host declines.` : "Ask to join. The host decides whether to accept."}
          >
            <button disabled={busy} className="btn-go" onClick={() => run(s.requestJoin(m.id), "Request sent.")}>
              Ask to join{m.amount ? ` · ${inr(m.amount)}` : ""}
            </button>
          </Panel>
        ))}

      {/* ---- REQUESTED ---- */}
      {m.status === "requested" &&
        (isHost ? (
          <Panel title={`${guest?.name} wants to play`} body={`If you accept, you'll have ${RULES.roomCodeMinutes} minutes to create a Ludo King room and share its code here.`}>
            <div className="flex gap-3">
              <button disabled={busy} className="btn-go flex-1" onClick={() => run(s.acceptRequest(m.id), "Accepted. Now share the room code.")}>Accept</button>
              <button disabled={busy} className="btn-ghost flex-1" onClick={() => run(s.rejectRequest(m.id), "Request declined.")}>Decline</button>
            </div>
          </Panel>
        ) : isGuest ? (
          <Panel title="Waiting for the host" body={`${host.name} will accept or decline your request.`}>
            <button disabled={busy} className="btn-ghost" onClick={() => run(s.withdrawRequest(m.id), "Request withdrawn.", `/play/${m.game}`)}>Withdraw request</button>
          </Panel>
        ) : (
          <Panel title="Someone already asked to join" body="Try another room in the lobby." />
        ))}

      {/* ---- RUNNING ---- */}
      {m.status === "running" && isPlayer && <Running m={m} isHost={isHost} host={host} now={now} />}
      {m.status === "running" && !isPlayer && <Panel title="This match is being played" body="Results will show here when it's over." />}

      {/* ---- CLOSED ---- */}
      {(m.status === "completed" || m.status === "cancelled" || m.status === "disputed") && (
        <Closed m={m} meId={me.id} users={users} />
      )}

      {isPlayer && m.status !== "open" && (
        <details className="card p-4 group">
          <summary className="font-semibold cursor-pointer list-none flex justify-between">
            Match rules <span className="text-muted group-open:rotate-180 transition-transform">⌄</span>
          </summary>
          <ul className="mt-3 space-y-2 text-[15px] text-muted list-disc pl-5">
            <li>The host shares the room code within {RULES.roomCodeMinutes} minutes of accepting, or the match is cancelled.</li>
            <li>Post your result within {RULES.resultMinutes} minutes of the first result. If you don&apos;t, your opponent&apos;s result stands.</li>
            <li>Winners add a screenshot of the Ludo King win screen.</li>
            <li>If results don&apos;t match, the match goes to review.</li>
          </ul>
          <Link href="/rules" className="inline-block mt-3 text-blue font-medium">All fair-play rules</Link>
        </details>
      )}
    </div>
  );
}

function Player({ u, label, winner, right }: { u: User; label: string; winner?: boolean; right?: boolean }) {
  return (
    <div className={`flex flex-col gap-1.5 min-w-0 ${right ? "items-end text-right" : ""}`}>
      <div className="relative">
        <Avatar name={u.name} tone={u.tone} size={56} />
        {winner && <span className="absolute -top-2 -right-2 text-xl" aria-label="Winner">🏆</span>}
      </div>
      <span className="font-semibold truncate max-w-[9rem]">{u.name}</span>
      <span className="text-sm text-muted -mt-1">{label}</span>
    </div>
  );
}

function Panel({ title, body, children }: { title: string; body?: string; children?: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="text-xl font-semibold">{title}</h2>
      {body && <p className="text-muted mt-1">{body}</p>}
      {children && <div className="mt-4">{children}</div>}
    </section>
  );
}

/* ---------- running match ---------- */
function Running({ m, isHost, host, now }: { m: Match; isHost: boolean; host: User; now: number }) {
  const me = useMe()!;
  const [code, setCode] = useState("");
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const s = useStore.getState();
  const left = (m.roomCodeDeadline ?? 0) - now;

  const saveCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await s.setRoomCode(m.id, code);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.ok(editing ? "Room code updated." : "Room code shared.");
    setEditing(false);
    setCode("");
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(m.roomCode!);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy. Long-press the code instead.");
    }
  };

  const codeForm = (
    <form onSubmit={saveCode} className="mt-4">
      <label className="label" htmlFor="code">Ludo King room code</label>
      <div className="flex gap-2">
        <input
          id="code"
          className="field font-display text-xl tracking-[0.3em] text-center"
          inputMode="numeric"
          placeholder="0XXXXXXX"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
        />
        <button disabled={busy || code.length !== 8} className="btn-go shrink-0">{editing ? "Update" : "Share code"}</button>
      </div>
      <p className="text-sm text-muted mt-2">In Ludo King: Play with friends → Create → copy the 8-digit code that starts with 0.</p>
    </form>
  );

  return (
    <>
      {!m.roomCode ? (
        <section className="card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">{isHost ? "Share the room code" : "Waiting for the room code"}</h2>
              <p className="text-muted mt-1">
                {isHost ? "Create a room in Ludo King and paste its code here." : `${host.name} is creating the room in Ludo King.`}
              </p>
            </div>
            <span className={`font-display font-bold text-2xl tabular-nums ${left < 60000 ? "text-red" : "text-ink"}`} aria-label="Time left">
              {mmss(left)}
            </span>
          </div>
          {isHost && (
            <>
              <a href={LUDO_KING} target="_blank" rel="noreferrer" className="btn-ghost mt-4 w-full">
                Open Ludo King <ExternalLink size={16} />
              </a>
              {codeForm}
            </>
          )}
        </section>
      ) : (
        <section className="card p-5 text-center">
          <p className="text-muted mb-3">Room code</p>
          <RoomCode code={m.roomCode} />
          <div className="mt-5 grid grid-cols-1 min-[400px]:grid-cols-2 gap-3 max-w-sm mx-auto whitespace-nowrap">
            <button className="btn-ghost" onClick={copy}>
              {copied ? <Check size={18} className="text-green" /> : <Copy size={18} />} {copied ? "Copied" : "Copy code"}
            </button>
            <a href={LUDO_KING} target="_blank" rel="noreferrer" className="btn-primary">
              Open Ludo King <ExternalLink size={16} />
            </a>
          </div>
          {isHost && !m.results[me.id] && (
            <div className="text-left">
              {editing ? codeForm : (
                <button className="mt-4 text-sm text-blue font-medium" onClick={() => setEditing(true)}>Change room code</button>
              )}
            </div>
          )}
        </section>
      )}

      <ResultForm m={m} now={now} />
    </>
  );
}

/* ---------- result posting ---------- */
function ResultForm({ m, now }: { m: Match; now: number }) {
  const me = useMe()!;
  const users = useStore((s) => s.users);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [reason, setReason] = useState("");
  const [shot, setShot] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const mine = m.results[me.id];
  const otherId = m.createdBy === me.id ? m.joinedBy! : m.createdBy;
  const theirs = m.results[otherId];
  const otherName = users.find((u) => u.id === otherId)?.name ?? "Opponent";

  if (mine) {
    const left = (m.firstResultAt ?? now) + RULES.resultMinutes * 60000 - now;
    return (
      <section className="card p-5">
        <h2 className="text-xl font-semibold">You posted: {label(mine.outcome)}</h2>
        <p className="text-muted mt-1">
          Waiting for {otherName}. If they don&apos;t post within <b className="tabular-nums text-ink">{mmss(left)}</b>, your result stands.
        </p>
        {mine.screenshot && <img src={mine.screenshot} alt="Your screenshot" className="mt-4 rounded-xl border border-line max-h-64" />}
      </section>
    );
  }

  const pick = async (f?: File) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) return toast.error("Choose an image file (JPG, PNG, WebP).");
    try {
      setShot(await compressImage(f));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!outcome) return toast.error("Choose your result.");
    setBusy(true);
    const r = await useStore.getState().submitResult(m.id, outcome, { reason: reason || undefined, screenshot: shot || undefined });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.ok("Result posted.");
  };

  const opts: { v: Outcome; t: string; cls: string }[] = [
    { v: "won", t: "I won", cls: "peer-checked:bg-green peer-checked:text-white peer-checked:border-green" },
    { v: "lost", t: "I lost", cls: "peer-checked:bg-ink peer-checked:text-white peer-checked:border-ink" },
    { v: "cancel", t: "Cancel", cls: "peer-checked:bg-red peer-checked:text-white peer-checked:border-red" },
  ];

  return (
    <form onSubmit={submit} className="card p-5">
      <h2 className="text-xl font-semibold">Post your result</h2>
      <p className="text-muted mt-1">
        {theirs ? `${otherName} posted “${label(theirs.outcome)}”. Post yours now.` : "After the game, tell us how it went."}
      </p>
      <fieldset className="grid grid-cols-3 gap-2 mt-4">
        <legend className="sr-only">Result</legend>
        {opts.map((o) => (
          <label key={o.v} className="relative">
            <input type="radio" name="outcome" value={o.v} className="peer sr-only" checked={outcome === o.v} onChange={() => setOutcome(o.v)} />
            <span className={`block text-center rounded-xl border border-line h-12 leading-[46px] font-display font-semibold cursor-pointer peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-blue ${o.cls}`}>
              {o.t}
            </span>
          </label>
        ))}
      </fieldset>

      {outcome === "won" && (
        <div className="mt-4">
          <label className="label">Screenshot of the win screen</label>
          <label className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line h-28 cursor-pointer hover:bg-board text-muted overflow-hidden">
            {shot ? <img src={shot} alt="Selected screenshot" className="h-full object-contain" /> : (<><ImagePlus size={20} /> Choose image</>)}
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
          </label>
        </div>
      )}
      {outcome === "cancel" && (
        <div className="mt-4">
          <label className="label" htmlFor="reason">Why are you cancelling?</label>
          <select id="reason" className="field" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Choose a reason</option>
            {CANCEL_REASONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>
      )}
      {outcome === "lost" && <p className="mt-4 text-[15px] text-muted">Posting “I lost” ends the match right away with {otherName} as the winner.</p>}

      <button disabled={busy || !outcome} className="btn-primary w-full mt-5">Post result</button>
      <p className="text-sm text-muted mt-2">You can&apos;t change a result after posting it.</p>
    </form>
  );
}

const label = (o: Outcome) => (o === "won" ? "I won" : o === "lost" ? "I lost" : "Cancel");

/* ---------- finished / cancelled / review ---------- */
function Closed({ m, meId, users }: { m: Match; meId: string; users: User[] }) {
  const name = (id: string) => (id === meId ? "You" : users.find((u) => u.id === id)?.name ?? "Player");
  const isPlayer = m.createdBy === meId || m.joinedBy === meId;
  const title =
    m.status === "completed"
      ? m.winnerId === meId
        ? "You won 🎉"
        : isPlayer
        ? `${name(m.winnerId!)} won`
        : `${name(m.winnerId!)} won`
      : m.status === "cancelled"
      ? "Match cancelled"
      : "Under review";
  return (
    <section className="card p-5">
      <h2 className="text-2xl font-bold">{title}</h2>
      {m.endedReason && <p className="text-muted mt-1">{m.endedReason}</p>}
      {isPlayer && m.amount > 0 && (
        <p className="mt-2 text-[15px]">
          {m.status === "completed"
            ? m.winnerId === meId
              ? <>💰 <b className="text-green">{inr(m.prize ?? 0)}</b> added to your wallet.</>
              : <>Your entry of {inr(m.amount)} went to the winner.</>
            : m.status === "cancelled"
            ? <>Your entry of {inr(m.amount)} is back in your wallet.</>
            : <>Both entries ({inr(m.amount)} each) are held until support decides.</>}
        </p>
      )}
      {Object.keys(m.results).length > 0 && (
        <ul className="mt-4 divide-y divide-line border-t border-line">
          {Object.entries(m.results).map(([uid, r]) => (
            <li key={uid} className="py-3 flex items-start justify-between gap-3">
              <span>
                <span className="font-medium">{name(uid)}</span>
                <span className="text-muted"> posted “{label(r.outcome)}”</span>
                {r.reason && <span className="block text-sm text-muted">{CANCEL_REASONS.find((c) => c.id === r.reason)?.label}</span>}
              </span>
              {r.screenshot && (
                <a href={`/api/screenshot/${m.id}/${uid}`} target="_blank" rel="noreferrer">
                  <img src={r.screenshot} alt={`${name(uid)}'s screenshot`} className="w-16 h-16 object-cover rounded-lg border border-line" />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5 flex flex-wrap gap-3">
        <Link href={`/play/${m.game}`} className="btn-primary">Play again</Link>
        {m.status === "disputed" && isPlayer && <Link href="/support" className="btn-ghost">Contact support</Link>}
      </div>
    </section>
  );
}
