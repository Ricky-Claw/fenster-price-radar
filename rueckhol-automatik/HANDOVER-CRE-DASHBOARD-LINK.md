# Handover: Direktlink/Button zur Rückhol-Automatik-Steuerung

Für die Session, die den Button/Link im Kunden-Cockpit (`/kunden/dfs`) baut.

## Ziel-URLs

- Live-Instanz: `https://rueckhol.schwarzwald-agent.de`
- Login: `https://rueckhol.schwarzwald-agent.de/login` (Formular, POST)
- Dashboard (Steuerung): `https://rueckhol.schwarzwald-agent.de/dashboard/`
- Health/Version: `GET /api/health`

## Auth

Eigenständiges Dashboard-Passwort (kein SSO, kein Token-Login von außen).
Session per HMAC-signiertem Cookie nach `/login`. **Kein Deep-Link mit
eingebettetem Passwort/Token bauen** — Passwort liegt nur in
`/etc/rueckhol-automatik/service.env` auf dem VPS (`FENSTER_RADAR_PASSWORD`),
nie in Code/Chat/Repo.

Empfohlener Button: einfacher `<a target="_blank" href="https://rueckhol.schwarzwald-agent.de/login">`.
Elvis loggt sich einmal manuell ein, Cookie hält die Session danach.

## Site-Auswahl im Dashboard

Kein `?site=`-Query-Param zum Vorauswählen implementiert — das Dashboard
wählt die erste vorhandene Site automatisch. DFS' `siteId` ist `dfs`.
Falls ein Deep-Link direkt auf DFS vorausgewählt gewünscht ist: eigenes
Ticket, aktuell nicht gebaut.

## Falls stattdessen ein Token-Login gewünscht wird

Aktuell nicht vorhanden. Machbar wäre ein kurzlebiger signierter Link
(`auth.sessionCookie()`-Helper existiert bereits serverseitig), aber das
ist neue Arbeit — bitte in `fenster-price-radar`-Session anfragen, nicht
selbst im Schwarzwald-Repo nachbauen.

## Quelle

Kanonisches Repo: `~/fenster-price-radar/rueckhol-automatik/` (GitHub
Ricky-Claw/fenster-price-radar). Diese Datei liegt dort, nicht im
Schwarzwald-Repo.
