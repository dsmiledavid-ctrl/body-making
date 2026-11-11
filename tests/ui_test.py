"""Browser test with a fake camera. Usage:
  python3 tests/ui_test.py <import.json> <customer-id-to-scan> <fake.y4m> <shots-dir>
Serves the app locally, restores the backup, scans the fake QR, checks in."""
import json, subprocess, sys, time, os
from playwright.sync_api import sync_playwright

imp, cid, y4m, shots = sys.argv[1:5]
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8765', '--bind', '127.0.0.1'], cwd=root,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
errors = []

def slide(pg, sel):
    box = pg.locator(sel + ' .slider-knob').bounding_box()
    track = pg.locator(sel).bounding_box()
    pg.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
    pg.mouse.down()
    for k in range(1, 11):
        pg.mouse.move(box['x'] + box['width'] / 2 + (track['width'] - box['width']) * k / 10, box['y'] + box['height'] / 2)
    pg.mouse.up()

try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
                                    f'--use-file-for-fake-video-capture={y4m}'])
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                            permissions=['camera'], is_mobile=True, has_touch=True)
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
        pg.on('dialog', lambda d: d.accept())
        outside = []
        pg.on('request', lambda r: (not r.url.startswith(('http://127.0.0.1', 'data:', 'blob:'))) and outside.append(r.url))
        pg.goto('http://127.0.0.1:8765/')
        pg.screenshot(path=f'{shots}/01-empty.png')
        # restore backup through the real UI
        pg.click('text=設定')
        with pg.expect_file_chooser() as fc:
            pg.click('text=バックアップから復元')
        fc.value.set_files(imp)
        pg.wait_for_selector('#modal:not([hidden]) .slider', timeout=5000)
        assert pg.evaluate('window.__bm.db.customers.length') == 0, 'restored before the slide!'
        slide(pg, '#modal .slider')
        pg.wait_for_timeout(500)
        n = pg.evaluate('window.__bm.db.customers.length')
        assert n > 0, 'restore failed'
        # practice mode: scanning and tapping Check in must save NOTHING
        n_att, n_ses = pg.evaluate('[window.__bm.db.attendance.length, window.__bm.db.sessions.length]')
        pg.click('text=スキャンを試す')
        pg.wait_for_selector('#scanCard:not([hidden])', timeout=10000)
        pg.screenshot(path=f'{shots}/02a-practice.png')
        pg.click('#scanCard .btn.big')
        pg.wait_for_timeout(300)
        print('PRACTICE:', pg.inner_text('#scanCard').replace('\n', ' | '))
        print('ENGINE (read by / active):', pg.evaluate('window.__bm.engine()'))
        assert pg.evaluate('[window.__bm.db.attendance.length, window.__bm.db.sessions.length]') == [n_att, n_ses], 'practice saved data!'
        # photo mode (still practice): a blurred, turned photo of the card must be read
        photo = os.path.join(os.path.dirname(y4m), 'photo.jpg')
        subprocess.check_call([sys.executable, os.path.join(root, 'tests', 'make_qr_photo.py'), cid, photo])
        if pg.locator('#scanCard:not([hidden])').count(): pg.click('#scanCard .btn >> nth=0')
        with pg.expect_file_chooser() as fc2:            # click within the 3 s same-card pause
            pg.click('#scanPhoto')
        fc2.value.set_files(photo)
        pg.wait_for_selector('#scanCard:not([hidden]) .btn.big', timeout=10000)
        print('PHOTO:', pg.inner_text('#scanCard').replace('\n', ' | ')[:80])
        print('DIAG:', pg.inner_text('#scanDiag'))
        pg.screenshot(path=f'{shots}/02b-photo.png')
        pg.click('#scanCard .btn.ghost')
        pg.click('#scanClose')
        pg.click('#nav button >> nth=0')
        pg.screenshot(path=f'{shots}/02-today.png')
        before = pg.evaluate('window.__bm.db.attendance.length')
        # a short tap/drag must NOT start the class
        pg.click('#app .slider .slider-knob'); pg.wait_for_timeout(400)
        assert pg.locator('#scanner[hidden]').count() == 1, 'tap started the class!'
        slide(pg, '#app .slider')
        pg.wait_for_selector('#scanCard:not([hidden])', timeout=10000)
        pg.screenshot(path=f'{shots}/03-scanned.png')
        card = pg.inner_text('#scanCard')
        print('CARD:', card.replace('\n', ' | '))
        pg.click('#scanCard .btn.big')
        pg.wait_for_timeout(300)
        pg.screenshot(path=f'{shots}/04-success.png')
        after = pg.evaluate('window.__bm.db.attendance.length')
        assert after == before + 1, f'check-in not saved {before}->{after}'
        # same card again: must show "already checked in", never a dead end
        pg.wait_for_timeout(6500)
        pg.wait_for_selector('#scanCard:not([hidden])', timeout=10000)
        again = pg.inner_text('#scanCard')
        print('RESCAN:', again.replace('\n', ' | '))
        assert '済み' in again
        pg.screenshot(path=f'{shots}/05-rescan.png')
        pg.click('#scanCard .btn')
        pg.click('#scanClose')
        pg.screenshot(path=f'{shots}/06-today-after.png')
        # persisted across reload
        pg.reload(); pg.wait_for_timeout(500)
        assert pg.evaluate('window.__bm.db.attendance.length') == after, 'not persisted'
        pg.click('#nav button >> nth=1'); pg.screenshot(path=f'{shots}/07-customers.png')
        pg.click('.seg button >> nth=1'); pg.screenshot(path=f'{shots}/07b-bundles.png')
        pg.click('.seg button >> nth=2'); pg.screenshot(path=f'{shots}/07c-classes.png')
        n_ses = pg.evaluate('window.__bm.db.sessions.length')
        pg.click('#app .x >> nth=0'); pg.wait_for_selector('#modal:not([hidden]) .slider')
        pg.screenshot(path=f'{shots}/07d-slide-delete.png')
        pg.click('#modal .slider-knob'); pg.wait_for_timeout(300)   # tap: must not delete
        assert pg.evaluate('window.__bm.db.sessions.length') == n_ses, 'tap deleted!'
        slide(pg, '#modal .slider'); pg.wait_for_timeout(400)
        assert pg.evaluate('window.__bm.db.sessions.length') == n_ses - 1, 'slide did not delete'
        print('SLIDE DELETE: ok')
        pg.click('.seg button >> nth=1'); pg.click('#app .list .item >> nth=0'); pg.screenshot(path=f'{shots}/08-customer.png', full_page=True)
        pg.click('#app .list .item >> nth=0'); pg.wait_for_selector('#modal:not([hidden]) #bwindow')
        pg.fill('#bwindow', '14'); pg.click('#modal .btn.primary'); pg.wait_for_timeout(200)
        assert '14' in pg.inner_text('#app'), 'bundle extend not shown'
        pg.screenshot(path=f'{shots}/08b-customer-after-edit.png')
        # an active bundle blocks selling another one (its clock would start too early)
        n_b = pg.evaluate('window.__bm.db.bundles.length')
        pg.click('text=回数券を販売'); pg.wait_for_timeout(300)
        assert pg.evaluate('window.__bm.db.bundles.length') == n_b, 'sold a second bundle while one is active'
        print('SELL BLOCKED:', pg.inner_text('#toast')[:40])
        pg.click('text=利用状況を送る'); pg.wait_for_selector('#rtext')
        print('REPORT JA:', pg.input_value('#rtext').replace('\n', ' / ')[:160])
        pg.screenshot(path=f'{shots}/08c-report.png')
        pg.click('#modal .seg button >> nth=1')
        print('REPORT EN:', pg.input_value('#rtext').replace('\n', ' / ')[:160])
        pg.click('#modal .btn.ghost')
        # check-in outside the scanner on a day with no class must ASK before recording a class date
        pg.evaluate("""() => { const t = new Date(); const iso = t.getFullYear() + '-' + String(t.getMonth()+1).padStart(2,'0') + '-' + String(t.getDate()).padStart(2,'0');
            const d = JSON.parse(localStorage.getItem('bm.db')); d.sessions = d.sessions.filter(s => s.date !== iso); localStorage.setItem('bm.db', JSON.stringify(d)); }""")
        pg.reload(); pg.wait_for_timeout(400)
        n_s, n_a = pg.evaluate('[window.__bm.db.sessions.length, window.__bm.db.attendance.length]')
        pg.click('#nav button >> nth=1'); pg.click('#app .list .item >> nth=0')            # first customer (no bundle)
        pg.click('#app .btn.big.primary'); pg.click('#modal .btn.big.primary')            # sell bundle & check in
        pg.wait_for_selector('#modal:not([hidden]) .slider'); pg.wait_for_timeout(200)
        assert pg.evaluate('[window.__bm.db.sessions.length, window.__bm.db.attendance.length]') == [n_s, n_a], 'recorded a class without asking'
        pg.screenshot(path=f'{shots}/08d-start-first.png')
        slide(pg, '#modal .slider'); pg.wait_for_timeout(400)
        assert pg.evaluate('[window.__bm.db.sessions.length, window.__bm.db.attendance.length]') == [n_s + 1, n_a + 1], 'slide did not record'
        print('ASK BEFORE CLASS: ok')
        pg.click('#nav button >> nth=0'); pg.click('text=手動でチェックイン'); pg.screenshot(path=f'{shots}/09-manual.png')
        pg.click('#nav button >> nth=2'); pg.click('text=English'); pg.click('#nav button >> nth=0'); pg.screenshot(path=f'{shots}/10-today-en.png')
        # missed-class reminder: pretend the last saved class was 3 weeks ago
        pg.evaluate("""() => { const d = JSON.parse(localStorage.getItem('bm.db'));
            const cut = new Date(Date.now() - 21*86400000).toISOString().slice(0,10);
            d.sessions = d.sessions.filter(s => s.date <= cut); localStorage.setItem('bm.db', JSON.stringify(d)); }""")
        pg.reload(); pg.wait_for_selector('#modal:not([hidden]) input[type=checkbox]', timeout=5000)
        boxes = pg.locator('#modal input[type=checkbox]').count()
        print('REMINDER: asks about', boxes, 'dates')
        assert boxes >= 2
        pg.screenshot(path=f'{shots}/11-reminder.png')
        pg.locator('#modal input[type=checkbox]').first.check()
        pg.click('#modal .btn.primary')
        pg.reload(); pg.wait_for_timeout(500)
        assert pg.locator('#modal:not([hidden])').count() == 0, 'reminder came back after answering'
        pg.screenshot(path=f'{shots}/12-today-logo.png')
        print('OUTSIDE REQUESTS:', outside or 'none')
        assert not outside, 'app contacted an outside server'
        b.close()
finally:
    srv.terminate()
print('errors:', errors or 'none')
print('UI TEST PASSED' if not errors else 'UI TEST HAD ERRORS')
