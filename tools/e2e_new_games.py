"""اختبار متصفحات مستقلة للعبتي السلم والثعبان ومين الجاسوس.
التشغيل:  npm start  ثم  python3 tools/e2e_new_games.py http://localhost:3000 out_dir
"""
import sys, os, re
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
OUT = sys.argv[2] if len(sys.argv) > 2 else "e2e-shots"
os.makedirs(OUT, exist_ok=True)
PHONE = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
errors = []


def new_player(browser, who, fast=True):
    ctx = browser.new_context(**PHONE)
    if fast:  # تقليل الحركة لتسريع الاختبار فقط
        ctx.add_init_script("localStorage.setItem('gn:reduce','true'); localStorage.setItem('gn:sound','false')")
    pg = ctx.new_page()
    pg.on("console", lambda m: m.type == "error" and errors.append(f"{who}: {m.text}"))
    pg.on("pageerror", lambda e: errors.append(f"{who}: {e}"))
    pg.on("dialog", lambda d: d.accept())
    return pg


def shot(pg, name, full=False):
    pg.wait_for_timeout(400)
    pg.screenshot(path=f"{OUT}/{name}.png", full_page=full)


def open_room(host, guests, max_players="8"):
    host.goto(BASE + "/create")
    host.fill("input[name=nickname]", "أبو فهد")
    host.locator(f"input[name=max][value='{max_players}']").check(force=True)
    host.get_by_role("button", name="أنشئ الغرفة").click()
    expect(host.locator(".lobby")).to_be_visible()
    code = host.locator(".code-chip").inner_text().strip()
    for i, g in enumerate(guests):
        g.goto(f"{BASE}/r/{code}")
        g.fill("input[name=nickname]", ["سارة", "خالد", "نورة", "فيصل"][i])
        g.get_by_role("button", name="ادخل الغرفة").click()
        expect(g.locator(".lobby")).to_be_visible()
    expect(host.locator(".player-list li")).to_have_count(1 + len(guests))
    return code


with sync_playwright() as p:
    browser = p.chromium.launch()

    # ================= السلم والثعبان =================
    a = new_player(browser, "A")
    b = new_player(browser, "B")
    open_room(a, [b], "4")
    a.locator('.pick[data-id="snakes"]').click()
    expect(b.locator(".picker .game-card h3")).to_have_text("السلم والثعبان")
    a.locator("[data-start]").click()
    expect(a.locator(".snl-board")).to_be_visible()
    expect(b.locator(".snl-board")).to_be_visible()
    expect(a.locator(".sq")).to_have_count(100)
    assert b.locator(".roll-btn").is_disabled()
    shot(a, "s1-snakes-start", full=True)

    rolls = 0
    for _ in range(600):
        if a.locator(".results:not([hidden])").count():
            break
        for pg in (a, b):
            btn = pg.locator(".roll-btn")
            if btn.is_visible() and btn.is_enabled():
                btn.click()
                rolls += 1
                pg.wait_for_timeout(60)
                break
        else:
            a.wait_for_timeout(60)
        if rolls == 12:
            assert not a.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth"), "horizontal overflow in snakes"
            a.wait_for_timeout(500)
            shot(a, "s2-snakes-midgame", full=True)
            # الحالة متطابقة عند الطرفين
            pa = a.locator(".snl-chip b").all_inner_texts()
            pb = b.locator(".snl-chip b").all_inner_texts()
            assert pa == pb, (pa, pb)
    expect(a.locator(".results:not([hidden])")).to_be_visible(timeout=10000)
    expect(b.locator(".results:not([hidden])")).to_be_visible()
    print("snakes finished after", rolls, "rolls")
    shot(a, "s3-snakes-results", full=True)
    # التحقق من وصول الفائز إلى 100
    assert "100" in a.locator(".snl-chip b").all_inner_texts()
    a.get_by_role("button", name="غيّر اللعبة").click()
    expect(b.locator(".lobby")).to_be_visible()
    a.context.close(); b.context.close()

    # ================= مين الجاسوس =================
    ps = [new_player(browser, f"P{i}") for i in range(4)]
    host = ps[0]
    open_room(host, ps[1:])
    host.locator('.pick[data-id="spy"]').click()
    host.locator("[data-start]").click()
    for pg in ps:
        expect(pg.locator(".spy-card")).to_be_visible()

    roles = []
    for pg in ps:
        roles.append("spy" if pg.locator(".spy-card.is-spy").count() else "agent")
    assert roles.count("spy") == 1, roles
    spy_pg = ps[roles.index("spy")]
    agent_pg = ps[roles.index("agent")]
    place = agent_pg.locator(".card-main").inner_text()
    for pg, r in zip(ps, roles):
        if r == "agent":
            assert pg.locator(".card-main").inner_text() == place
        else:
            assert place not in pg.content().split('class="spy-places"')[0], "place leaked to spy card"
    shot(spy_pg, "p1-spy-card")
    shot(agent_pg, "p2-agent-card")

    # تغيير المكان مرة
    agent_pg.locator("[data-skip]").click()
    expect(agent_pg.locator(".card-main")).not_to_have_text(place)
    place = agent_pg.locator(".card-main").inner_text()

    for pg in ps:
        pg.locator("[data-ready]").click()
    # جولة سؤال وجواب
    asker = None
    for _ in range(50):
        for pg in ps:
            if pg.locator(".tchip").count():
                asker = pg
        if asker:
            break
        ps[0].wait_for_timeout(100)
    assert asker, "no asker UI"
    assert not asker.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth"), "horizontal overflow in spy"
    target_btn = asker.locator(".tchip:not([disabled])").first
    target_name = target_btn.inner_text().strip()
    target_btn.click()
    asker.fill(".say input", "هل تحتاج تذكرة لدخوله؟")
    asker.locator(".say button").click()
    answerer = None
    for _ in range(50):
        for pg in ps:
            if pg.locator(".phase-answer .say").count():
                answerer = pg
        if answerer:
            break
        ps[0].wait_for_timeout(100)
    assert answerer
    shot(answerer, "p3-answering")
    answerer.fill(".say input", "أحيانًا، يعتمد")
    answerer.locator(".say button").click()
    for pg in ps:
        expect(pg.locator(".spy-feed li")).to_have_count(1)
    shot(ps[0], "p4-feed", full=True)

    # طلب التصويت من الأغلبية
    for pg in ps[:3]:
        pg.locator("[data-vote]").click()
    for pg in ps:
        expect(pg.locator(".phase-vote")).to_be_visible()
    spy_name = None
    names = {}
    for pg in ps:
        names[pg] = None
    # اسم الجاسوس كما يظهر في أزرار التصويت عند اللاعبين الآخرين
    spy_idx = roles.index("spy")
    all_names = ["أبو فهد", "سارة", "خالد", "نورة"]
    spy_name = all_names[spy_idx]
    for i, pg in enumerate(ps):
        if i == spy_idx:
            pg.locator(".vchip").first.click()
        else:
            pg.locator(".vchip", has_text=spy_name).click()
    shot(agent_pg, "p5-voted")
    # الجاسوس انكشف: فرصة أخيرة — يخمّن مكانًا خاطئًا
    expect(spy_pg.locator(".place-btn").first).to_be_visible()
    shot(spy_pg, "p6-spy-guess", full=True)
    wrong = spy_pg.locator(".place-btn").filter(has_not_text=re.compile(f"^{re.escape(place)}$")).first
    wrong.click()
    for pg in ps:
        expect(pg.locator(".results:not([hidden])")).to_be_visible()
    expect(agent_pg.locator(".result-title")).to_have_text("فزت بالجولة!")
    expect(spy_pg.locator(".result-title")).to_have_text("خسرت هذه المرة")
    expect(agent_pg.locator(".reveal-line")).to_contain_text(spy_name)
    shot(agent_pg, "p7-results-agent", full=True)
    shot(spy_pg, "p8-results-spy", full=True)

    # جولة جديدة بأدوار جديدة
    host.get_by_role("button", name="جولة أخرى").click()
    for pg in ps:
        expect(pg.locator(".spy-card")).to_be_visible()
    expect(host.locator(".round-label")).to_have_text("الجولة 2")
    browser.close()

if errors:
    print("CONSOLE ERRORS:\n" + "\n".join(errors))
    sys.exit(1)
print("E2E NEW GAMES OK —", OUT)
