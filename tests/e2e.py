"""
Browser end-to-end checks for Goti Rooms (player app + admin panel).

    pip install playwright pillow && python -m playwright install chromium
    BASE_URL=http://localhost:3000 ADMIN_EMAIL=... ADMIN_PASSWORD=... python tests/e2e.py

Needs a development server without Resend/Razorpay keys (codes on screen, demo payments),
with demo data: `npm run db:seed` on a fresh database.
Optional: AXE_PATH=path/to/axe.min.js for an accessibility scan, SHOTS_DIR to save screenshots.
"""
import asyncio, io, json, os, re, time, traceback
from playwright.async_api import async_playwright, Page

BASE = os.environ.get("BASE_URL", "http://localhost:3000")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@example.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "change-me-123")
AXE = os.environ.get("AXE_PATH")
SHOTS = os.environ.get("SHOTS_DIR")
# 400s are the API's expected answers to invalid input (tested on purpose); 500s are not ignored.
IGNORE_CONSOLE = re.compile(r"fonts\.g|ERR_TUNNEL|Failed to fetch RSC payload|ERR_CONNECTION|net::ERR_ABORTED|status of 400")

results: list[tuple[str, bool, str]] = []
page_errors: list[str] = []
a11y: dict[str, list[str]] = {}


async def check(name, coro):
    try:
        await coro
        results.append((name, True, ""))
        print(f"PASS  {name}")
    except Exception as e:  # keep going, report at the end
        msg = (str(e).splitlines() or [repr(e)])[0][:220]
        lines = [f.lineno for f in traceback.extract_tb(e.__traceback__) if f.filename.endswith("e2e.py")]
        if lines:
            msg = f"line {lines[-1]}: {msg}"
        results.append((name, False, msg))
        print(f"FAIL  {name}\n      {msg}")


def watch(page: Page, label: str):
    page.on("pageerror", lambda e: page_errors.append(f"{label}: {e}"))
    page.on("console", lambda m: m.type == "error" and not IGNORE_CONSOLE.search(m.text) and page_errors.append(f"{label} console: {m.text[:200]}"))
    page.on("dialog", lambda d: asyncio.ensure_future(d.accept()))


async def shot(page: Page, name: str, full=True):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        await page.screenshot(path=os.path.join(SHOTS, f"{name}.png"), full_page=full)


async def no_overflow(page: Page, label: str):
    w = await page.evaluate("[document.documentElement.scrollWidth, window.innerWidth]")
    assert w[0] <= w[1] + 1, f"{label}: page is {w[0]}px wide on a {w[1]}px screen (sideways scroll)"


async def axe_scan(page: Page, label: str):
    if not AXE:
        return
    await page.add_script_tag(path=AXE)
    res = await page.evaluate("""async () => {
        const r = await axe.run(document, { resultTypes: ['violations'] });
        return r.violations.filter(v => ['serious','critical'].includes(v.impact))
          .map(v => `${v.impact}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target?.join(' ')}`);
    }""")
    if res:
        a11y[label] = res


def png_bytes(text="WIN"):
    from PIL import Image, ImageDraw
    img = Image.new("RGB", (720, 1280), (27, 33, 66))
    d = ImageDraw.Draw(img)
    d.rectangle([80, 400, 640, 800], fill=(255, 255, 255))
    d.text((300, 580), text, fill=(31, 157, 99))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


_email_n = 0
_RUN = format(int(time.time()), "x")


def new_email():
    global _email_n
    _email_n += 1
    return f"e2e{_RUN}n{_email_n}@example.com"


async def code_for(page: Page, email: str) -> str:
    """Wait for the code screen, then take the code from the development box."""
    await page.locator("text=We emailed a 6-digit code to").wait_for(timeout=10000)
    box = page.locator("text=Your code is")
    await box.wait_for(timeout=10000)
    return re.search(r"\d{6}", await box.inner_text()).group(0)


async def player_login(page: Page, name: str, email: str | None = None):
    email = email or new_email()
    await page.goto(f"{BASE}/login")
    await page.fill("#email", email)
    await page.click("button:has-text('Send code')")
    await page.fill("#otp", await code_for(page, email))
    if await page.locator("#name").count():
        await page.fill("#name", name)
    await page.click("form button.btn-primary")
    await page.wait_for_url(f"{BASE}/", timeout=10000)
    return email


async def top_up(page: Page, rupees=500):
    """Adds cash through the development "Simulate payment" flow."""
    ok = await page.evaluate("""async (amount) => {
        const post = (b) => fetch('/api/wallet', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(b)}).then(r => r.json());
        const d = await post({type: 'deposit', amount});
        if (!d.ok) return d.error;
        const s = await post({type: 'simulateDeposit', id: d.deposit.id});
        return s.ok ? true : s.error;
    }""", rupees)
    assert ok is True, f"top-up failed: {ok}"


async def admin_login(page: Page, password=ADMIN_PASSWORD):
    await page.goto(f"{BASE}/admin/login")
    await page.fill("#email", ADMIN_EMAIL)
    await page.fill("#password", password)
    await page.click("button:has-text('Sign in')")
    await page.wait_for_url(f"{BASE}/admin", timeout=10000)


async def notices_count(page: Page) -> int:
    s = await page.evaluate("fetch('/api/state').then(r => r.json())")
    return len(s["notices"])


async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch()
        mobile = dict(viewport={"width": 360, "height": 760}, device_scale_factor=2, is_mobile=True, has_touch=True)
        desktop = dict(viewport={"width": 1366, "height": 860})

        # ------------------------------------------------ signed out
        anon = await (await br.new_context(**mobile)).new_page()
        watch(anon, "anon")

        async def public_pages():
            for p in ["/login", "/rules", "/support", "/about", "/terms", "/privacy"]:
                r = await anon.goto(BASE + p)
                assert r.status == 200, f"{p} returned {r.status}"
                await anon.wait_for_timeout(300)
                await no_overflow(anon, p)
                await axe_scan(anon, p)
        await check("Public pages open signed out (360px, no sideways scroll)", public_pages())

        async def protected_redirect():
            for p in ["/", "/matches", "/leaderboard", "/invite", "/profile", "/notifications", "/play/ludo-classic"]:
                await anon.goto(BASE + p)
                await anon.wait_for_url(re.compile(r"/login\?next="), timeout=8000)
        await check("Player pages send signed-out visitors to login", protected_redirect())

        async def login_errors():
            await anon.goto(f"{BASE}/login")
            await anon.fill("#email", "not-an-email")
            await anon.click("button:has-text('Send code')")
            await anon.locator("text=valid email address").wait_for(timeout=5000)
            email = new_email()
            await anon.fill("#email", email)
            await anon.click("button:has-text('Send code')")
            await code_for(anon, email)
            await anon.locator("text=/Resend in \\d+s/").wait_for()
            await anon.locator("text=/Expires in \\d:\\d\\d/").wait_for()
            await anon.locator(f"text=We emailed a 6-digit code to").wait_for()
            await anon.locator(f"b:has-text('{email}')").wait_for()
            await anon.locator("#name").wait_for()  # new email asks for a name
            await anon.fill("#otp", "000001")
            await anon.fill("#name", "Wrongcode")
            await anon.click("form button.btn-primary")
            await anon.locator("text=/tries left|doesn't match/").wait_for(timeout=5000)
            await shot(anon, "p-login-otp")
        await check("Login: bad email error, code screen shows the address, timers, wrong-code message", login_errors())

        # ------------------------------------------------ two players
        hctx = await br.new_context(**mobile)
        gctx = await br.new_context(**desktop)
        host = await hctx.new_page(); watch(host, "host")
        guest = await gctx.new_page(); watch(guest, "guest")
        state = {}

        async def signups():
            state["host_email"] = await player_login(host, "Asha")
            state["guest_email"] = await player_login(guest, "Vikram")
            await host.get_by_role("heading", name="Who are you playing today?").wait_for()
            await top_up(host)
            await top_up(guest)
        await check("Two new players sign up through the UI", signups())

        async def every_player_page():
            for p in ["/", "/play/ludo-classic", "/play/snakes", "/play/ludo-popular", "/matches", "/leaderboard", "/invite", "/invite/friends", "/notifications", "/profile", "/rules", "/support"]:
                await host.goto(BASE + p)
                await host.wait_for_timeout(500)
                await no_overflow(host, p)
                await axe_scan(host, "player " + p)
            await host.goto(f"{BASE}/play/ludo-popular")
            await host.locator("text=isn't open right now").wait_for()
            # home cards show the three game images, fully loaded
            await host.goto(f"{BASE}/")
            for name in ["ludo-classic", "snakes", "coming-soon"]:
                img = host.locator(f"img[src*='/games/{name}-']")
                await img.wait_for()
                await img.scroll_into_view_if_needed()
                ok = await img.evaluate("el => el.complete && el.naturalWidth > 0")
                assert ok, f"image '{name}' did not load"
            href = await host.locator("a:has(img[src*='/games/ludo-classic-'])").get_attribute("href")
            assert href == "/play/ludo-classic", href
            assert "Ludo Classic" in await host.locator("a:has(img[src*='/games/ludo-classic-']) h2").inner_text()
            href = await host.locator("a:has(img[src*='/games/snakes-'])").get_attribute("href")
            assert href == "/play/snakes", href
            assert "Snakes & Ladders" in await host.locator("a:has(img[src*='/games/snakes-']) h2").inner_text()
            assert await host.locator("a:has(img[src*='/games/coming-soon-'])").count() == 0, "coming soon card is not a link"
            await shot(host, "p-home")
        await check("Every player page loads on a 360px phone; home cards show the three images", every_player_page())

        async def match_flow():
            await host.goto(f"{BASE}/play/ludo-classic")
            await host.fill("#amount", "75")
            await host.locator("text=Use a multiple of ₹50").wait_for()
            await host.fill("#amount", "150")
            await host.locator("text=Winner gets").wait_for()
            await host.click("button:has-text('Create room')")
            await host.locator("text=Room created").wait_for()
            await guest.goto(f"{BASE}/play/ludo-classic")
            card = guest.locator("div.card", has_text="Asha").filter(has_text="₹150")
            await card.locator("button:has-text('Join')").click()
            await guest.wait_for_url(re.compile(r"/match/"))
            state["match"] = guest.url.rsplit("/", 1)[-1]
            await guest.locator("text=Waiting for the host").wait_for()
            await host.goto(f"{BASE}/match/{state['match']}")
            await host.locator("text=Vikram wants to play").wait_for(timeout=8000)
            await shot(host, "p-host-request")
            await host.click("button:has-text('Accept')")
            await host.get_by_role("heading", name="Share the room code").wait_for()
            await host.locator("text=/^[45]:\\d\\d$/").wait_for()  # countdown
            await guest.locator("text=Waiting for the room code").wait_for(timeout=8000)
            await host.fill("#code", "12345678")
            await host.click("button:has-text('Share code')")
            await host.locator("text=8 digits and start with 0").wait_for()
            await host.fill("#code", "04821157")
            await host.click("button:has-text('Share code')")
            await guest.locator("[aria-label='Room code 0 4 8 2 1 1 5 7']").wait_for(timeout=8000)
            await no_overflow(host, "match page")
            await shot(guest, "p-guest-code")
            # guest wins with a real PNG upload
            await guest.click("text=I won")
            await guest.set_input_files("input[type=file]", files=[{"name": "win.png", "mimeType": "image/png", "buffer": png_bytes()}])
            await guest.locator("img[alt='Selected screenshot']").wait_for()
            await guest.click("button:has-text('Post result')")
            await guest.locator("text=You posted: I won").wait_for()
            await host.locator("text=posted “I won”").wait_for(timeout=8000)
            await host.click("text=I lost")
            await host.click("button:has-text('Post result')")
            await host.locator("text=Vikram won").wait_for(timeout=8000)
            await guest.locator("text=You won").wait_for(timeout=8000)
            await guest.locator("text=added to your wallet").first.wait_for(timeout=8000)
            await shot(guest, "p-guest-won")
            href = await host.locator("a:has(img[alt*=\"screenshot\"])").first.get_attribute("href")
            r = await host.request.get(BASE + href)
            assert r.status == 200 and r.headers["content-type"].startswith("image/"), f"screenshot link gave {r.status}"
        await check("Full match in the UI: create, join, accept, room code, PNG upload, results", match_flow())

        async def after_match():
            await host.goto(f"{BASE}/matches")
            await host.locator("text=Finished").first.wait_for()
            await guest.goto(f"{BASE}/leaderboard")
            await guest.locator("text=Vikram (you)").wait_for()
            await guest.goto(f"{BASE}/notifications")
            await guest.locator("text=You won against Asha").wait_for()
            await guest.click("button:has-text('Mark all read')")
            await guest.locator("button:has-text('Mark all read')").wait_for(state="detached")
        await check("History, leaderboard and notifications update after the match", after_match())

        async def profile():
            await host.goto(f"{BASE}/profile")
            await host.click("button[aria-label='Edit name']")
            await host.fill("#nm", "Asha K")
            await host.click("button:has-text('Save name')")
            await host.locator("h2:has-text('Asha K')").wait_for()
            await host.click("button[aria-label='Blue']")
            await host.locator("button[aria-label='Blue'][aria-pressed='true']").wait_for()
            await host.goto(f"{BASE}/invite")
            code = await host.locator("p.font-display.text-5xl").inner_text()
            assert re.fullmatch(r"[A-Z0-9]{6}", code.strip()), code
            state["invite"] = code.strip()
        await check("Profile: rename and colour; invite page shows a code", profile())

        async def invite_signup():
            ctx = await br.new_context(**mobile)
            p = await ctx.new_page(); watch(p, "invitee")
            await p.goto(f"{BASE}/login?invite={state['invite']}")
            friend = new_email()
            await p.fill("#email", friend)
            await p.click("button:has-text('Send code')")
            await p.fill("#otp", await code_for(p, friend))
            assert (await p.input_value("#invite")).upper() == state["invite"], "invite code pre-filled"
            await p.fill("#name", "Friend")
            await p.click("form button.btn-primary")
            await p.wait_for_url(f"{BASE}/")
            await host.goto(f"{BASE}/invite/friends")
            await host.locator("text=Friend").first.wait_for(timeout=8000)
            await ctx.close()
        await check("Invite link pre-fills the code and the friend shows up for the inviter", invite_signup())

        # ------------------------------------------------ admin
        actx = await br.new_context(**desktop)
        admin = await actx.new_page(); watch(admin, "admin")

        async def admin_auth():
            await admin.goto(f"{BASE}/admin")
            await admin.wait_for_url(re.compile(r"/admin/login"))
            await admin.fill("#email", ADMIN_EMAIL)
            await admin.fill("#password", "definitely-wrong")
            await admin.click("button:has-text('Sign in')")
            await admin.locator("text=Email or password is wrong").wait_for()
            await admin_login(admin)
            await admin.locator("text=/needs? a decision/").first.wait_for()
        await check("Admin: wrong password refused, right password signs in", admin_auth())

        async def lockout():
            p = await (await br.new_context(**desktop)).new_page()
            for _ in range(5):
                await p.goto(f"{BASE}/admin/login")
                await p.fill("#email", "nobody@example.com")
                await p.fill("#password", "x")
                await p.click("button:has-text('Sign in')")
                await p.locator("form [role=alert]").wait_for()
            await p.goto(f"{BASE}/admin/login")
            await p.fill("#email", "nobody@example.com"); await p.fill("#password", "x")
            await p.click("button:has-text('Sign in')")
            await p.locator("text=/Try again in \\d+ minutes|Locked for 15 minutes/").wait_for()
        await check("Admin: 5 wrong passwords lock the email", lockout())

        async def admin_pages():
            for p in ["/admin", "/admin/users", "/admin/users?sort=wins", "/admin/users?status=suspended", "/admin/matches",
                      "/admin/matches?status=disputed", "/admin/leaderboard", "/admin/leaderboard?range=all&by=losses",
                      "/admin/leaderboard?by=rate", "/admin/settings", "/admin/audit", "/admin/account", "/admin/users/seed-aarav"]:
                r = await admin.goto(BASE + p)
                assert r.status == 200, f"{p} → {r.status}"
                await no_overflow(admin, p)
                await axe_scan(admin, "admin " + p)
            await shot(admin, "a-dashboard")
            m = await (await br.new_context(**mobile, storage_state=await actx.storage_state())).new_page()
            watch(m, "admin-mobile")
            for p in ["/admin", "/admin/users", "/admin/matches", "/admin/settings", "/admin/users/seed-aarav"]:
                await m.goto(BASE + p)
                await no_overflow(m, "mobile " + p)
            await shot(m, "a-mobile", full=False)
        await check("Every admin page loads on desktop and on a 360px phone", admin_pages())

        async def admin_data():
            await admin.goto(f"{BASE}/admin/users?sort=wins")
            rows = admin.locator("table tbody tr")
            assert await rows.count() >= 20, "players listed"
            wins = [int(await rows.nth(i).locator("td").nth(3).inner_text()) for i in range(5)]
            assert wins == sorted(wins, reverse=True), f"sorted by wins: {wins}"
            await admin.goto(f"{BASE}/admin/users?sort=losses")
            losses = [int(await admin.locator("table tbody tr").nth(i).locator("td").nth(4).inner_text()) for i in range(5)]
            assert losses == sorted(losses, reverse=True), f"sorted by losses: {losses}"
            await admin.goto(f"{BASE}/admin/users?q=Asha")
            await admin.locator("table tbody tr", has_text="Asha").first.wait_for()
            await admin.goto(f"{BASE}/admin/matches?q=Asha")
            await admin.locator("text=Asha").first.wait_for()
        await check("Admin: players sorted by wins / losses, search works", admin_data())

        async def settle():
            await admin.goto(f"{BASE}/admin/matches?status=disputed")
            await admin.locator("table tbody tr a").first.click()
            await admin.locator("text=Settle this match").wait_for()
            imgs = admin.locator("a:has(img[alt*=\"screenshot\"])")
            href = await imgs.first.get_attribute("href")
            r = await admin.request.get(BASE + href)
            assert r.status == 200, f"admin screenshot link {r.status}"
            await admin.locator("fieldset label").first.click()
            await admin.fill("#note", "Screenshot shows all tokens home")
            await admin.click("button:has-text('Save decision')")
            await admin.locator("text=Decided by support: Screenshot shows all tokens home").wait_for()
        await check("Admin: settle a dispute (screenshot opens, winner saved)", settle())

        async def message_and_broadcast():
            before = await notices_count(guest)
            await admin.goto(f"{BASE}/admin/users?q=Vikram")
            await admin.locator("table tbody tr a", has_text="Vikram").first.click()
            await admin.fill("#text", "Hello from support")
            await admin.click("button:has-text('Send message')")
            await admin.locator("text=Sent to the player's notifications").wait_for()
            await admin.goto(f"{BASE}/admin/settings")
            await admin.locator("main textarea[name=text]").nth(1).fill("E2E broadcast to everyone")
            await admin.click("main button:has-text('Send')")
            await admin.locator("text=/Sent to \\d+ players/").wait_for()
            after = await notices_count(guest)
            assert after >= before + 2, f"guest notices {before} → {after}"
            await guest.goto(f"{BASE}/notifications")
            await guest.locator("text=Hello from support").wait_for()
            await guest.locator("text=E2E broadcast to everyone").wait_for()
        await check("Admin: message one player and broadcast; player receives both", message_and_broadcast())

        async def announcement_games_maintenance():
            await admin.goto(f"{BASE}/admin/settings")
            await admin.locator("main textarea[name=text]").first.fill("E2E: tournament Saturday 7 pm")
            box = admin.locator("main input[name=active]").first
            if not await box.is_checked():
                await admin.locator("main label:has-text('Show the banner')").click()
            await admin.click("main button:has-text('Save announcement')")
            await admin.locator("text=Announcement is live").wait_for()
            await host.goto(f"{BASE}/")
            await host.locator("text=E2E: tournament Saturday 7 pm").wait_for(timeout=8000)
            # games off
            await admin.goto(f"{BASE}/admin/settings")
            await admin.locator("main label:has-text('Snakes & Ladders')").click()
            await admin.click("main button:has-text('Save games')")
            await admin.locator("text=Games updated").wait_for()
            await host.goto(f"{BASE}/play/snakes")
            await host.locator("text=isn't open right now").wait_for(timeout=8000)
            await admin.goto(f"{BASE}/admin/settings")
            await admin.locator("main label:has-text('Snakes & Ladders')").click()
            await admin.click("main button:has-text('Save games')")
            await admin.locator("text=Games updated").wait_for()
            # maintenance on → create blocked → off
            await admin.goto(f"{BASE}/admin/settings")
            await admin.fill("main input[aria-label='Maintenance message']", "E2E maintenance, back soon")
            box = admin.locator("main input[name=active]").nth(1)
            if not await box.is_checked():
                await admin.locator("main label:has-text('Maintenance mode on')").click()
            await admin.click("main button:has-text('Save maintenance')")
            await admin.locator("text=Maintenance mode is on").wait_for()
            try:
                await host.goto(f"{BASE}/play/ludo-classic")
                await host.locator("[role=status]", has_text="E2E maintenance, back soon").wait_for(timeout=8000)
                await host.fill("#amount", "50")
                await host.click("button:has-text('Create room')")
                await host.locator("text=E2E maintenance, back soon").nth(1).wait_for()
            finally:
                await admin.goto(f"{BASE}/admin/settings")
                if await admin.locator("main input[name=active]").nth(1).is_checked():
                    await admin.locator("main label:has-text('Maintenance mode on')").click()
                await admin.click("main button:has-text('Save maintenance')")
                await admin.locator("text=Maintenance mode is off").wait_for()
            # announcement off again
            await admin.goto(f"{BASE}/admin/settings")
            await admin.locator("main label:has-text('Show the banner')").click()
            await admin.click("main button:has-text('Save announcement')")
            await admin.locator("text=Announcement turned off").wait_for()
        await check("Admin: announcement, game on/off and maintenance reach players", announcement_games_maintenance())

        async def suspend_flow():
            await admin.goto(f"{BASE}/admin/users?q=Asha")
            await admin.locator("table tbody tr a", has_text="Asha").first.click()
            await admin.fill("#reason", "E2E suspension test")
            await admin.click("button:has-text('Suspend player')")
            await admin.locator("text=Lift suspension").wait_for()
            await host.goto(f"{BASE}/profile")
            await host.wait_for_url(re.compile(r"/login"), timeout=10000)
            await host.fill("#email", state["host_email"])
            await host.click("button:has-text('Send code')")
            await host.locator("text=/suspended|Wait \\d+ seconds/").wait_for()
            await admin.click("button:has-text('Lift suspension')")
            await admin.locator("button:has-text('Suspend player')").wait_for()
            await admin.fill("#name", "Asha Renamed")
            await admin.click("button:has-text('Rename')")
            await admin.locator("text=Name updated").wait_for()
        await check("Admin: suspend signs the player out; lift; rename", suspend_flow())

        async def action_replay_without_cookie():
            captured = {}

            async def grab(route, request):
                if request.method == "POST" and "next-action" in {k.lower() for k in request.headers}:
                    captured["headers"] = {k: v for k, v in request.headers.items() if k.lower() not in ("cookie", "content-length")}
                    captured["body"] = request.post_data_buffer
                await route.continue_()
            await admin.route("**/admin/settings", grab)
            await admin.goto(f"{BASE}/admin/settings")
            await admin.locator("main textarea[name=text]").nth(1).fill("Captured broadcast")
            await admin.click("main button:has-text('Send')")
            await admin.locator("text=/Sent to \\d+ players/").wait_for()
            await admin.unroute("**/admin/settings")
            assert captured, "server action request captured"
            before = await notices_count(guest)
            anon_ctx = await br.new_context()
            r = await anon_ctx.request.post(f"{BASE}/admin/settings", headers=captured["headers"], data=captured["body"], max_redirects=0)
            await guest.wait_for_timeout(500)
            after = await notices_count(guest)
            assert after == before, f"replayed admin action without cookie created notices ({before} → {after}), status {r.status}"
        await check("Security: replaying an admin action without the admin cookie does nothing", action_replay_without_cookie())

        async def audit_and_password():
            await admin.goto(f"{BASE}/admin/audit")
            for t in ["Settled match", "Suspended player", "Lifted suspension", "Broadcast", "Messaged player", "Announcement", "Maintenance", "Renamed player"]:
                await admin.locator("td", has_text=t).first.wait_for()
            await admin.goto(f"{BASE}/admin/account")
            await admin.fill("#current", "wrong")
            await admin.fill("#next", "NewPass123")
            await admin.fill("#confirm", "NewPass123")
            await admin.click("main button:has-text('Change password')")
            await admin.locator("text=Current password is wrong").wait_for()
            await admin.fill("#current", ADMIN_PASSWORD)
            # too short: the browser blocks the submit itself (minLength=8)
            await admin.fill("#next", "short")
            assert await admin.locator("#next").evaluate("el => !el.checkValidity()"), "minLength enforced in the form"
            # long enough but no number: the server rule answers
            await admin.fill("#next", "lettersonly")
            await admin.fill("#confirm", "lettersonly")
            await admin.click("main button:has-text('Change password')")
            await admin.locator("text=8+ characters with letters and numbers").wait_for()
            await admin.fill("#current", ADMIN_PASSWORD)
            await admin.fill("#next", "NewPass123")
            await admin.fill("#confirm", "NewPass123")
            await admin.click("main button:has-text('Change password')")
            await admin.locator("text=Password changed").wait_for()
            await admin.click("button:has-text('Sign out')")
            await admin.wait_for_url(re.compile(r"/admin/login"))
            await admin_login(admin, "NewPass123")
            await admin.goto(f"{BASE}/admin/account")
            await admin.fill("#current", "NewPass123")
            await admin.fill("#next", ADMIN_PASSWORD)
            await admin.fill("#confirm", ADMIN_PASSWORD)
            await admin.click("main button:has-text('Change password')")
            await admin.locator("text=Password changed").wait_for()
        await check("Admin: activity log records actions; password change and sign back in", audit_and_password())

        async def logout_everywhere():
            await guest.goto(f"{BASE}/profile")
            await guest.click("button:has-text('Log out of all devices')")
            await guest.wait_for_url(re.compile(r"/login"))
            s = await guest.evaluate("fetch('/api/state').then(r => r.json())")
            assert s["meId"] is None
        await check("Player: log out of all devices", logout_everywhere())

        await br.close()

    # ------------------------------------------------ report
    print("\n========== SUMMARY ==========")
    passed = sum(1 for _, ok, _ in results if ok)
    print(f"{passed}/{len(results)} checks passed")
    for n, ok, m in results:
        if not ok:
            print(f"  FAIL {n}: {m}")
    print(f"\nPage errors: {len(page_errors)}")
    for e in page_errors[:20]:
        print("  ", e)
    if AXE:
        print(f"\nAccessibility (serious/critical): {sum(len(v) for v in a11y.values())} issues on {len(a11y)} pages")
        for k, v in a11y.items():
            for x in v:
                print(f"   {k}: {x}")
    with open(os.environ.get("E2E_REPORT", "e2e-report.json"), "w") as f:
        json.dump({"results": results, "page_errors": page_errors, "a11y": a11y}, f, indent=1)
    raise SystemExit(0 if passed == len(results) and not page_errors else 1)


asyncio.run(main())
