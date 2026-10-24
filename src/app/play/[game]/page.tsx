"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { useMe, useStore } from "@/lib/store";
import { RULES, WALLET, gameBySlug, inr, prizeFor, type GameSlug } from "@/lib/config";
import { Empty, PageTitle, toast, useNow } from "@/components/ui";
import MatchCard from "@/components/MatchCard";

export default function Lobby() {
  const { game: slug } = useParams<{ game: string }>();
  const game0 = gameBySlug(slug);
  const gamesOn = useStore((s) => s.settings.games);
  const game = game0 && { ...game0, live: gamesOn[game0.slug] ?? game0.live };
  const router = useRouter();
  const me = useMe()!;
  const allMatches = useStore((s) => s.matches);
  const matches = allMatches.filter((m) => m.game === slug);
  const users = useStore((s) => s.users);
  const { createMatch, deleteMatch, requestJoin, withdrawRequest } = useStore.getState();
  const now = useNow(15000);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const balance = useStore((s) => s.wallet?.balance ?? 0);
  const commissionPct = useStore((s) => s.settings.commissionPct);

  if (!game) return <Empty title="Game not found" body="Pick a game from the home screen." action={<Link className="btn-primary" href="/">Go home</Link>} />;
  if (!game.live) return <Empty title={`${game.name} isn't open right now`} body="Try another game from the home screen." action={<Link className="btn-primary" href="/">Go home</Link>} />;

  const nameOf = (id?: string) => users.find((u) => u.id === id)?.name ?? "";
  const mine = matches.filter((m) => m.createdBy === me.id && (m.status === "open" || m.status === "requested"));
  const others = matches
    .filter((m) => m.createdBy !== me.id && (m.status === "open" || (m.status === "requested" && m.joinedBy === me.id)))
    .filter((m) => !q || nameOf(m.createdBy).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.createdAt - a.createdAt);
  const live = matches.filter((m) => m.status === "running").slice(0, 6);

  const rupees = Number(amount);
  const amountError =
    amount === ""
      ? ""
      : !Number.isInteger(rupees) || rupees < WALLET.stakeMin || rupees > WALLET.stakeMax
      ? `Enter ₹${WALLET.stakeMin} to ₹${WALLET.stakeMax.toLocaleString("en-IN")}.`
      : rupees % WALLET.stakeStep !== 0
      ? `Use a multiple of ₹${WALLET.stakeStep} (50, 100, 150…).`
      : "";
  const short = !amountError && amount !== "" && rupees * 100 > balance;
  const prize = !amountError && amount !== "" ? prizeFor(rupees * 100, commissionPct) : null;

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amount === "") return toast.error("Enter the room amount.");
    if (amountError) return toast.error(amountError);
    if (short) return toast.error(`You need ${inr(rupees * 100)} in your wallet. Add cash first.`);
    setBusy(true);
    const r = await createMatch(slug as GameSlug, rupees);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    setAmount("");
    toast.ok(`Room created. ${inr(rupees * 100)} is held from your wallet until the match ends.`);
  };
  const run = async (p: ReturnType<typeof requestJoin>, ok: string, go?: string) => {
    const r = await p;
    if (!r.ok) return toast.error(r.error);
    toast.ok(ok);
    if (go) router.push(go);
  };

  return (
    <div className="space-y-7">
      <PageTitle title={game.name} sub="Create a room or ask to join one." />

      <form onSubmit={create} className="card p-4 sm:p-5">
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h2 className="text-xl font-semibold">Create a room</h2>
          <Link href="/wallet" className="text-sm text-muted hover:text-ink">
            Wallet <b className="text-ink">{inr(balance)}</b>
          </Link>
        </div>
        <label className="label" htmlFor="amount">Room amount (₹)</label>
        <div className="flex flex-wrap gap-2 mb-3" aria-label="Quick amounts">
          {WALLET.stakeChips.map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => setAmount(String(c))}
              aria-pressed={rupees === c}
              className={`rounded-full border px-3 h-8 text-sm font-medium ${rupees === c ? "bg-ink text-white border-ink" : "bg-white border-line text-ink hover:bg-board"}`}
            >
              ₹{c.toLocaleString("en-IN")}
            </button>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative sm:flex-1">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-display font-semibold text-muted">₹</span>
            <input
              id="amount"
              className="field pl-8 font-display font-semibold text-lg"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder={`${WALLET.stakeMin} – ${WALLET.stakeMax}`}
              aria-describedby="amount-help"
              aria-invalid={!!amountError}
            />
          </div>
          <button disabled={busy || !!amountError || amount === ""} className="btn-go sm:w-40">Create room</button>
        </div>
        <p id="amount-help" className={`text-sm mt-2 ${amountError || short ? "text-red" : "text-muted"}`}>
          {amountError ? (
            amountError
          ) : short ? (
            <>
              Not enough balance. <Link href="/wallet" className="underline font-medium">Add cash</Link>
            </>
          ) : prize ? (
            <>Both players pay {inr(rupees * 100)}. Winner gets <b className="text-green">{inr(prize.prize)}</b>{commissionPct > 0 ? ` (${commissionPct}% platform fee)` : ""}.</>
          ) : (
            <>₹{WALLET.stakeMin} to ₹{WALLET.stakeMax.toLocaleString("en-IN")}, in steps of ₹{WALLET.stakeStep}. The amount is held from your wallet until the match ends.</>
          )}
        </p>
        <p className="text-sm text-muted mt-1">
          You can have up to {RULES.maxOpenMatches} open rooms. After you accept a player you&apos;ll have {RULES.roomCodeMinutes} minutes to share the room code.
        </p>
      </form>

      {mine.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Your rooms</h2>
          {mine.map((m) => (
            <MatchCard
              key={m.id}
              m={m}
              meId={me.id}
              now={now}
              action={
                m.status === "requested" ? (
                  <Link href={`/match/${m.id}`} className="btn-primary h-10 px-3 text-sm">Review request</Link>
                ) : (
                  <button
                    className="btn-danger h-10 w-10 px-0"
                    aria-label="Delete room"
                    onClick={() => run(deleteMatch(m.id), "Room deleted.")}
                  >
                    <Trash2 size={18} />
                  </button>
                )
              }
            />
          ))}
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Open rooms</h2>
          <label className="relative w-44 sm:w-60">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="field h-10 pl-9 text-[15px]" placeholder="Search a name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search rooms by host name" />
          </label>
        </div>
        {others.length === 0 ? (
          <Empty title="No open rooms right now" body="Create one above and share the app with a friend so they can join." />
        ) : (
          others.map((m) => (
            <MatchCard
              key={m.id}
              m={m}
              meId={me.id}
              now={now}
              action={
                m.joinedBy === me.id ? (
                  <button className="btn-ghost h-10 px-3 text-sm" onClick={() => run(withdrawRequest(m.id), "Request withdrawn.")}>
                    Withdraw
                  </button>
                ) : (
                  <button className="btn-go h-10 px-3 text-sm" onClick={() => run(requestJoin(m.id), "Request sent. Wait for the host to accept.", `/match/${m.id}`)}>
                    Join{m.amount ? ` · ${inr(m.amount)}` : ""}
                  </button>
                )
              }
            />
          ))
        )}
      </section>

      {live.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Playing now</h2>
          {live.map((m) => (
            <MatchCard key={m.id} m={m} meId={me.id} now={now} action={m.createdBy === me.id || m.joinedBy === me.id ? undefined : <span />} />
          ))}
        </section>
      )}
    </div>
  );
}
