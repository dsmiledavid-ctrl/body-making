# Body Making check-in — working notes for Claude

Marei's class check-in app (she scans at the door, iPhone, Japanese-first).
Imre reports problems in plain words; Claude diagnoses and fixes. Read `STATE.md` first.

- **Public repo, private data.** Never commit customer names, backups, imports, CSVs.
  Diagnose from a backup file Imre hands over (keep it in the session scratchpad).
- **The URL must never change** (GitHub Pages origin = where the phone's data lives).
  Renaming the repo or moving hosts would strand Marei's data on the old address.
- Every release: bump `APP_VERSION` (app.js) + `CACHE` (sw.js); run both tests.
- Japanese wording: Marei is the judge; Claude's Japanese is a draft.
