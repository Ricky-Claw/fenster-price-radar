# Two-sash availability gate — 2026-05-19

Rule: do not infer 2-flg availability from 1-flg catalog rows. A 2-flg row is published only when at least two providers return valid, equivalent live configurations with matching layout proof.

## Published rows

- 23 proven wide 2-flg Pfosten rows
- 19 proven wide 2-flg Stulp rows (`Dreh-Kipp + Dreh`)
- Total: 42 two-sash rows

## Proof sources

- DFS: combined result bucket for `window_type_id=6`; Pfosten uses `stulp=0`, Stulp uses `stulp=1` and profile-specific hidden combined group ids.
- Fensterblick: labels prove `Typ:2-Flügel` plus `Dreh-Kipp + Dreh-Kipp (Pfosten)` or `Dreh-Kipp + Dreh (Stulp)` and equal sash widths.
- Fensterversand: parameter proof integrated:
  - Pfosten: `parameters[2]=22`, `parameters[130]=[1,1]`
  - Stulp DK+Dreh: `parameters[2]=2+1`, `parameters[130]=[2,3]`

## Current limitations

- Stulp is modeled as `Dreh-Kipp + Dreh` only; the mirrored `Dreh + Dreh-Kipp` variant can be added separately if desired.
- Salamander 76MD Stulp failed the DFS combined-bucket gate and is not published.
- Other profile families still fail the strict proof gate: Drutex Iglo Energy Classic, Gealan S8000/S9000, Kömmerling 70/88, Salamander 82, Veka 82 MD.
