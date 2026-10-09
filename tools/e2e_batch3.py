"""اختبار متصفحات مستقلة للعبتي أربعة في صف ورأي الأغلبية.
التشغيل:  npm start  ثم  python3 tools/e2e_batch3.py http://localhost:3000 out_dir
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
    ctx.add_init_script("localStorage.setItem('gn:sound','false')")
    pg = ctx.new_page()
    pg.on("console", lambda m: m.type == "error" and errors.append(f"{who}: {m.text}"))
    pg.on("pageerror", lambda e: errors.append(f"{who}: {e}"))
    pg.on("dialog", lambda d: d.accept())
    return pg


def shot(pg, name, full=False):
    pg.wait_for_timeout(500)
    pg.screenshot(path=f"{OUT}/{name}.png", full_page=full)


def no_overflow(pg, where):
    assert not pg.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth"), f"overflow: {where}"


def room(host, guests, game):
    host.goto(BASE + "/create")
    host.fill("input[name=nickname]", NAMES[0])
    host.get_by_role("button", name="أنشئ الغرفة").click()
    expect(host.locator(".lobby")).to_be_visible()
    code = host.locator(".code-chip").inner_text().strip()
    for i, g in enumerate(guests):
        g.goto(f"{BASE}/r/{code}")
        g.fill("input[name=nickname]", NAMES[i + 1])
        g.get_by_role("button", name="ادخل الغرفة").click()
        expect(g.locator(".lobby")).to_be_visible()
    host.locator(f'.pick[data-id="{game}"]').click()
    host.locator("[data-start]").click()


with sync_playwright() as p:
    browser = p.chromium.launch()

    # ============ أربعة في صف ============
    a, b = player(browser, "A"), player(browser, "B")
    room(a, [b], "connect4")
    expect(a.locator(".c4-col")).to_have_count(7)
    expect(b.locator(".slot")).to_have_count(42)
    assert b.locator('.c4-col[data-c="0"]').is_disabled()
    # A يبني عمودًا رأسيًا في العمود 3، وB يلعب في 4
    for pg, col in [(a, 3), (b, 4), (a, 3), (b, 4), (a, 3)]:
        pg.locator(f'.c4-col[data-c="{col}"]').click()
        other = b if pg is a else a
        expect(other.locator(".turn-line")).to_contain_text("دورك")
    shot(b, "c1-connect4-mid")
    no_overflow(b, "connect4")
    b.locator('.c4-col[data-c="4"]').click()
    expect(a.locator(".turn-line")).to_contain_text("دورك")
    a.locator('.c4-col[data-c="3"]').click()
    expect(a.locator(".result-title")).to_have_text("فزت بالجولة!")
    expect(b.locator(".result-title")).to_have_text("خسرت هذه المرة")
    expect(b.locator(".slot.win")).to_have_count(4)
    shot(a, "c2-connect4-win", full=True)
    a.get_by_role("button", name="جولة أخرى").click()
    expect(b.locator(".turn-line")).to_contain_text("دورك")  # الخاسر يبدأ
    a.context.close(); b.context.close()

    # ============ رأي الأغلبية ============
    ps = [player(browser, f"P{i}") for i in range(4)]
    room(ps[0], ps[1:], "majority")
    for pg in ps:
        expect(pg.locator(".maj-q")).to_be_visible()
    q1 = ps[0].locator(".maj-q").inner_text()
    assert all(pg.locator(".maj-q").inner_text() == q1 for pg in ps)
    shot(ps[1], "m1-question")
    no_overflow(ps[1], "majority")
    # تخطي سؤال
    ps[2].locator("[data-skip]").click()
    expect(ps[0].locator(".maj-q")).not_to_have_text(q1)

    picks = ["A", "A", "A", "B"]
    for pg, c in zip(ps, picks):
        pg.locator(f'.maj-opt[data-c="{c}"]').click()
        if pg is ps[0]:
            # لا يظهر لغيري ماذا اخترت
            expect(ps[1].locator(".tick.on")).to_have_count(1)
            assert ps[1].locator(".nm-chip").count() == 0
    for pg in ps:
        expect(pg.locator(".maj-opt.majority")).to_be_visible()
    expect(ps[3].locator('.maj-opt[data-c="A"] .opt-meta b')).to_have_text("3")
    shot(ps[3], "m2-reveal", full=True)

    # بقية الأسئلة: الجميع يختار A بسرعة
    for _ in range(6):
        for pg in ps:
            expect(pg.locator(".maj-opt:not([disabled])").first).to_be_visible(timeout=15000)
        for pg in ps:
            pg.locator('.maj-opt[data-c="A"]').click()
        for pg in ps:
            expect(pg.locator('.maj[data-phase="reveal"], .maj[data-phase="done"]')).to_be_visible(timeout=15000)
    for pg in ps:
        expect(pg.locator(".results:not([hidden])")).to_be_visible(timeout=15000)
    expect(ps[0].locator(".result-title")).to_have_text("فزت بالجولة!")
    expect(ps[3].locator(".result-title")).to_have_text("خسرت هذه المرة")
    shot(ps[3], "m3-results", full=True)

    # المضيف يعود للانتظار، والجميع يرى الألعاب الخمس الجاهزة
    ps[0].get_by_role("button", name="غيّر اللعبة").click()
    expect(ps[0].locator(".pick")).to_have_count(5)
    shot(ps[0], "m4-lobby-5-games", full=True)
    browser.close()

if errors:
    print("CONSOLE ERRORS:\n" + "\n".join(errors))
    sys.exit(1)
print("E2E BATCH 3 OK —", OUT)
