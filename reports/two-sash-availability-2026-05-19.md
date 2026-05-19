# Two-sash availability gate — 2026-05-19

Rule: do not infer 2-flg availability from 1-flg catalog rows. A 2-flg row is published only when at least two providers return valid, equivalent live configurations with matching layout proof.

## Published 2-flg Pfosten rows

- Drutex · Iglo 5 Classic, 3fach · 1000x1200
  - DFS: valid, combined result bucket for window type 6 / group 92
  - Fensterblick: valid, `Typ:2-Flügel`, `Öffnung:Dreh-Kipp + Dreh-Kipp (Pfosten)`, 500/500 sash widths
  - Fensterversand: not equivalent / not published

- Salamander · Salamander 76MD, 3fach · 1000x1200
  - DFS: valid, combined result bucket for window type 6 / group 92
  - Fensterblick: valid, `Typ:2-Flügel`, `Öffnung:Dreh-Kipp + Dreh-Kipp (Pfosten)`, 500/500 sash widths
  - Fensterversand: not equivalent / not published

## Checked but not published

The remaining Fensterradar profile families were generated as candidates and priced, but failed the strict gate because fewer than two providers had proven equivalent 2-flg Pfosten rows or because provider mappings/labels were unavailable:

- Aluplast Ideal 4000
- Aluplast Ideal 5000
- Aluplast Ideal 7000
- Aluplast Ideal 8000
- Drutex Iglo Energy Classic
- Gealan S8000
- Gealan S9000
- Kömmerling 70
- Kömmerling 88
- Salamander 82
- Veka 82 MD

## Stulp

Stulp remains blocked. DFS and Fensterversand do not yet provide enough proven combined-unit/selected-option evidence in the current implementation. Stulp must not be shown until the equivalence proof passes.
