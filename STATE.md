# STATE — Body Making check-in

_Last updated 2026-11-10 (session 1, from the Office desk)._

## Where it stands
- v1.1.0 (2026-11-10): castle logo + icons, single-ticket button removed (Imre: Marei never enters singles),
  missed-class reminder (no class saved >14 days → tick which usual-weekday dates happened; asked on open).
- Tested: 12 rule tests + full browser run with fake camera (scan → check in → rescan "already checked in",
  reload persistence, reminder appears + stays answered).
  rescan shows "already checked in", data survives reload).
- Hosting: GitHub Pages, public repo `dsmiledavid-ctrl/body-making`.
- 2026-11-10 evening: v1.1.1 on Marei's iPhone (Home Screen), history restored (9 customers) — confirmed by Imre.
  Restore needed v1.1.1 fix: iOS file picker must be attached to the DOM (CONFIRMED on device).
  Camera scan on the real iPhone: NOT yet confirmed. AppSheet still exists as fallback.

- v1.2.0 (2026-11-10): blue theme (light-blue page, dark-blue buttons, red = main action; Marei's ask via Imre),
  practice scan in Settings (saves nothing), clear Edit button, sell bundle without check-in, edit/extend/delete
  a bundle, add class date by hand, Customers tab now has 3 views: People · Bundles (soonest to end) · Classes.
- v1.3.0 (2026-11-11): "Send usage report" on each customer page — numbers only (Imre: Marei writes the
  greeting), Japanese/English choice, Copy + share. Bundle counts now ignore check-ins of another customer:
  the AppSheet data had ONE such row (a 2026-09-30 check-in linked to a different customer's bundle; IDs had
  been hand-typed). Verified: no effect on anyone's tickets left, so the row was left as is.
- v1.4.0 (2026-11-11): Imre's first real camera test (CORRECTED 11-11: it was on his Samsung, NOT the iPhone —
  Claude had assumed iPhone): camera opened, QR shown, NOTHING happened (no read).
  Cause UNKNOWN. Changes: alternate full-detail centre crop / whole frame, inversion tries, 1920x1080 request,
  beep + green flash on read, practice-mode counter (camera size + frames checked) to diagnose, hint "20-30 cm".
  NOTE: the previous version ALSO read a synthetic far-away card in the browser test, so the test does not prove
  the fix; real blur/focus can't be simulated. Next real test decides. Slide-to-start-class added (tap does nothing).
- v1.5.0 (2026-11-11): slides (Imre-approved list) for delete customer, delete bundle, restore backup,
  delete class date, delete a check-in. Check in / Sell bundle at the scanner stay taps (speed; Undo exists).
- v1.5.1 (2026-11-11): updates were held back (Imre's Android install stuck on 1.3): GitHub Pages sends
  max-age=600 and Android resumes instead of reloading. Fix: service worker fetches with cache:'no-cache',
  registers with updateViaCache:'none', checks for updates whenever the app comes to the front; Settings
  has "Update to the latest version".
- v1.6.0 (2026-11-11): live scan failed AGAIN on Imre's Samsung (v1.5.1) (all failures were on that one phone); cause still
  UNKNOWN (no diag line reported yet). Added: Android built-in QR reader (BarcodeDetector) when available,
  continuous autofocus where allowed, camera switch (multi-lens phones, remembered), "Read from photo"
  (native camera app photo → decode; reads a blurred/rotated synthetic photo in tests), status line on
  every scan screen (lens · resolution · frames · engine), "Test picture" (practice) to send Claude a frame.
- 2026-11-11 ~01:00: v1.6.0 live scan WORKED on Imre's Samsung with no changes (he reported). v1.5.1 (improved
  jsQR) had failed there → evidence that jsQR is too weak on real camera frames (engine word on his status line
  not reported, so "native reader did it" is inferred, not confirmed).
- v1.7.0: ZXing (zxing-wasm reader, bundled, .wasm served from this site; test asserts no outside requests)
  replaces jsQR where no native reader (= iPhone). Synthetic blur bench: jsQR 2/10, ZXing 4/10; heavy blur
  beats both → photo mode. iPhone: the web app has NEVER been scanned with (Imre, 11-11); AppSheet's
  scanner worked on it, but AppSheet is a native app, so that says nothing about the web app.
- PROPOSED, not built: payment step when selling a bundle (cash / bank transfer details / Revolut) — waiting on Imre's answers.

## Why it exists (Imre, 2026-11-10)
AppSheet app was ugly, had mislabeled confirmations, Imre couldn't maintain it, Marei sometimes
couldn't scan anyone after the first person, and Imre had to hand-edit the sheet to add attendance.
Diagnosis (inferred from the AppSheet export, not observed): the only way back to the scanner was the
"Confirm attendance" button, hidden when a customer was already checked in or had no tickets → dead end.

## Switch-over plan
1. Imre/Marei install it (Safari → Add to Home Screen) and try it.
2. After the last AppSheet class: Claude re-pulls the Google Sheet, runs tools/sheet2import.py,
   Marei restores that file once. From then on the sheet/AppSheet stop updating.

## Open
- Marei to proofread the Japanese.
- Camera permission may be re-asked each time the app opens (iOS home-screen apps) — watch.
- Old QR cards encode the CustomerID directly → they keep working.
