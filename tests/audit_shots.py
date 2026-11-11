"""Screenshot every screen (for design review). Usage:
  python3 tests/audit_shots.py <backup.json> <out-dir> [chromium|webkit]"""
import subprocess, sys, time, os, socket
from playwright.sync_api import sync_playwright
imp, out = sys.argv[1:3]
engine = sys.argv[3] if len(sys.argv) > 3 else 'chromium'
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.makedirs(out, exist_ok=True)
sock = socket.socket(); sock.bind(('127.0.0.1', 0)); PORT = sock.getsockname()[1]; sock.close()
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=root,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
errors = []
try:
    with sync_playwright() as p:
        b = getattr(p, engine).launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=(engine == 'chromium'), has_touch=True)
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('dialog', lambda d: d.accept())
        pg.goto(f'http://127.0.0.1:{PORT}/')
        pg.wait_for_timeout(600)
        # restore through the test hook (faster than the UI here)
        pg.evaluate("""(txt) => { const d = JSON.parse(txt).data; localStorage.setItem('bm.db', JSON.stringify(d)); }""", open(imp).read())
        pg.reload(); pg.wait_for_timeout(600)
        def shot(name, full=False):
            pg.wait_for_timeout(350)
            pg.screenshot(path=f'{out}/{name}.png', full_page=full)
        nav = lambda i: pg.click(f'#nav button >> nth={i}')
        shot('01-today')
        nav(1); shot('02-people', True)
        pg.click('.seg button >> nth=1'); shot('03-bundles', True)
        pg.click('.seg button >> nth=2'); shot('04-classes')
        pg.click('.seg button >> nth=1'); pg.click('#app .list .item >> nth=0'); shot('05-customer', True)
        pg.evaluate("window.__bm.go('customers')"); pg.click('#app .list .item >> nth=0'); shot('06-customer-nobundle', True)
        nav(0); pg.click('text=手動でチェックイン'); shot('07-manual', True)
        pg.click('#app .list .item >> nth=0'); shot('08-manual-sheet')
        pg.evaluate("document.querySelector('#modal').hidden = true")
        nav(2); shot('09-settings', True)
        b.close()
finally:
    srv.terminate()
print('errors:', errors or 'none')
