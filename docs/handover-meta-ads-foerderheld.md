# Handover: 3 Meta-Ads-Kampagnen — Deutscher Fenstershop x Förderheld

> Für die nächste Session. Selbsterklärend — kein Vorwissen aus der Banner-Session nötig. Repo: `~/fenster-price-radar` (Welt A, CLAUDE.md lesen).

## Auftrag (Elvis, 17.07.2026)
Drei verschiedene **Meta-Ads-Kampagnen** (Facebook + Instagram) für den Kunden **deutscher-fenstershop.de** konzipieren und die kompletten Kampagnen-Pakete vorbereiten. Budget: **500 € monatlich** (siehe offene Fragen). Conversion-Ziel: Interessenten füllen ein **Kontaktformular** aus. Thema: **Fensterlisten bzw. Sanierungspläne einreichen — Fenster und Türen**, mit dem Förder-USP der laufenden Förderheld-Kooperation.

### Erwartete Deliverables je Kampagne (3x)
1. Kampagnen-Konzept: Zielgruppe/Targeting-Vorschlag, Funnel-Logik (kalt/warm/Retargeting-Split bietet sich als die „3 verschiedenen" an), Budget-Aufteilung, Laufzeit-Empfehlung.
2. Ad-Copy: Primärtexte (je 2-3 Varianten), Headlines, Beschreibungen — Meta-Zeichenlimits beachten.
3. Creatives: aus dem fertigen Asset-Fundus wählen und/oder neue via Skill `dfs-kampagnen-design` generieren (Formate: Feed 1080x1080, Story/Reel 1080x1920 vorhanden; ggf. 1200x628 ergänzen).
4. Lead-Formular-Definition: Felder (Vorschlag: Name, PLZ, E-Mail/Telefon, „Fensterliste/Sanierungsplan vorhanden?" als Qualifizierung, Upload-Hinweis), Datenschutz-Hinweis, Danke-Screen mit nächstem Schritt.
5. Messplan: UTM-Konvention `utm_campaign=foerderheld-bafa-2026` (siehe Dossier), Ereignisse/Lead-Weiterleitung an DFS.

## Offene Fragen an Elvis (VOR dem Bauen klären)
- 500 €/Monat **gesamt** über alle 3 Kampagnen oder **je** Kampagne?
- Kontaktformular = **Meta Instant Form** (Lead Ads, direkt in der App — empfohlen für Fensterlisten-Mechanik) oder Formular auf deutscher-fenstershop.de (dann: welche URL/Landingpage)?
- Läuft die Schaltung über Elvis' Ads-Konto oder das des Kunden? (Nur Konzept + Assets vorbereiten — nichts selbst schalten.)
- Gilt der Aktions-Störer „Bis 15.08.: Geld zurück für jede erfolgreiche Förderung" auch für Meta?

## Pflicht-Kontext (in dieser Reihenfolge laden/lesen)
1. **Skill `dfs-kampagnen-design`** (`.claude/skills/dfs-kampagnen-design/SKILL.md`) — das komplette Creative-Playbook: Codex-Voll-Generierung (nie SVG-Look/Komposition), Stil-Anker, Logo-Composite-Regeln (weiße Variante `tools/banner-maker/out/_logo-weiss.png` auf dunkel, `src/Logo-Freigestellt.png` auf hell), Sichtprüfung, Auslieferungs-Muster.
2. **Kampagnendossier** `docs/kampagne-foerderheld-bafa.md` — Fakten, Wording-Do/Dont, Disclaimer, FAQ, 4-Schritte-Kundenreise.
3. **Session-Memory** `bilder-via-codex` (Projekt-Memory) — Bilder IMMER über Elvis' Codex generieren, nie Higgsfield.

## Harte Leitplanken (aus der Banner-Session, nicht verhandelbar)
- Zuschuss-Kommunikation: **„bis zu 15 %"** (Beispiel: 20.000 € → bis zu 3.000 €). Kein „garantiert/sicher", keine Festbeträge ohne „bis zu".
- **Kein „BAFA"** auf Werbemitteln (im Formular/der Landingpage ok). Keine Behörden-Optik.
- Reihenfolge-Mechanik nie verletzen: **erst Antrag (über Förderheld), dann bestellen** — Ads dürfen nicht „kaufen, dann Förderung" suggerieren.
- „Deutschlands schnellster Förderservice" nur verwenden, wenn Elvis die Förderheld-Bestätigung hat (Stand Handover: **noch offen** — nachfragen).
- Belegte Zahlen statt Superlative: 5 Min Antrag, 2 Min Fördercheck, 24 h Einreichung, Auszahlung 8–12 Wochen (Angabe Förderheld).
- Fenster-Produktfokus: Wir verkaufen Fenster/Türen — die Förderung ist das Feature.

## Vorhandene Assets (sofort nutzbar)
- **Download-Seite (öffentlich, Agentur-Link):** https://srv1332950.hstgr.cloud/assets/foerderheld/ — 11 Google-Banner, 2 Quadrat-Motive (1080²), 2 IG-Karussells (Blaupause 5 Slides / Foto 3 Slides), 4 Stories (1080x1920), alles mit konsistentem Logo, plus Gesamt-ZIP.
- Lokal: `tools/banner-maker/out/foerderheld-final/` + `.../foerderheld-instagram/` (gitignored). VPS-Quelle: nexus-host `/var/www/foerderheld-assets/`.
- Claude-Ansichtsgalerie (Elvis-intern geteilt): Artifact 57fb5cf5-6402-496a-9f83-f3510c570514 — bei Updates DENSELBEN Dateipfad republishen (Link muss stabil bleiben): `<scratchpad>/foerderheld-assets-extern.html`-Muster neu bauen.
- Copy-Bausteine: Hooks „Jetzt bares Geld sparen" / „Fensterliste schicken, Antrag ausfüllen und Förderung erhalten" / „Kein lästiger Papierkram — wir kümmern uns um alles" / Formel „Günstige Fenster + schnelle Förderung = Mehr Geld für dich." · Triple-USP „Maximale Förderung / Kein Papierkram / Kein Risiko" · CTA „Jetzt Förderhöhe in 2 Min checken".

## Arbeitsregeln
Welt A, Branch main, path-scoped Commits, Push nur mit Elvis-Go. VPS-Schreibzugriff (Assets nachschieben) braucht Elvis-Go. Neue Kampagnen-Doku nach `docs/`. Nichts selbst bei Meta schalten — Elvis übernimmt die Schaltung.

---

## Copy-Paste-Prompt für die nächste Session

```
Lies zuerst docs/handover-meta-ads-foerderheld.md (komplett) und lade den Skill dfs-kampagnen-design.

Auftrag: Bereite 3 verschiedene Meta-Ads-Kampagnen (Facebook + Instagram) für deutscher-fenstershop.de vor — Förderheld-Kampagne, 500 € Monatsbudget, Conversion-Ziel Kontaktformular (Fensterliste/Sanierungsplan einreichen, Fenster & Türen). Kläre zuerst die 4 offenen Fragen aus dem Handover mit mir, dann liefere pro Kampagne: Konzept + Targeting + Budgetaufteilung, Ad-Copy in Meta-Limits, Creative-Zuordnung aus dem vorhandenen Fundus (plus fehlende Formate via Codex generieren), Lead-Formular-Definition und Messplan. Compliance-Leitplanken aus dem Handover sind hart.
```
