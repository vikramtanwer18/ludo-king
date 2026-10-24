import { Mail, MessageCircle, Send } from "lucide-react";
import { APP } from "@/lib/config";

export const metadata = { title: "Help & support" };

const FAQ = [
  { q: "Where do I get the room code?", a: "Open Ludo King, tap Play with friends, then Create. Copy the 8-digit code that starts with 0 and paste it into the match page." },
  { q: "My opponent isn't responding.", a: "If no room code is shared in time, the match cancels on its own. If you've posted a result and they don't post within 15 minutes, your result stands." },
  { q: "We both said we won.", a: "The match goes to review. Message us with the match details and your screenshot or screen recording." },
  { q: "Can I change my result?", a: "No. Results are final once posted, so check before you tap." },
  { q: "How do I delete a room?", a: "Open the lobby or the room page and tap Delete. You can only delete rooms that haven't started." },
];

export default function Support() {
  const topics = ["Match result is wrong", "Opponent didn't join", "Room code problem", "Account or login problem"];
  return (
    <div className="space-y-6">
      <h1 className="text-[30px] font-bold">Help & support</h1>

      <section className="grid sm:grid-cols-3 gap-3">
        <a className="card p-4 flex items-center gap-3 hover:bg-white/70" href={`https://wa.me/${APP.supportWhatsApp}?text=${encodeURIComponent("Hi, I need help with Goti Rooms.")}`} target="_blank" rel="noreferrer">
          <span className="w-10 h-10 rounded-full bg-[#0F7A55] text-white grid place-items-center"><MessageCircle size={20} /></span>
          <span><span className="block font-semibold">WhatsApp</span><span className="text-sm text-muted">Fastest reply</span></span>
        </a>
        <a className="card p-4 flex items-center gap-3 hover:bg-white/70" href={APP.supportTelegram} target="_blank" rel="noreferrer">
          <span className="w-10 h-10 rounded-full bg-[#1677B3] text-white grid place-items-center"><Send size={18} /></span>
          <span><span className="block font-semibold">Telegram</span><span className="text-sm text-muted">Updates and help</span></span>
        </a>
        <a className="card p-4 flex items-center gap-3 hover:bg-white/70" href={`mailto:${APP.supportEmail}`}>
          <span className="w-10 h-10 rounded-full bg-ink text-white grid place-items-center"><Mail size={18} /></span>
          <span><span className="block font-semibold">Email</span><span className="text-sm text-muted">{APP.supportEmail}</span></span>
        </a>
      </section>

      <section className="card p-5">
        <h2 className="text-xl font-semibold mb-3">Message us about</h2>
        <div className="flex flex-wrap gap-2">
          {topics.map((t) => (
            <a key={t} className="rounded-full border border-line px-3 py-1.5 text-[15px] hover:bg-board" href={`https://wa.me/${APP.supportWhatsApp}?text=${encodeURIComponent(t)}`} target="_blank" rel="noreferrer">
              {t}
            </a>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-3">Common questions</h2>
        <div className="card divide-y divide-line">
          {FAQ.map((f) => (
            <details key={f.q} className="group px-4 py-3.5">
              <summary className="font-medium cursor-pointer list-none flex justify-between gap-3">
                {f.q} <span className="text-muted group-open:rotate-180 transition-transform">⌄</span>
              </summary>
              <p className="text-muted mt-2">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
