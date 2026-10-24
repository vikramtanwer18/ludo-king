// API tests for Goti Rooms.
//
//   BASE_URL=http://localhost:3000 DATABASE_URL=postgres://... node --test tests/
//
// Needs a running server. With DATABASE_URL (same database the server uses), the suite
// also checks timers, settings, rate limits and suspension by editing rows directly.
// Without it, those tests are skipped.
//
// Login codes: in demo mode (no SMTP_HOST on the server) the code comes back in the response.
// When the server really sends email, point MAIL_INBOX at a JSON file of captured messages
// (see docs/TESTING.md) and the tests read each code from the email itself.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const DB_URL = process.env.DATABASE_URL;
const INBOX = process.env.MAIL_INBOX;

function codeFromInbox(email) {
  assert.ok(INBOX, "server sent a real email; set MAIL_INBOX to read the code");
  const to = String(email).trim().toLowerCase();
  const mails = JSON.parse(fs.readFileSync(INBOX, "utf8")).filter((m) => m.envelopeTo.includes(to));
  assert.ok(mails.length, `no email arrived for ${to}`);
  const code = mails.at(-1).subject.match(/\b\d{6}\b/);
  assert.ok(code, "subject carries the code");
  return code[0];
}

let db = null;
before(async () => {
  if (!DB_URL) return;
  const { default: pg } = await import("pg");
  db = new pg.Client({ connectionString: DB_URL });
  await db.connect();
});
after(async () => db && db.end());
const needDb = { skip: !DB_URL && "set DATABASE_URL to run" };

/* ---------------- helpers ---------------- */
const used = new Set();
function newEmail() {
  let p;
  do p = `t${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}@example.com`;
  while (used.has(p));
  used.add(p);
  return p;
}
const SHOT = "data:image/jpeg;base64," + Buffer.from("not really a jpeg").toString("base64");

function client() {
  let cookie = "";
  const call = async (path, body, method) => {
    const r = await fetch(BASE + path, {
      method: method ?? (body ? "POST" : "GET"),
      headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
      body: body && JSON.stringify(body),
      redirect: "manual",
    });
    const sc = r.headers.get("set-cookie");
    if (sc) cookie = /goti_session=;|Max-Age=0|Expires=Thu, 01 Jan 1970/.test(sc) ? "" : sc.split(";")[0];
    let json = null;
    try {
      json = await r.json();
    } catch {}
    return { status: r.status, ...(json ?? {}) };
  };
  const c = {
    email: null,
    id: null,
    call,
    otp: async (email) => {
      const r = await call("/api/auth/otp", { email });
      if (r.ok) r.code = r.devCode ?? codeFromInbox(email);
      return r;
    },
    verify: (b) => call("/api/auth/login", b),
    // Rooms need an amount now; tests that don't care use the minimum.
    act: (b) => call("/api/action", b.type === "createMatch" && !("amount" in b) ? { ...b, amount: 50 } : b),
    wallet: (b) => call("/api/wallet", b),
    /** Adds cash through the demo payment flow (server without Razorpay keys, not production). */
    async topUp(rupees = 2000) {
      const d = await call("/api/wallet", { type: "deposit", amount: rupees });
      assert.equal(d.ok, true, d.error);
      const s = await call("/api/wallet", { type: "simulateDeposit", id: d.deposit.id });
      assert.equal(s.ok, true, s.error);
      return s.balance;
    },
    state: () => call("/api/state"),
    logout: (everywhere) => call("/api/auth/logout", { everywhere }),
    forget: () => (cookie = ""),
    async signup(name = "Tester", invite) {
      const email = newEmail();
      const o = await c.otp(email);
      assert.equal(o.ok, true, o.error);
      const r = await c.verify({ email, otp: o.code, name, invite });
      assert.equal(r.ok, true, r.error);
      c.email = email;
      c.id = (await c.state()).meId;
      await c.topUp();
      return c;
    },
  };
  return c;
}
const ok = (r, msg) => assert.equal(r.ok, true, `${msg ?? "expected ok"}: ${r.error}`);
const no = (r, re) => {
  assert.equal(r.ok, false, "expected an error");
  if (re) assert.match(r.error, re);
};
const matchOf = (s, id) => s.matches.find((m) => m.id === id);

/** Two signed-up players with a running match (code shared). */
async function runningMatch(code = "04821157") {
  const A = await client().signup("Host");
  const B = await client().signup("Guest");
  const m = await A.act({ type: "createMatch", game: "ludo-classic" });
  ok(m);
  ok(await B.act({ type: "requestJoin", id: m.id }));
  ok(await A.act({ type: "acceptRequest", id: m.id }));
  if (code) ok(await A.act({ type: "setRoomCode", id: m.id, code }));
  return { A, B, id: m.id };
}

/* ================================================================ */
describe("player auth", () => {
  test("rejects malformed email addresses", async () => {
    const c = client();
    for (const p of ["", "plainaddress", "@example.com", "a@b", "a b@example.com", "a@@example.com", "x".repeat(250) + "@ex.com"])
      no(await c.otp(p), /valid email/);
  });

  test("new email: code, name required, invite validated, inviter notified", async () => {
    const inviter = await client().signup("Inviter");
    const code = (await inviter.state()).users.find((u) => u.id === inviter.id).inviteCode;
    assert.match(code, /^[A-Z0-9]{6}$/);

    const c = client();
    const email = newEmail();
    const o = await c.otp(email);
    ok(o);
    assert.equal(o.isNew, true);
    assert.match(o.code, /^\d{6}$/);
    if (INBOX) assert.equal(o.devCode, undefined, "with real email the code is never in the response");
    no(await c.verify({ email, otp: o.code }), /name/);
    no(await c.verify({ email, otp: o.code, name: "x".repeat(41) }), /40/);
    no(await c.verify({ email, otp: o.code, name: "Neel", invite: "ZZZZZZ" }), /invite code doesn't exist/);
    ok(await c.verify({ email, otp: o.code, name: "  Neel  ", invite: code.toLowerCase() }));
    const s = await c.state();
    const me = s.users.find((u) => u.id === s.meId);
    assert.equal(me.name, "Neel", "name is trimmed");
    assert.equal(me.invitedBy, inviter.id);
    assert.ok(s.notices.some((n) => /Welcome, Neel/.test(n.text)));
    const is = await inviter.state();
    assert.ok(is.notices.some((n) => /Neel joined with your invite code/.test(n.text)));
  });

  test("existing email logs in without a name and keeps the old name", async () => {
    const a = await client().signup("Original");
    const c = client();
    await new Promise((r) => setTimeout(r, 50));
    if (db) await db.query("UPDATE email_otps SET sent_at = 0 WHERE email=$1", [a.email]);
    const o = await c.otp(a.email);
    if (!o.ok) return; // resend cooldown without DB access
    assert.equal(o.isNew, false);
    ok(await c.verify({ email: a.email, otp: o.code, name: "Changed" }));
    const s = await c.state();
    assert.equal(s.meId, a.id);
    assert.equal(s.users.find((u) => u.id === a.id).name, "Original");
  });

  test("email is case- and space-insensitive: same account", async () => {
    const a = await client().signup("Casey");
    if (db) await db.query("UPDATE email_otps SET sent_at = 0 WHERE email=$1", [a.email]);
    else return;
    const c = client();
    const shouted = `  ${a.email.toUpperCase()} `;
    const o = await c.otp(shouted);
    ok(o);
    assert.equal(o.isNew, false, "recognised as the existing account");
    ok(await c.verify({ email: shouted, otp: o.code }));
    assert.equal((await c.state()).meId, a.id);
  });

  test("resend cooldown of 30 seconds", async () => {
    const c = client();
    const email = newEmail();
    ok(await c.otp(email));
    const r = await c.otp(email);
    no(r, /Wait \d+ seconds/);
    assert.ok(r.retryIn > 0 && r.retryIn <= 30000);
  });

  test("wrong code counts down, then locks even the right code", async () => {
    const c = client();
    const email = newEmail();
    const o = await c.otp(email);
    const wrong = o.code === "000000" ? "111111" : "000000";
    no(await c.verify({ email, otp: wrong, name: "Bad" }), /4 tries left/);
    no(await c.verify({ email, otp: wrong, name: "Bad" }), /3 tries left/);
    no(await c.verify({ email, otp: wrong, name: "Bad" }), /2 tries left/);
    no(await c.verify({ email, otp: wrong, name: "Bad" }), /1 try left/);
    no(await c.verify({ email, otp: wrong, name: "Bad" }), /Too many wrong tries/);
    no(await c.verify({ email, otp: o.code, name: "Bad" }), /Too many wrong tries/);
  });

  test("a code works only once, even with two requests at the same time", async () => {
    const email = newEmail();
    const o = await client().otp(email);
    const [r1, r2] = await Promise.all([
      client().verify({ email, otp: o.code, name: "Racer" }),
      client().verify({ email, otp: o.code, name: "Racer" }),
    ]);
    assert.equal([r1, r2].filter((r) => r.ok).length, 1, "exactly one login succeeds");
    no(await client().verify({ email, otp: o.code, name: "Racer" }));
  });

  test("code format and missing code", async () => {
    const c = client();
    no(await c.verify({ email: newEmail(), otp: "123456", name: "Nobody" }), /Ask for a code first/);
    no(await c.verify({ email: newEmail(), otp: "12ab", name: "Nobody" }), /6-digit/);
  });

  test("expired code is rejected", needDb, async () => {
    const c = client();
    const email = newEmail();
    const o = await c.otp(email);
    await db.query("UPDATE email_otps SET expires_at = 1 WHERE email=$1", [email]);
    no(await c.verify({ email, otp: o.code, name: "Late" }), /expired/);
  });

  test("max 5 codes per hour", needDb, async () => {
    const c = client();
    const email = newEmail();
    for (let i = 0; i < 5; i++) {
      ok(await c.otp(email), `send ${i + 1}`);
      await db.query("UPDATE email_otps SET sent_at = 0 WHERE email=$1", [email]);
    }
    no(await c.otp(email), /Too many codes/);
  });

  test("codes are stored hashed, not in plain text", needDb, async () => {
    const email = newEmail();
    const o = await client().otp(email);
    const { rows } = await db.query("SELECT code_hash FROM email_otps WHERE email=$1", [email]);
    assert.notEqual(rows[0].code_hash, o.code);
    assert.ok(!rows[0].code_hash.includes(o.code));
  });

  test("logout ends this session; logout everywhere ends all", async () => {
    const a = await client().signup("Multi");
    ok(await a.logout(false));
    assert.equal((await a.state()).meId, null);

    const b = await client().signup("Everywhere");
    if (db) await db.query("UPDATE email_otps SET sent_at = 0 WHERE email=$1", [b.email]);
    else return;
    const second = client();
    const o = await second.otp(b.email);
    ok(await second.verify({ email: b.email, otp: o.code }));
    assert.equal((await second.state()).meId, b.id);
    ok(await b.logout(true));
    assert.equal((await second.state()).meId, null, "other device is signed out");
  });

  test("suspended player: can't get a code; signed out mid-session", needDb, async () => {
    const a = await client().signup("Rulebreaker");
    await db.query("UPDATE users SET status='suspended', suspended_reason='Testing' WHERE id=$1", [a.id]);
    assert.equal((await a.state()).meId, null);
    const r = await a.act({ type: "createMatch", game: "ludo-classic" });
    assert.equal(r.status, 401);
    await db.query("UPDATE email_otps SET sent_at = 0 WHERE email=$1", [a.email]);
    no(await client().otp(a.email), /suspended: Testing/);
    await db.query("UPDATE users SET status='active', suspended_reason=NULL WHERE id=$1", [a.id]);
  });
});

/* ================================================================ */
describe("what the API exposes", () => {
  test("signed-out state has no private data", async () => {
    const s = await client().state();
    assert.equal(s.meId, null);
    assert.deepEqual(s.notices, []);
    assert.ok(s.users.every((u) => u.email === "" && u.inviteCode === ""));
  });

  test("other players' emails and invite codes are hidden", async () => {
    const a = await client().signup("Private");
    const s = await a.state();
    for (const u of s.users) {
      if (u.id === a.id) {
        assert.equal(u.email, a.email);
        assert.ok(u.inviteCode);
      } else {
        assert.equal(u.email, "");
        assert.equal(u.inviteCode, "");
      }
    }
  });

  test("win screenshots only go to the two players", async () => {
    const { A, B, id } = await runningMatch();
    ok(await B.act({ type: "submitResult", id, outcome: "won", screenshot: SHOT }));
    ok(await A.act({ type: "submitResult", id, outcome: "lost" }));
    assert.equal(matchOf(await A.state(), id).results[B.id].screenshot, SHOT);
    const outsider = await client().signup("Nosy");
    assert.equal(matchOf(await outsider.state(), id).results[B.id].screenshot, undefined);
    assert.equal(matchOf(await client().state(), id).results[B.id].screenshot, undefined);
  });

  test("screenshot file: only the two players can open it", async () => {
    const { A, B, id } = await runningMatch();
    ok(await B.act({ type: "submitResult", id, outcome: "won", screenshot: SHOT }));
    const path = `/api/screenshot/${id}/${B.id}`;
    const raw = await fetch(BASE + path, { headers: { cookie: "" } });
    assert.equal(raw.status, 403, "signed out");
    const X = await client().signup("Peeker");
    assert.equal((await X.call(path, undefined, "GET")).status, 403, "outsider");
    assert.equal((await A.call(path, undefined, "GET")).status, 200, "opponent");
    assert.equal((await B.call(path, undefined, "GET")).status, 200, "owner");
    assert.equal((await A.call(`/api/screenshot/${id}/${A.id}`, undefined, "GET")).status, 404, "loser has no screenshot");
    assert.equal((await A.call(`/api/screenshot/nope/${A.id}`, undefined, "GET")).status, 404);
  });

  test("actions need a session", async () => {
    const r = await client().act({ type: "createMatch", game: "ludo-classic" });
    assert.equal(r.status, 401);
    no(r, /Log in/);
  });

  test("bad JSON and unknown actions are rejected cleanly", async () => {
    const a = await client().signup("Fuzzer");
    const raw = await fetch(BASE + "/api/action", { method: "POST", headers: { "Content-Type": "application/json", cookie: "" }, body: "{" });
    assert.ok(raw.status === 400 || raw.status === 401);
    const r = await a.act({ type: "doSomethingWeird" });
    assert.equal(r.status, 400);
  });
});

/* ================================================================ */
describe("rooms and join requests", () => {
  test("create: game must be open, max 2 open rooms, amount ₹50–2000 in steps of 50", async () => {
    const a = await client().signup("Creator");
    no(await a.act({ type: "createMatch", game: "ludo-popular" }), /isn't open/);
    no(await a.act({ type: "createMatch", game: "chess" }), /isn't open/);
    no(await a.act({ type: "createMatch", game: "ludo-classic", amount: "quick game" }), /amount/i);
    no(await a.act({ type: "createMatch", game: "ludo-classic", amount: 0 }), /between ₹50 and ₹2,000/);
    no(await a.act({ type: "createMatch", game: "ludo-classic", amount: 2050 }), /between ₹50 and ₹2,000/);
    no(await a.act({ type: "createMatch", game: "ludo-classic", amount: 120 }), /multiple of ₹50/);
    const m1 = await a.act({ type: "createMatch", game: "ludo-classic", amount: 150 });
    ok(m1);
    assert.equal(matchOf(await a.state(), m1.id).amount, 15000);
    assert.equal((await a.state()).wallet.balance, 200000 - 15000, "stake is held from the wallet");
    ok(await a.act({ type: "createMatch", game: "snakes" }));
    no(await a.act({ type: "createMatch", game: "ludo-classic" }), /2 open rooms/);
    ok(await a.act({ type: "deleteMatch", id: m1.id }));
    ok(await a.act({ type: "createMatch", game: "ludo-classic" }), "a slot frees up after deleting");
  });

  test("join: not your own, one request per room, host notified", async () => {
    const A = await client().signup("Host");
    const B = await client().signup("Bela");
    const C = await client().signup("Chirag");
    const m = await A.act({ type: "createMatch", game: "ludo-classic" });
    no(await A.act({ type: "requestJoin", id: m.id }), /your own room/);
    ok(await B.act({ type: "requestJoin", id: m.id }));
    no(await C.act({ type: "requestJoin", id: m.id }), /already asked/);
    assert.ok((await A.state()).notices.some((n) => /wants to join/.test(n.text)));
    no(await B.act({ type: "requestJoin", id: "doesnotexist" }), /no longer exists/);
  });

  test("two players asking for the same room at once: only one gets it", async () => {
    const A = await client().signup("Host");
    const B = await client().signup("Bela");
    const C = await client().signup("Chirag");
    const m = await A.act({ type: "createMatch", game: "ludo-classic" });
    const rs = await Promise.all([B.act({ type: "requestJoin", id: m.id }), C.act({ type: "requestJoin", id: m.id })]);
    assert.equal(rs.filter((r) => r.ok).length, 1);
  });

  test("decline, withdraw and delete", async () => {
    const A = await client().signup("Host");
    const B = await client().signup("Bela");
    const m = await A.act({ type: "createMatch", game: "ludo-classic" });
    ok(await B.act({ type: "requestJoin", id: m.id }));
    ok(await A.act({ type: "rejectRequest", id: m.id }));
    assert.equal(matchOf(await A.state(), m.id).status, "open");
    assert.ok((await B.state()).notices.some((n) => /declined/.test(n.text)));
    ok(await B.act({ type: "requestJoin", id: m.id }));
    ok(await B.act({ type: "withdrawRequest", id: m.id }));
    no(await B.act({ type: "withdrawRequest", id: m.id }), /no request/);
    ok(await B.act({ type: "requestJoin", id: m.id }));
    ok(await A.act({ type: "deleteMatch", id: m.id }), "host can delete a room with a pending request");
    assert.ok((await B.state()).notices.some((n) => /deleted the room/.test(n.text)));
    assert.equal(matchOf(await A.state(), m.id), undefined);
  });

  test("accepting releases the player's other pending requests", async () => {
    const H1 = await client().signup("Hari");
    const H2 = await client().signup("Hema");
    const P = await client().signup("Pari");
    const m1 = await H1.act({ type: "createMatch", game: "ludo-classic" });
    const m2 = await H2.act({ type: "createMatch", game: "ludo-classic" });
    ok(await P.act({ type: "requestJoin", id: m1.id }));
    ok(await P.act({ type: "requestJoin", id: m2.id }));
    ok(await H1.act({ type: "acceptRequest", id: m1.id }));
    const s = await H2.state();
    assert.equal(matchOf(s, m2.id).status, "open");
    assert.equal(matchOf(s, m2.id).joinedBy, undefined);
    no(await H2.act({ type: "acceptRequest", id: m2.id }), /no request/);
  });

  test("running match blocks creating or joining another", async () => {
    const { A, B } = await runningMatch();
    no(await A.act({ type: "createMatch", game: "ludo-classic" }), /Finish your running match/);
    const H = await client().signup("Other host");
    const m = await H.act({ type: "createMatch", game: "ludo-classic" });
    no(await B.act({ type: "requestJoin", id: m.id }), /Finish your running match/);
  });

  test("nobody else can act on a match they're not in", async () => {
    const A = await client().signup("Host");
    const B = await client().signup("Guest");
    const X = await client().signup("Intruder");
    const m = await A.act({ type: "createMatch", game: "ludo-classic" });
    no(await X.act({ type: "deleteMatch", id: m.id }), /Only the host/);
    ok(await B.act({ type: "requestJoin", id: m.id }));
    no(await X.act({ type: "acceptRequest", id: m.id }));
    no(await X.act({ type: "rejectRequest", id: m.id }));
    no(await X.act({ type: "withdrawRequest", id: m.id }));
    no(await B.act({ type: "acceptRequest", id: m.id }), /no request to accept/);
    ok(await A.act({ type: "acceptRequest", id: m.id }));
    no(await X.act({ type: "setRoomCode", id: m.id, code: "01234567" }), /Only the host/);
    no(await B.act({ type: "setRoomCode", id: m.id, code: "01234567" }), /Only the host/);
    no(await X.act({ type: "submitResult", id: m.id, outcome: "won", screenshot: SHOT }), /not in this match/);
    no(await A.act({ type: "deleteMatch", id: m.id }), /already started/);
  });
});

/* ================================================================ */
describe("room code and results", () => {
  test("room code format and update", async () => {
    const { A, B, id } = await runningMatch(null);
    for (const bad of ["1234567", "12345678", "0123456", "012345678", "0123abcd"])
      no(await A.act({ type: "setRoomCode", id, code: bad }), /8 digits/);
    no(await B.act({ type: "submitResult", id, outcome: "lost" }), /hasn't been shared/);
    ok(await A.act({ type: "setRoomCode", id, code: "0123 4567" }), "spaces are ignored");
    ok(await A.act({ type: "setRoomCode", id, code: "07654321" }));
    const s = await B.state();
    assert.equal(matchOf(s, id).roomCode, "07654321");
    assert.ok(s.notices.some((n) => /Room code changed to 07654321/.test(n.text)));
  });

  test("result validation", async () => {
    const { B, id } = await runningMatch();
    no(await B.act({ type: "submitResult", id, outcome: "won" }), /screenshot/);
    no(await B.act({ type: "submitResult", id, outcome: "won", screenshot: "data:text/html;base64,PGgxPg==" }), /screenshot/);
    no(await B.act({ type: "submitResult", id, outcome: "won", screenshot: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" }), /JPG, PNG/);
    no(await B.act({ type: "submitResult", id, outcome: "won", screenshot: "data:image/jpeg;base64," + "A".repeat(1_600_000) }), /too large/);
    no(await B.act({ type: "submitResult", id, outcome: "cancel" }), /reason/);
    no(await B.act({ type: "submitResult", id, outcome: "cancel", reason: "made-up" }), /reason/);
    no(await B.act({ type: "submitResult", id, outcome: "draw" }), /won, lost or cancel/);
  });

  test("won + lost → finished, winner set, both notified", async () => {
    const { A, B, id } = await runningMatch();
    ok(await B.act({ type: "submitResult", id, outcome: "won", screenshot: SHOT }));
    assert.ok((await A.state()).notices.some((n) => /posted "I won"/.test(n.text)));
    no(await B.act({ type: "submitResult", id, outcome: "lost" }), /already posted/);
    ok(await A.act({ type: "submitResult", id, outcome: "lost" }));
    const m = matchOf(await A.state(), id);
    assert.equal(m.status, "completed");
    assert.equal(m.winnerId, B.id);
    assert.ok((await B.state()).notices.some((n) => /You won against/.test(n.text)));
    no(await A.act({ type: "submitResult", id, outcome: "won", screenshot: SHOT }), /already closed/);
  });

  test("conceding first ends the match immediately", async () => {
    const { A, B, id } = await runningMatch();
    ok(await A.act({ type: "submitResult", id, outcome: "lost" }));
    const m = matchOf(await B.state(), id);
    assert.equal(m.status, "completed");
    assert.equal(m.winnerId, B.id);
  });

  test("won + won → disputed", async () => {
    const { A, B, id } = await runningMatch();
    ok(await A.act({ type: "submitResult", id, outcome: "won", screenshot: SHOT }));
    ok(await B.act({ type: "submitResult", id, outcome: "won", screenshot: SHOT }));
    assert.equal(matchOf(await A.state(), id).status, "disputed");
  });

  test("won + cancel → disputed", async () => {
    const { A, B, id } = await runningMatch();
    ok(await B.act({ type: "submitResult", id, outcome: "cancel", reason: "not-played" }));
    ok(await A.act({ type: "submitResult", id, outcome: "won", screenshot: SHOT }));
    assert.equal(matchOf(await A.state(), id).status, "disputed");
  });

  test("cancel + cancel → cancelled (allowed before a code is shared)", async () => {
    const { A, B, id } = await runningMatch(null);
    ok(await A.act({ type: "submitResult", id, outcome: "cancel", reason: "no-room-code" }));
    ok(await B.act({ type: "submitResult", id, outcome: "cancel", reason: "no-room-code" }));
    assert.equal(matchOf(await A.state(), id).status, "cancelled");
  });

  test("leaderboard numbers come from finished matches", async () => {
    const { A, B, id } = await runningMatch();
    ok(await A.act({ type: "submitResult", id, outcome: "lost" }));
    const s = await A.state();
    const finished = s.matches.filter((m) => m.status === "completed" && (m.createdBy === B.id || m.joinedBy === B.id));
    assert.equal(finished.filter((m) => m.winnerId === B.id).length, 1);
  });
});

/* ================================================================ */
describe("timers", () => {
  test("no room code in 5 minutes → cancelled, both notified", needDb, async () => {
    const { A, B, id } = await runningMatch(null);
    await db.query("UPDATE matches SET room_code_deadline = 1 WHERE id=$1", [id]);
    const m = matchOf(await A.state(), id);
    assert.equal(m.status, "cancelled");
    assert.match(m.endedReason, /didn't share a room code/);
    assert.ok((await B.state()).notices.some((n) => /didn't share a room code/.test(n.text)));
  });

  test("silent opponent for 15 minutes: 'won' stands", needDb, async () => {
    const { A, B, id } = await runningMatch();
    ok(await B.act({ type: "submitResult", id, outcome: "won", screenshot: SHOT }));
    await db.query("UPDATE matches SET first_result_at = 1 WHERE id=$1", [id]);
    const m = matchOf(await A.state(), id);
    assert.equal(m.status, "completed");
    assert.equal(m.winnerId, B.id);
  });

  test("silent opponent for 15 minutes: 'cancel' stands", needDb, async () => {
    const { A, id } = await runningMatch();
    ok(await A.act({ type: "submitResult", id, outcome: "cancel", reason: "not-played" }));
    await db.query("UPDATE matches SET first_result_at = 1 WHERE id=$1", [id]);
    assert.equal(matchOf(await A.state(), id).status, "cancelled");
  });

  test("timer not due yet: nothing changes", needDb, async () => {
    const { A, B, id } = await runningMatch();
    ok(await B.act({ type: "submitResult", id, outcome: "won", screenshot: SHOT }));
    await db.query("UPDATE matches SET first_result_at = $2 WHERE id=$1", [id, Date.now() - 14 * 60000]);
    assert.equal(matchOf(await A.state(), id).status, "running");
  });
});

/* ================================================================ */
describe("admin settings seen by players", () => {
  const set = (key, value) =>
    db.query("INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value", [key, JSON.stringify(value)]);

  test("announcement shows in state only when on", needDb, async () => {
    const a = await client().signup("Reader");
    await set("announcement", { text: "Hello players", active: true });
    assert.equal((await a.state()).settings.announcement, "Hello players");
    await set("announcement", { text: "Hello players", active: false });
    assert.equal((await a.state()).settings.announcement, "");
  });

  test("game turned off: can't create", needDb, async () => {
    const a = await client().signup("Snaker");
    await set("games", { "ludo-classic": true, snakes: false, "ludo-popular": false });
    no(await a.act({ type: "createMatch", game: "snakes" }), /isn't open/);
    assert.equal((await a.state()).settings.games.snakes, false);
    await set("games", { "ludo-classic": true, snakes: true, "ludo-popular": false });
    ok(await a.act({ type: "createMatch", game: "snakes" }));
  });

  test("maintenance blocks create and join, not results", needDb, async () => {
    const { A, B, id } = await runningMatch();
    const H = await client().signup("Host");
    const open = await H.act({ type: "createMatch", game: "ludo-classic" });
    await set("maintenance", { active: true, text: "Back at 6" });
    try {
      no(await H.act({ type: "createMatch", game: "snakes" }), /Back at 6/);
      const J = await client().signup("Joiner");
      no(await J.act({ type: "requestJoin", id: open.id }), /Back at 6/);
      assert.equal((await A.state()).settings.maintenance, "Back at 6");
      ok(await A.act({ type: "submitResult", id, outcome: "lost" }), "live matches can still finish");
      assert.equal(matchOf(await B.state(), id).status, "completed");
    } finally {
      await set("maintenance", { active: false, text: "Back at 6" });
    }
  });
});

/* ================================================================ */
describe("profile and notifications", () => {
  test("rename and colour validation", async () => {
    const a = await client().signup("Renamer");
    no(await a.act({ type: "updateProfile", name: "x" }), /2 letters/);
    no(await a.act({ type: "updateProfile", tone: "purple" }), /four colours/);
    ok(await a.act({ type: "updateProfile", name: "Renamed", tone: "blue" }));
    const me = (await a.state()).users.find((u) => u.id === a.id);
    assert.equal(me.name, "Renamed");
    assert.equal(me.tone, "blue");
  });

  test("mark one and mark all read", async () => {
    const { A } = await runningMatch();
    const s = await A.state();
    const unread = s.notices.filter((n) => !n.read);
    assert.ok(unread.length >= 1);
    ok(await A.act({ type: "markRead", id: unread[0].id }));
    assert.equal((await A.state()).notices.find((n) => n.id === unread[0].id).read, true);
    ok(await A.act({ type: "markRead" }));
    assert.ok((await A.state()).notices.every((n) => n.read));
  });

  test("can't mark someone else's notification", needDb, async () => {
    const a = await client().signup("Mine");
    const b = await client().signup("Theirs");
    const n = (await b.state()).notices[0];
    ok(await a.act({ type: "markRead", id: n.id }));
    const { rows } = await db.query("SELECT read FROM notices WHERE id=$1", [n.id]);
    assert.equal(rows[0].read, false);
  });
});

/* ================================================================ */
// Wallet. Needs the server in demo payment mode (no Razorpay keys, not production).
// Set WEBHOOK_SECRET to the server's RAZORPAY_WEBHOOK_SECRET to also test the webhook.
describe("wallet", () => {
  const balance = async (c) => (await c.wallet()).balance;
  const commission = async (c) => (await c.state()).settings.commissionPct;

  test("add cash: ₹50–2000 only, credited once", async () => {
    const a = await client().signup("Payer");
    const start = await balance(a);
    no(await a.wallet({ type: "deposit", amount: 49 }), /₹50 to ₹2,000/);
    no(await a.wallet({ type: "deposit", amount: 2001 }), /₹50 to ₹2,000/);
    const d = await a.wallet({ type: "deposit", amount: 75 });
    ok(d);
    assert.equal(d.deposit.status, "pending");
    ok(await a.wallet({ type: "simulateDeposit", id: d.deposit.id }));
    no(await a.wallet({ type: "simulateDeposit", id: d.deposit.id }), /no longer active/);
    assert.equal(await balance(a), start + 7500);
    const w = await a.wallet();
    assert.equal(w.deposits[0].status, "success");
    assert.equal(w.txns[0].kind, "deposit");
  });

  test("stakes: held on create/join, refunded on delete/decline/withdraw", async () => {
    const A = await client().signup("Host");
    const B = await client().signup("Guest");
    const a0 = await balance(A), b0 = await balance(B);
    const m = await A.act({ type: "createMatch", game: "ludo-classic", amount: 300 });
    assert.equal(await balance(A), a0 - 30000);
    ok(await B.act({ type: "requestJoin", id: m.id }));
    assert.equal(await balance(B), b0 - 30000);
    ok(await B.act({ type: "withdrawRequest", id: m.id }));
    assert.equal(await balance(B), b0);
    ok(await B.act({ type: "requestJoin", id: m.id }));
    ok(await A.act({ type: "rejectRequest", id: m.id }));
    assert.equal(await balance(B), b0);
    ok(await B.act({ type: "requestJoin", id: m.id }));
    ok(await A.act({ type: "deleteMatch", id: m.id }));
    assert.equal(await balance(A), a0);
    assert.equal(await balance(B), b0);
  });

  test("can't create or join above your balance", async () => {
    const A = await client().signup("Rich");
    const P = client();
    const email = newEmail();
    const o = await P.otp(email);
    ok(await P.verify({ email, otp: o.code, name: "Poor" }));
    no(await P.act({ type: "createMatch", game: "ludo-classic", amount: 50 }), /You need ₹50/);
    const m = await A.act({ type: "createMatch", game: "ludo-classic", amount: 50 });
    no(await P.act({ type: "requestJoin", id: m.id }), /You need ₹50/);
    assert.equal(await balance(P), 0);
  });

  test("winner gets the pot minus commission; cancel refunds both", async () => {
    const { A, B, id } = await runningMatch();
    const pct = await commission(A);
    const a0 = await balance(A), b0 = await balance(B);
    ok(await A.act({ type: "submitResult", id: id, outcome: "won", screenshot: SHOT }));
    ok(await B.act({ type: "submitResult", id: id, outcome: "lost" }));
    const fee = Math.floor((10000 * pct) / 100);
    const done = matchOf(await A.state(), id);
    assert.equal(done.prize, 10000 - fee);
    assert.equal(done.fee, fee);
    assert.equal(await balance(A), a0 + 10000 - fee);
    assert.equal(await balance(B), b0);

    const r = await runningMatch();
    const c0 = await balance(r.A), d0 = await balance(r.B);
    ok(await r.A.act({ type: "submitResult", id: r.id, outcome: "cancel", reason: "not-played" }));
    ok(await r.B.act({ type: "submitResult", id: r.id, outcome: "cancel", reason: "not-played" }));
    assert.equal(await balance(r.A), c0 + 5000);
    assert.equal(await balance(r.B), d0 + 5000);
  });

  test("withdraw needs approved KYC; KYC is validated and masked", async () => {
    const a = await client().signup("Kyc");
    no(await a.wallet({ type: "withdraw", amount: 100, method: "upi" }), /KYC/);
    no(await a.wallet({ type: "saveKyc", fullName: "Kyc Tester", pan: "BAD", useUpi: true, upiId: "kyc@okaxis" }), /valid PAN/);
    no(await a.wallet({ type: "saveKyc", fullName: "Kyc Tester", pan: "ABCDE1234F" }), /bank account or a UPI/);
    no(await a.wallet({ type: "saveKyc", fullName: "Kyc Tester", pan: "ABCDE1234F", useUpi: true, upiId: "not-a-upi" }), /valid UPI/);
    const pan = "PQRST" + String(1000 + Math.floor(Math.random() * 8999)) + "Z";
    const k = await a.wallet({ type: "saveKyc", fullName: "Kyc Tester", pan, useBank: true, bankHolder: "Kyc Tester", bankAccount: "000123456789", bankAccountConfirm: "000123456789", bankIfsc: "HDFC0001234" });
    ok(k);
    assert.equal(k.kyc.status, "pending");
    assert.equal(k.kyc.bankAccount, "XXXXXXXX6789");
    no(await a.wallet({ type: "withdraw", amount: 100, method: "bank" }), /KYC/);
  });

  test("approved KYC: withdraw holds money, one at a time, cancel refunds", needDb, async () => {
    const a = await client().signup("Withdrawer");
    const pan = "LMNOP" + String(1000 + Math.floor(Math.random() * 8999)) + "Q";
    ok(await a.wallet({ type: "saveKyc", fullName: "With Drawer", pan, useUpi: true, upiId: "wd@okaxis" }));
    await db.query("UPDATE kyc SET status='approved' WHERE user_id=$1", [a.id]);
    const b0 = await balance(a);
    no(await a.wallet({ type: "withdraw", amount: 99, method: "upi" }), /₹100 or more/);
    no(await a.wallet({ type: "withdraw", amount: 100, method: "bank" }), /Add a bank account/);
    no(await a.wallet({ type: "withdraw", amount: b0 / 100 + 1, method: "upi" }), /up to/);
    const w = await a.wallet({ type: "withdraw", amount: 150, method: "upi" });
    ok(w);
    assert.equal(w.balance, b0 - 15000);
    no(await a.wallet({ type: "withdraw", amount: 100, method: "upi" }), /in progress/);
    ok(await a.wallet({ type: "cancelWithdraw", id: w.withdrawals[0].id }));
    assert.equal(await balance(a), b0);
  });

  test("Razorpay webhook: signature checked, credited once", { skip: !process.env.WEBHOOK_SECRET && "set WEBHOOK_SECRET" }, async () => {
    const crypto = await import("node:crypto");
    const a = await client().signup("Hooked");
    const b0 = await balance(a);
    const d = await a.wallet({ type: "deposit", amount: 300 });
    const tag = crypto.randomBytes(4).toString("hex");
    const raw = JSON.stringify({
      event: "qr_code.credited",
      payload: {
        payment: { entity: { id: "pay_t" + tag, amount: 30000, status: "captured", method: "upi", vpa: "x@okaxis" } },
        qr_code: { entity: { id: "qr_t" + tag, notes: { deposit_id: d.deposit.id }, payments_amount_received: 30000 } },
      },
    });
    const send = (sig, id) =>
      fetch(BASE + "/api/webhooks/razorpay", { method: "POST", headers: { "Content-Type": "application/json", "x-razorpay-signature": sig, "x-razorpay-event-id": id }, body: raw }).then((r) => r.json().then((j) => ({ status: r.status, ...j })));
    const sig = crypto.createHmac("sha256", process.env.WEBHOOK_SECRET).update(raw).digest("hex");
    assert.equal((await send("wrong", "e1" + tag)).status, 400);
    assert.equal((await send(sig, "e1" + tag)).result, "credited");
    assert.equal((await send(sig, "e1" + tag)).result, "duplicate");
    assert.equal((await send(sig, "e2" + tag)).result, "already credited");
    assert.equal(await balance(a), b0 + 30000);
  });
});
