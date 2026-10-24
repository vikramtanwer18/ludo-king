"use client";

import Link from "next/link";
import { useMe, useStore } from "@/lib/store";
import { GAMES } from "@/lib/config";
import { useNow } from "@/components/ui";
import MatchCard from "@/components/MatchCard";


const STEPS = [
  { t: "Create a room", d: "Pick a game. Your room shows up in the lobby for friends." },
  { t: "Accept a player", d: "Someone asks to join. You accept or decline." },
  { t: "Share the code", d: "Make a room in Ludo King and paste its 8-digit code here." },
  { t: "Post the result", d: "Both players say who won. The leaderboard updates." },
];

export default function Home() {
  const me = useMe()!;
  const matches = useStore((s) => s.matches);
  const gamesOn = useStore((s) => s.settings.games);
  const now = useNow(15000);
  const active = matches.filter(
    (m) =>
      (m.createdBy === me.id || m.joinedBy === me.id) &&
      (m.status === "running" || m.status === "requested")
  );
  const openCount = (slug: string) => matches.filter((m) => m.game === slug && m.status === "open").length;

  return (
    <div className="space-y-8">
      <section>
        <p className="text-muted">Hi {me.name},</p>
        <h1 className="text-[34px] font-bold leading-tight">Who are you playing today?</h1>
      </section>

      {active.length > 0 && (
        <section className="space-y-3" aria-label="Your active matches">
          {active.map((m) => (
            <MatchCard key={m.id} m={m} meId={me.id} now={now} />
          ))}
        </section>
      )}

      <section aria-label="Games">
        <div className="grid sm:grid-cols-2 gap-4">
          {GAMES.map((g0, i) => {
            const g = { ...g0, live: gamesOn[g0.slug] ?? g0.live };
            const hero = i === 0;
            const open = openCount(g.slug);
            const card = (
              <article
                className={`h-full overflow-hidden rounded-3xl bg-white border border-line ${
                  hero ? "sm:grid sm:grid-cols-[1.45fr_1fr]" : "flex flex-col"
                }`}
              >
                <div className="relative bg-ink">
                  <img
                    src={`${g.image}-1280.webp`}
                    srcSet={`${g.image}-640.webp 640w, ${g.image}-1280.webp 1280w`}
                    sizes={hero ? "(min-width: 1024px) 440px, (min-width: 640px) 58vw, 100vw" : "(min-width: 640px) 360px, 100vw"}
                    width={1280}
                    height={720}
                    alt=""
                    loading={i < 2 ? "eager" : "lazy"}
                    decoding="async"
                    className={`block w-full aspect-video object-cover ${hero ? "sm:h-full" : ""} ${!g.live && g0.live ? "grayscale" : ""}`}
                  />
                  {!g.live && g0.live && (
                    <span className="absolute inset-0 grid place-items-center bg-ink/55 text-white font-display font-semibold text-lg">
                      Not open right now
                    </span>
                  )}
                </div>
                <div className={`p-4 sm:p-5 flex flex-col gap-1 ${hero ? "sm:justify-center" : "flex-1"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <h2 className={`font-bold ${hero ? "text-[26px] sm:text-[30px]" : "text-[22px]"}`}>{g.name}</h2>
                    {g.live ? (
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[13px] font-medium ${open ? "bg-green-soft text-green-ink" : "bg-board text-muted"}`}>
                        {open} open {open === 1 ? "room" : "rooms"}
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-board text-muted px-2.5 py-0.5 text-[13px] font-medium">
                        {g0.live ? "Paused" : "Coming soon"}
                      </span>
                    )}
                  </div>
                  <p className="text-muted text-[15px]">{g.blurb}</p>
                  {g.live && hero && <span className="btn-go self-start mt-3">Play {g.name}</span>}
                </div>
              </article>
            );
            return g.live ? (
              <Link
                key={g.slug}
                href={`/play/${g.slug}`}
                className={`block rounded-3xl hover:-translate-y-0.5 hover:shadow-lift transition ${hero ? "sm:col-span-2" : ""}`}
              >
                {card}
              </Link>
            ) : (
              <div key={g.slug} aria-disabled className={hero ? "sm:col-span-2" : ""}>
                {card}
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="how">
        <h2 id="how" className="text-2xl font-bold mb-3">How a match works</h2>
        <ol className="grid sm:grid-cols-2 gap-3">
          {STEPS.map((s, i) => (
            <li key={s.t} className="card p-4 flex gap-3">
              <span className={`${["bg-red", "bg-green", "bg-yellow text-yellow-ink", "bg-blue"][i]} text-white w-8 h-8 shrink-0 rounded-lg grid place-items-center font-display font-bold`}>{i + 1}</span>
              <span>
                <span className="block font-semibold">{s.t}</span>
                <span className="block text-muted text-[15px]">{s.d}</span>
              </span>
            </li>
          ))}
        </ol>
        <Link href="/rules" className="inline-block mt-3 text-blue font-medium hover:underline">
          Read the fair-play rules
        </Link>
      </section>
    </div>
  );
}
