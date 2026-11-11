# Body Making check-in

A small phone app for Marei's Body Making class: scan a customer's QR card,
check them in, sell bundles and single tickets. Replaces the old AppSheet app.

- **Runs entirely on the phone.** No server, no Google. Data is saved in the
  phone's browser storage for this web address only.
- **Install:** open the link in Safari → Share → *Add to Home Screen*. Always
  open it from that icon (Home-Screen apps are exempt from Safari's 7-day data wipe).
- **Backups:** Settings → *Save backup* (share to iCloud Drive / LINE).
  *Restore from backup* loads a file back. Updating the app never touches the data.
- **This repo is public and contains no customer data.** Backups and imports
  are never committed (`.gitignore`).

## Rules (kept from AppSheet)
A bundle = 10 tickets to use within 12 class dates (both editable in Settings).
Every class date after the bundle starts counts against the 12, attended or not.
Tickets left = whichever runs out first.

## Development
- `node tests/logic.test.js` — the rules
- `python3 tests/ui_test.py <backup.json> <customer-id> <fake.y4m> <shots-dir>` —
  full browser run with a fake camera (`node tests/make_fake_camera.js <id> <out.y4m>`)
- `python3 tools/sheet2import.py <tracker.xlsx> <out.json>` — convert the old
  AppSheet Google Sheet into a backup file. Output holds names: keep it out of the repo.
- Release: bump `APP_VERSION` in `app.js` **and** `CACHE` in `sw.js`, push.

Libraries (vendored): jsQR (Apache-2.0), qrcode-generator (MIT), zxing-wasm reader (MIT; Apache-2.0 ZXing-C++).
