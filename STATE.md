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
