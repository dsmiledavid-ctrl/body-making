# STATE — Body Making check-in

_Last updated 2026-11-10 (session 1, from the Office desk)._

## Where it stands
- v1.0.0 built and tested (8 rule tests + full browser run with fake camera: scan → check in →
  rescan shows "already checked in", data survives reload).
- Hosting: GitHub Pages, public repo `dsmiledavid-ctrl/body-making`.
- NOT yet on Marei's phone. AppSheet still the live system.

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
