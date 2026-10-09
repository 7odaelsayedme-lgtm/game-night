"""اختبار متصفحين مستقلين (جلستان معزولتان) يلعبان مباراة كاملة.
التشغيل:  npm start  ثم  python3 tools/e2e_two_players.py http://localhost:3000 out_dir
يتطلب: pip install playwright && playwright install chromium
"""
import sys, os
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
OUT = sys.argv[2] if len(sys.argv) > 2 else "e2e-shots"
os.makedirs(OUT, exist_ok=True)
PHONE = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
errors = []


def watch(page, who):
    page.on("console", lambda m: m.type == "error" and errors.append(f"{who}: {m.text}"))
    page.on("pageerror", lambda e: errors.append(f"{who}: {e}"))


def shot(page, name, full=False):
    page.wait_for_timeout(450)
    page.screenshot(path=f"{OUT}/{name}.png", full_page=full)


def tap(page, i):
    page.locator(f'.cell[data-i="{i}"]').click()


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx_a = browser.new_context(**PHONE)   # جهاز اللاعب الأول
    ctx_b = browser.new_context(**PHONE)   # جهاز اللاعب الثاني — تخزين منفصل تمامًا
    a, b = ctx_a.new_page(), ctx_b.new_page()
    watch(a, "A"); watch(b, "B")

    # 1) الرئيسية وإنشاء الغرفة
    a.goto(BASE)
    expect(a.locator(".wordmark")).to_be_visible()
    shot(a, "01-home", full=True)
    a.get_by_role("link", name="أنشئ غرفة").first.click()
    a.fill("input[name=nickname]", "أبو فهد")
    shot(a, "02-create")
    a.get_by_role("button", name="أنشئ الغرفة").click()
    expect(a.locator(".lobby")).to_be_visible()
    code = a.locator(".code-chip").inner_text().strip()
    assert len(code) == 5, code
    shot(a, "03-lobby-host-alone", full=True)
    assert a.locator("[data-start]").is_disabled(), "start must be disabled with one player"

    # 2) اللاعب الثاني يفتح رابط الدعوة
    b.goto(f"{BASE}/r/{code}")
    expect(b.get_by_text("دعوة من أبو فهد")).to_be_visible()
    shot(b, "04-invite")
    b.fill("input[name=nickname]", "سارة")
    b.get_by_role("button", name="ادخل الغرفة").click()
    expect(b.locator(".lobby")).to_be_visible()
    expect(a.locator(".player-list li")).to_have_count(2)
    expect(b.get_by_text("بانتظار أبو فهد ليبدأ اللعب")).to_be_visible()
    shot(b, "05-lobby-guest", full=True)

    # 3) بدء المباراة والتزامن
    a.locator("[data-start]").click()
    expect(a.locator(".ttt-board")).to_be_visible()
    expect(b.locator(".ttt-board")).to_be_visible()
    expect(a.locator(".turn-line")).to_contain_text("دورك")
    expect(b.locator(".turn-line")).to_contain_text("دور أبو فهد")
    assert b.locator('.cell[data-i="4"]').is_disabled(), "guest must not be able to move first"

    tap(a, 0)
    expect(b.locator('.cell[data-i="0"]')).to_have_attribute("data-mark", "X")
    tap(b, 3)
    expect(a.locator('.cell[data-i="3"]')).to_have_attribute("data-mark", "O")
    tap(a, 1)
    expect(b.locator('.cell[data-i="1"]')).to_have_attribute("data-mark", "X")
    shot(b, "06-game-guest-turn")

    # 4) إعادة تحميل صفحة اللاعب الثاني أثناء اللعب — يجب أن يعود لنفس المقعد
    b.reload()
    expect(b.locator(".ttt-board")).to_be_visible()
    expect(b.locator('.cell[data-i="0"]')).to_have_attribute("data-mark", "X")
    expect(b.locator(".turn-line")).to_contain_text("دورك")
    tap(b, 4)
    expect(a.locator('.cell[data-i="4"]')).to_have_attribute("data-mark", "O")
    tap(a, 2)  # فوز X بالصف الأول

    # 5) النتائج
    expect(a.locator(".result-title")).to_have_text("فزت بالجولة!")
    expect(b.locator(".result-title")).to_have_text("خسرت هذه المرة")
    expect(a.locator(".win-line.show")).to_be_attached()
    expect(b.locator(".standings li").first).to_contain_text("أبو فهد")
    shot(a, "07-results-winner", full=True)
    shot(b, "08-results-loser", full=True)

    # 6) جولة أخرى: الخاسر يبدأ
    a.get_by_role("button", name="جولة أخرى").click()
    expect(b.locator(".turn-line")).to_contain_text("دورك")
    expect(a.locator(".round-label")).to_have_text("الجولة 2")
    tap(b, 4); expect(a.locator('.cell[data-i="4"]')).to_have_attribute("data-mark", "X")
    shot(a, "09-round2")

    # 7) تغيير اللعبة والعودة للانتظار، ثم المغادرة
    for cell, pg in [(0, a), (8, b), (1, a), (2, b), (6, a), (3, b), (5, a), (7, b)]:
        tap(pg, cell)
        pg.wait_for_timeout(120)
    expect(a.locator(".result-title")).to_be_visible()
    a.get_by_role("button", name="غيّر اللعبة").click()
    expect(b.locator(".lobby")).to_be_visible()
    b.once("dialog", lambda d: d.accept())
    b.locator(".leave-btn").click()
    expect(b.locator(".wordmark")).to_be_visible()
    expect(a.locator(".player-list li")).to_have_count(1)

    # 8) رابط غرفة غير موجودة
    b.goto(f"{BASE}/r/ZZZZZ")
    expect(b.get_by_text("الغرفة غير موجودة")).to_be_visible()
    shot(b, "10-room-not-found")

    # 9) الواجهة الإنجليزية وشاشة صغيرة
    small = browser.new_context(viewport={"width": 340, "height": 700}, is_mobile=True, has_touch=True)
    s = small.new_page(); watch(s, "S")
    s.goto(BASE)
    s.locator(".lang-btn").click()
    expect(s.locator("html")).to_have_attribute("dir", "ltr")
    shot(s, "11-home-en-small", full=True)
    overflow = s.evaluate("document.documentElement.scrollWidth > window.innerWidth")
    assert not overflow, "horizontal overflow on 340px"

    desk = browser.new_context(viewport={"width": 1280, "height": 860})
    d = desk.new_page(); watch(d, "D")
    d.goto(f"{BASE}/r/{code}")
    d.fill("input[name=nickname]", "خالد")
    d.get_by_role("button", name="ادخل الغرفة").click()
    expect(d.locator(".lobby")).to_be_visible()
    shot(d, "12-lobby-desktop", full=True)

    browser.close()

if errors:
    print("CONSOLE ERRORS:\n" + "\n".join(errors))
    sys.exit(1)
print("E2E OK — screenshots in", OUT)
