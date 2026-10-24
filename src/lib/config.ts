export const APP = {
  name: "Goti Rooms",
  tagline: "Ludo with your friends, one room code at a time.",
  supportWhatsApp: "910000000000",
  supportEmail: "help@example.com",
  supportTelegram: "https://t.me/example",
  demoOtp: "123456",
};

export type GameSlug = "ludo-classic" | "snakes" | "ludo-popular";

export const GAMES: {
  slug: GameSlug;
  name: string;
  blurb: string;
  live: boolean;
  tone: "red" | "green" | "yellow" | "blue";
  /** Card art in /public/games, saved at 640 and 1280 px wide (16:9). Decorative: the card text names the game. */
  image: string;
}[] = [
  {
    slug: "ludo-classic",
    name: "Ludo Classic",
    blurb: "Two players, four tokens each. First to bring all home wins.",
    live: true,
    tone: "red",
    image: "/games/ludo-classic",
  },
  {
    slug: "snakes",
    name: "Snakes & Ladders",
    blurb: "Roll, climb, slide. First to square 100 wins.",
    live: true,
    tone: "green",
    image: "/games/snakes",
  },
  {
    slug: "ludo-popular",
    name: "Ludo Popular",
    blurb: "Faster rules with a shorter board.",
    live: false,
    tone: "blue",
    image: "/games/coming-soon",
  },
];

export const gameBySlug = (slug: string) => GAMES.find((g) => g.slug === slug);

export const RULES = {
  maxOpenMatches: 2,
  roomCodeMinutes: 5,
  resultMinutes: 15,
  roomCodePattern: /^0\d{7}$/,
};

/** Wallet limits, in rupees. The server checks all of these; the screens only show them. */
export const WALLET = {
  depositMin: 50,
  depositMax: 2000,
  depositChips: [50, 100, 200, 500, 1000, 2000],
  stakeMin: 50,
  stakeMax: 2000,
  stakeStep: 50,
  stakeChips: [50, 100, 200, 500, 1000, 2000],
  withdrawMin: 100,
  qrMinutes: 15,
  defaultCommissionPct: 10,
};

/** Paise → "₹1,250" (or "₹12.50" when there are paise). */
export function inr(paise: number) {
  const r = paise / 100;
  return "₹" + r.toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(r) ? 0 : 2, maximumFractionDigits: 2 });
}

/** What the winner gets for a stake (paise per player) at a commission %. */
export function prizeFor(stakePaise: number, pct: number) {
  const pot = stakePaise * 2;
  const fee = Math.floor((pot * pct) / 100);
  return { pot, fee, prize: pot - fee };
}

export const CANCEL_REASONS: { id: string; label: string }[] = [
  { id: "no-room-code", label: "No room code was shared" },
  { id: "wrong-room-code", label: "Room code didn't work" },
  { id: "not-played", label: "We didn't play" },
  { id: "opponent-left", label: "Opponent left before the game started" },
  { id: "other", label: "Something else" },
];
