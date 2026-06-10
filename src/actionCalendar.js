export const currentActionCalendarVersion = '2026-06-10';

export const ACTION_CALENDAR = [
  {
    id: 'ruhiges-heimspiel',
    phase: 'Aktuell',
    title: 'Ruhiges Heimspiel',
    partner: 'Drutex Fokus',
    dateRange: '15.05.2026 - 19.07.2026',
    commercialWindow: '10 % Extra-Rabatt bis 14.07.2026; WM-Kommunikation bis zum Finale am 19.07.2026',
    timingNote: 'Die FIFA WM 2026 läuft vom 11.06. bis zum WM-Finale am 19.07.2026. Der bestehende Rabatt endet laut Aktionsbriefing am 14.07.2026.',
    scale: 'Laufende Kampagne',
    channels: ['Website', 'E-Mail', 'Social Media', 'Ads'],
    claim: 'Public Viewing draußen. Ruhe drinnen.',
    story: 'Fußballabende werden laut, das Zuhause bleibt der ruhige Rückzugsort. Moderne Fenster stehen für Komfort, bessere Planung und weniger störende Außengeräusche.',
    offer: '10 % Extra-Rabatt auf Drutex Fenster mit ausgewählten Profilen: IGLO 5, IGLO 5 Classic, IGLO 5 Energy, IGLO Energy Classic und IGLO Light. Keine Balkontüren.',
    designRules: [
      'Heller Wohnraum mit Fenster im Fokus, Fußball nur als dezenter Kontext.',
      'DFS-Dunkelblau für Headline/Struktur, Orange nur für Rabatt, Code oder CTA.',
      'Kein offizieller Turnierlook, keine Pokale, Logos, Trikots oder geschuetzten Elemente.',
      'Ruhige, hochwertige Bildsprache statt lauter Fanmeile.'
    ],
    wording: {
      do: [
        '10 % Extra-Rabatt auf Drutex Fenster mit ausgewählten Profilen.',
        'Neue Fenster können Außengeräusche reduzieren.',
        'Fensterliste vorbereiten und Aktion nutzen.'
      ],
      dont: [
        'Nicht "10 % auf alles" oder "10 % auf alle Fenster" schreiben.',
        'Keine absolute Ruhe oder garantierten Schallschutz versprechen.',
        'Keine FIFA-, WM- oder offizielle Turnieraktion behaupten.'
      ]
    },
    deliverables: ['Landingpage-/Banner-Update', 'Newsletter-Abschluss', 'Reel/Story-Set', 'Retargeting Ads'],
    commentPrompts: ['Welche Assets sind live?', 'Welche Anzeigen laufen?', 'Welche Landingpage-/CTA-Aenderung wurde gemacht?']
  },
  {
    id: 'foerderheld-energieberater',
    phase: 'Nächste große Aktion',
    title: 'Energieberater Aktion',
    partner: 'Deutscher Fenstershop x Förderheld',
    dateRange: '20.07.2026 - 14.09.2026',
    commercialWindow: 'Nach der WM als große Energie-/Förderheld-Aktion aufbauen; konkrete Förderbedingungen vor Livegang final prüfen.',
    timingNote: 'Start direkt nach dem WM-Finale, damit die Kommunikation sauber von Fußball/Komfort auf Energie, Sanierung und Beratung wechselt.',
    scale: 'Große Aktion',
    channels: ['Website', 'E-Mail', 'Social Media', 'Ads'],
    claim: 'Fenster planen. Energieberatung mitdenken.',
    story: 'Nach der WM wird aus Aufmerksamkeit ein Sanierungsimpuls: Wer neue Fenster plant, soll Energieeffizienz, Förderfähigkeit und Beratung früh mitdenken. Förderheld wird als Partner für Orientierung und Energieberater-Anbindung positioniert.',
    offer: 'Gemeinsame Aktionskommunikation Deutscher Fenstershop x Förderheld. Kein pauschales Förderversprechen; Fokus auf Beratung, Orientierung und saubere Projektvorbereitung.',
    designRules: [
      'Deutlich groesser und beratender als die Heimspiel-Aktion: Website-Hero, E-Mail-Header, Social-Serie und Ads muessen wie eine Hauptkampagne wirken.',
      'Visuelle Achse: modernes Zuhause, Fenster, Energieeffizienz, Beratungssituation, Dokumente/Checkliste; Förderheld dezent aber sichtbar als Partner nennen.',
      'Farbwelt DFS-Dunkelblau, Weiss, Hellgrau; Orange nur für CTA/Handlungsaufforderung; Förder-/Energie-Akzent mit Himmelblau oder Grün sehr sparsam.',
      'Keine Clipart-Fördergeld-Optik, keine Geldregen-Motive, keine unseriösen Vorher-nachher-Versprechen.',
      'Ads muessen schnell scannbar sein: Headline + Partnerzeile + ein konkreter Nutzen + CTA.'
    ],
    wording: {
      do: [
        'Fenster planen. Energieberatung mitdenken.',
        'Deutscher Fenstershop x Förderheld: Orientierung für Ihr Sanierungsprojekt.',
        'Energieberater früh einbinden und Fensterprojekt sauber vorbereiten.',
        'Prüfen lassen, welche energetischen Anforderungen für Ihr Projekt relevant sind.',
        'Neue Fenster frühzeitig mit Energieberatung und Projektplanung verbinden.'
      ],
      dont: [
        'Keine Förderzusage, keine garantierte Erstattung und keine festen Förderhöhen behaupten.',
        'Nicht schreiben: "Förderung sicher", "Geld garantiert" oder "wir sichern Ihnen die Förderung".',
        'Keine Angstkommunikation zu Heizkosten; kompetent, hilfreich und conversionstark bleiben.'
      ]
    },
    deliverables: [
      'Website-Aktionsmodul / Landingpage-Hero',
      'E-Mail-Kampagne mit Beratungsfokus',
      'Social Carousel: Fenster + Energieberatung',
      'Lead Ads / Search Ads / Retargeting',
      'FAQ-Modul zu Energieberater, Uw-Wert und Förderprüfung'
    ],
    commentPrompts: ['Wer hat welchen Kanal vorbereitet?', 'Welche Freigabe/Quelle fehlt noch?', 'Welche Ads oder Landingpage-Varianten sind live?']
  },
  {
    id: 'herbst-energie-check',
    phase: 'Folgephase',
    title: 'Herbst-Energie-Check',
    partner: 'DFS Beratung',
    dateRange: '15.09.2026 - 14.10.2026',
    commercialWindow: 'Energie- und Dichtungscheck als sachliche Herbstkampagne.',
    timingNote: 'Nach der Förderheld-Hauptaktion den Energiegedanken in Herbstplanung und Wohnkomfort uebersetzen.',
    scale: 'Mittlere Aktion',
    channels: ['Website', 'E-Mail', 'Social Media'],
    claim: 'Wenn es draußen kühler wird, zahlt sich gute Planung aus.',
    story: 'Dichtungen, Verglasung und rechtzeitige Fensterplanung als kompetente Vorbereitung auf Herbst und Heizperiode.',
    offer: 'Checklisten- und Beratungsaktion ohne neue Rabattbehauptung, solange keine separate Rabattfreigabe vorliegt.',
    designRules: [
      'Helle Herbststimmung, Fensterdetail, ruhige Innenraeume.',
      'Keine Panikbilder von Schimmel oder Heizkosten.',
      'Blau/Weiss als Kompetenzbasis, Orange nur für CTA.'
    ],
    wording: {
      do: ['Fenster rechtzeitig prüfen und Sanierung planen.', 'Dichtungen, Verglasung und Uw-Wert verständlich erklären.'],
      dont: ['Keine garantierte Ersparnis behaupten.', 'Keine unfreigegebenen Rabatte nennen.']
    },
    deliverables: ['Checklisten-Content', 'Newsletter', 'Blog-/FAQ-Teaser'],
    commentPrompts: ['Welche Checkliste ist freigegeben?', 'Welche Blog-/FAQ-Links sind eingebaut?', 'Welche Ads wurden pausiert oder weitergeführt?']
  },
  {
    id: 'heizkosten-klarheit',
    phase: 'Peak Herbst',
    title: 'Heizkosten Klarheit',
    partner: 'DFS Beratung',
    dateRange: '15.10.2026 - 14.11.2026',
    commercialWindow: 'Starker CTA-Monat für Energie, Angebot und Beratung.',
    timingNote: 'Vor Black Weeks den Beratungsnutzen schaerfen und Retargeting-Listen aktivieren.',
    scale: 'Starke Aktion',
    channels: ['Website', 'E-Mail', 'Social Media', 'Ads'],
    claim: 'Die teuersten Fenster sind oft die, die zu lange bleiben.',
    story: 'Heizkosten nicht dramatisieren, sondern alte Fenster als prüfbaren Sanierungshebel erklären.',
    offer: 'Beratung und Angebotsanfrage; Rabatt nur nennen, wenn separat freigegeben.',
    designRules: [
      'Klarer Energie- und Kostenkontext ohne Horror-Optik.',
      'Diagramm-/Checklisten-Elemente duerfen genutzt werden, aber reduziert.',
      'CTA prominent, Nutzen in maximal einem Satz.'
    ],
    wording: {
      do: ['Jetzt prüfen, ob neue Fenster für Ihr Zuhause sinnvoll sind.', 'Alte Fenster können Komfort und Energieeffizienz belasten.'],
      dont: ['Keine konkreten Euro-Ersparnisse ohne Quelle.', 'Keine Schockkampagne.']
    },
    deliverables: ['Retargeting Ads', 'Newsletter', 'Landingpage-Block'],
    commentPrompts: ['Welche Zielgruppen laufen?', 'Welche Claims sind freigegeben?', 'Welche Ergebnisse wurden beobachtet?']
  },
  {
    id: 'black-weeks-klare-angebote',
    phase: 'Jahresendgeschäft',
    title: 'Black Weeks, klare Angebote',
    partner: 'DFS Angebot',
    dateRange: '15.11.2026 - 14.12.2026',
    commercialWindow: 'Paket- oder Bonuslogik nur nach kommerzieller Freigabe.',
    timingNote: 'In der Black-Weeks-Zeit mit Klarheit statt Rabattnebel positionieren.',
    scale: 'Starke Aktion',
    channels: ['Website', 'E-Mail', 'Social Media', 'Ads'],
    claim: 'Klare Angebote statt Rabattnebel.',
    story: 'Wenige verstaendliche Vorteile, schnelle Orientierung, keine beliebige Prozentschlacht.',
    offer: 'Paket-/Bonus-Angebot erst nach Freigabe konkret nennen.',
    designRules: [
      'Kontrastreich, aber serioes; DFS-Blau als Stabilitaet.',
      'Maximal ein Angebots-Badge pro Motiv.',
      'Keine grelle Black-Friday-Optik.'
    ],
    wording: {
      do: ['Klare Fensterangebote für Ihre Sanierungsplanung.', 'Jetzt Projekt vorbereiten und Angebot anfragen.'],
      dont: ['Keine erfundenen Paketpreise.', 'Keine dauerhafte Rabattlogik suggerieren.']
    },
    deliverables: ['Angebotsmodul', 'E-Mail-Serie', 'Retargeting'],
    commentPrompts: ['Welche Pakete sind freigegeben?', 'Welche Landingpage-Version ist live?', 'Welche Mail wurde versendet?']
  },
  {
    id: 'winterblick-planung',
    phase: 'Planung',
    title: 'Winterblick & Planung 2027',
    partner: 'DFS Beratung',
    dateRange: '15.12.2026 - 14.01.2027',
    commercialWindow: 'Jahreswechsel-Kommunikation mit Planungsfokus.',
    timingNote: 'Zum Jahresende wird aus Aktion wieder Planungssicherheit.',
    scale: 'Planungsaktion',
    channels: ['Website', 'E-Mail', 'Social Media'],
    claim: 'Jetzt planen. 2027 entspannter modernisieren.',
    story: 'Ruhige Jahreswechsel-Kommunikation: Prioritaeten, Budget, Beratung und naechste Schritte.',
    offer: 'Planungs-Checkliste und Angebotsanfrage; keine Rabattbehauptung ohne Freigabe.',
    designRules: [
      'Wohnlich, hell, winterlich, aber nicht kitschig.',
      'Fensterblick, Planungsliste und Beratung als Motivachse.',
      'CTA klar, Text ruhig und knapp.'
    ],
    wording: {
      do: ['Modernisierung für 2027 frühzeitig vorbereiten.', 'Fensterprojekt strukturiert planen und Angebot anfragen.'],
      dont: ['Keine unklare Jahresend-Dringlichkeit.', 'Keine Rabatte ohne Freigabe.']
    },
    deliverables: ['Planungs-Checkliste', 'Newsletter', 'Social Reminder'],
    commentPrompts: ['Welche Planungshilfe ist fertig?', 'Welche Leads sollen nachgefasst werden?', 'Welche Inhalte bleiben für Januar?']
  }
];

export function createActionComment({
  actionId,
  author,
  channel,
  status,
  note,
  now = () => new Date(),
}) {
  const createdAt = now().toISOString();
  const safeIdDate = createdAt.replace(/[^0-9A-Za-z]/g, '-');
  return {
    id: `${actionId}-${safeIdDate}-${Math.random().toString(36).slice(2, 8)}`,
    actionId,
    author: String(author || '').trim() || 'Unbekannt',
    channel: String(channel || '').trim() || 'Allgemein',
    status: String(status || '').trim() || 'Notiz',
    note: String(note || '').trim(),
    createdAt,
  };
}
