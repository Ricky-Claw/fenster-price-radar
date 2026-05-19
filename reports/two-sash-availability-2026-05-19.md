# Two-sash availability gate — 2026-05-19

Rule: do not infer 2-flg availability from 1-flg catalog rows. A 2-flg row is published only when at least two providers return valid, equivalent live configurations with matching layout proof.

## Published 2-flg Pfosten rows

17 proven rows are live:

- Drutex · Iglo 5 Classic, 3fach: 1000x1200, 1200x1600
- Aluplast · Ideal 4000, 3fach: 900x1300, 1200x1500, 1400x1900
- Aluplast · Ideal 5000, 3fach: 900x1300, 1200x1500, 1400x1900
- Aluplast · Ideal 7000, 3fach: 900x1300, 1200x1500, 1400x1900
- Aluplast · Ideal 8000, 3fach: 900x1300, 1200x1500, 1400x1900
- Salamander · Salamander 76MD, 3fach: 1000x1200, 1100x1700, 1400x1900

Each row passed:

- DFS: valid combined result bucket for `window_type_id=6` and the profile-specific Pfosten group
- Fensterblick: valid `Typ:2-Flügel` + `Öffnung:Dreh-Kipp + Dreh-Kipp (Pfosten)` + equal sash widths
- Fensterversand: not used for truth until selected-option labels can be proven

## Checked but not published

Small sizes failed because two-sash minimum dimensions were not valid or one provider adjusted/rejected them. Other profile families still fail the strict two-provider proof gate:

- Drutex Iglo Energy Classic
- Gealan S8000
- Gealan S9000
- Kömmerling 70
- Kömmerling 88
- Salamander 82
- Veka 82 MD

## Stulp

Stulp remains blocked. DFS and Fensterversand do not yet provide enough proven combined-unit/selected-option evidence in the current implementation. Stulp must not be shown until the equivalence proof passes.
