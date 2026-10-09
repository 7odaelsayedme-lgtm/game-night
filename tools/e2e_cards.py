"""اختبار متصفحات مستقلة لألعاب: ألوان، الشايب، ملك العقار.
التشغيل:  npm start  ثم  python3 tools/e2e_cards.py http://localhost:3000 out_dir
"""
import sys, os
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
OUT = sys.argv[2] if len(sys.argv) > 2 else "e2e-shots"
os.makedirs(OUT, exist_ok=True)
PHONE = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
NAMES = ["أبو فهد", "سارة", "خالد", "نورة"]
errors = []


def player(browser, who):
    ctx = browser.new_context(**PHONE)
    ctx.add_init_script("localStorage.setItem('gn:sound','false'); localStorage.setItem('gn:reduce','true')")
    pg = ctx.new_page()
    pg.on("console", lambda m: m.type == "error" and errors.append(f"{who}: {m.text}"))
    pg.on("pageerror", lambda e: errors.append(f"{who}: {e}"))
    pg.on("dialog", lambda d: d.accept())
    return pg


def shot(pg, name, full=False):
    pg.wait_for_timeout(400)
    pg.screenshot(path=f"{OUT}/{name}.png", full_page=full)


def no_overflow(pg, where):
    assert not pg.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth"), f"overflow: {where}"


def room(ps, game):
    host = ps[0]
    host.goto(BASE + "/create")
    host.fill("input[name=nickname]", NAMES[0])
    host.get_by_role("button", name="أنشئ الغرفة").click()
    expect(host.locator(".lobby")).to_be_visible()
    code = host.locator(".code-chip").inner_text().strip()
    for i, g in enumerate(ps[1:]):
        g.goto(f"{BASE}/r/{code}")
        g.fill("input[name=nickname]", NAMES[i + 1])
        g.get_by_role("button", name="ادخل الغرفة").click()
        expect(g.locator(".lobby")).to_be_visible()
    host.locator(f'.pick[data-id="{game}"]').click()
    host.locator("[data-start]").click()


def finished(ps):
    return any(pg.locator(".results:not([hidden])").count() for pg in ps)


with sync_playwright() as p:
    browser = p.chromium.launch()

    # ============ ألوان ============
    ps = [player(browser, f"C{i}") for i in range(3)]
    room(ps, "colors")
    for pg in ps:
        expect(pg.locator(".hand-card")).to_have_count(7)
    shot(ps[1], "u1-colors-start", full=True)
    no_overflow(ps[1], "colors")
    moves = 0
    for _ in range(700):
        if finished(ps):
            break
        acted = False
        for pg in ps:
            if pg.locator('[data-call]:not([disabled])').count():
                pg.locator('[data-call]').click(); acted = True; break
            if not pg.locator(".turn-line.mine").count():
                continue
            ok = pg.locator(".hand-card.ok")
            if ok.count():
                ok.first.click()
                if pg.locator(".cg-picker:not([hidden])").count():
                    pg.locator(".pick-color").first.click()
            elif pg.locator("[data-pass]").count():
                pg.locator("[data-pass]").click()
            elif pg.locator(".cg-deck:not([disabled])").count():
                pg.locator(".cg-deck").click()
            acted = True
            moves += 1
            pg.wait_for_timeout(80)
            break
        if not acted:
            ps[0].wait_for_timeout(80)
        if moves == 10:
            shot(ps[0], "u2-colors-mid", full=True)
    for pg in ps:
        expect(pg.locator(".results:not([hidden])")).to_be_visible(timeout=20000)
    print("colors finished after", moves, "moves")
    shot(ps[0], "u3-colors-results", full=True)
    for pg in ps:
        pg.context.close()

    # ============ الشايب ============
    ps = [player(browser, f"S{i}") for i in range(3)]
    room(ps, "shayeb")
    for pg in ps:
        expect(pg.locator(".sh-hand .pcard").first).to_be_visible()
    holder = [pg for pg in ps if pg.locator(".pcard.shayeb").count()]
    assert len(holder) == 1, "exactly one player sees the shayeb"
    shot(holder[0], "o1-shayeb-holder", full=True)
    no_overflow(ps[0], "shayeb")
    picks = 0
    for _ in range(300):
        if finished(ps):
            break
        for pg in ps:
            b = pg.locator(".sh-backs.can-pick .back-card")
            if b.count():
                b.nth(b.count() // 2).click()
                picks += 1
                pg.wait_for_timeout(60)
                break
        else:
            ps[0].wait_for_timeout(60)
        if picks == 3:
            shot(ps[0], "o2-shayeb-mid", full=True)
    for pg in ps:
        expect(pg.locator(".results:not([hidden])")).to_be_visible(timeout=20000)
    print("shayeb finished after", picks, "picks")
    loser = [pg for pg in ps if pg.locator(".result-title", has_text="خسرت").count()]
    assert len(loser) == 1, "exactly one loser"
    expect(loser[0].locator(".pcard.shayeb")).to_be_visible()
    shot(loser[0], "o3-shayeb-loser", full=True)
    for pg in ps:
        pg.context.close()

    # ============ ملك العقار ============
    ps = [player(browser, f"A{i}") for i in range(3)]
    room(ps, "aqar")
    for pg in ps:
        expect(pg.locator(".sq2")).to_have_count(24)
    shot(ps[0], "a1-aqar-start", full=True)
    no_overflow(ps[0], "aqar")
    actions = 0
    for _ in range(200):
        if finished(ps) or actions >= 30:
            break
        for pg in ps:
            btn = pg.locator(".aq-actions [data-a]")
            if btn.count():
                btn.first.click()  # ارمِ أو اشترِ
                actions += 1
                pg.wait_for_timeout(120)
                break
        else:
            ps[0].wait_for_timeout(80)
    owned = ps[0].locator(".sq2.owned").count()
    assert owned >= 1, "someone should have bought a city"
    # التفاصيل عند لمس خانة
    ps[1].locator('.sq2[data-i="23"]').click()
    expect(ps[1].locator(".aq-detail")).to_contain_text("الرياض")
    shot(ps[1], "a2-aqar-mid", full=True)
    shot(ps[0], "a3-aqar-mid-viewport")
    print("aqar actions:", actions, "owned:", owned)
    browser.close()

if errors:
    print("CONSOLE ERRORS:\n" + "\n".join(errors))
    sys.exit(1)
print("E2E CARDS OK —", OUT)
