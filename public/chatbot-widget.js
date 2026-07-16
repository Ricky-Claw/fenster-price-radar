(function(){
  const currentScript = document.currentScript || [...document.scripts].find(s => /chatbot-widget\.js/.test(s.src));
  const scriptUrl = currentScript?.src ? new URL(currentScript.src, window.location.href) : new URL(window.location.href);
  const apiBase = (currentScript?.dataset.apiUrl || scriptUrl.origin).replace(/\/$/, '');
  const endpoint = `${apiBase}/api/chatbot`;
  const title = currentScript?.dataset.title || 'Janela';
  // DFS-Design (deutscher-fenstershop.de): Orange #F47C26 als Aktion, Navy #003A66 als Kopf, Arial, eckige Ecken (Radius 4-10px).
  const accent = currentScript?.dataset.accent || '#F47C26';
  const navy = currentScript?.dataset.navy || '#003A66';
  const sessionKey = 'dfs_chatbot_session';
  if (!localStorage.getItem(sessionKey)) localStorage.setItem(sessionKey, crypto.randomUUID?.() || String(Date.now()));
  const turnKey = 'dfs_chatbot_turn';

  const PAGE_CONTEXTS = [
    { key: 'konfigurator', match: /konfigurator/, greeting: 'Hallo, ich bin Janela. Ich sehe, Sie sind gerade im Konfigurator – ich helfe bei der Konfiguration, technischen Begriffen oder leite an die richtige Abteilung weiter.', chips: ['Hilfe beim Konfigurator', 'Uw-Wert erklären', 'Technische Frage stellen'] },
    { key: 'versand', match: /versand|lieferzeit/, greeting: 'Hallo, ich bin Janela. Für Fragen rund um Lieferung und Versand bin ich hier richtig.', chips: ['Lieferzeit erfahren', 'Lieferung heute?', 'Lieferadresse ändern'] },
    { key: 'reklamation', match: /reklamation/, greeting: 'Hallo, ich bin Janela. Bei Reklamationen helfe ich Ihnen zum passenden Formular.', chips: ['Reklamation melden', 'Transportschaden melden'] },
    { key: 'kontakt', match: /kontakt|anfrage|callback/, greeting: 'Hallo, ich bin Janela. Ich helfe Ihnen, die Anfrage auf den richtigen Weg zu bringen.', chips: ['Anfrage senden', 'Montage-Frage'] },
    { key: 'wissen', match: /wissenswertes|fensterbegriffe|erklaervideo|profilschnitte/, greeting: 'Hallo, ich bin Janela. Ich erkläre gerne Fachbegriffe und technische Fragen.', chips: ['Fachbegriff erklären', 'Technische Frage stellen'] },
  ];
  const DEFAULT_CONTEXT = { key: 'standard', greeting: 'Hallo, ich bin Janela! Ich helfe bei allgemeinen Fragen zu Lieferung, Reklamation, Konfigurator, Montage, Aufmaß und technischen Begriffen.', chips: ['Lieferzeit?', 'Bestellstatus', 'Transportschaden', 'Konfigurator Hilfe', 'Uw-Wert erklären'] };

  // ponytail: einfache Teilstring-Suche reicht für die bekannten DFS-URLs; kein Router nötig.
  // Kein Node-Unit-Test dafür (Widget ist DOM-only Single-File-Embed) — verifiziert über
  // die Kacheln in public/janela-chatbot-test.html im Browser.
  function contextForPath(path) {
    const p = String(path || '').toLowerCase();
    return PAGE_CONTEXTS.find((c) => c.match.test(p)) || DEFAULT_CONTEXT;
  }
  const pageContext = contextForPath(currentScript?.dataset.page || (window.location.pathname + window.location.hash));

  const font = "Arial, 'Helvetica Neue', Helvetica, sans-serif";
  const style = document.createElement('style');
  style.textContent = `
    .dfs-chatbot-button{position:fixed;right:22px;bottom:22px;z-index:2147483000;border:0;border-radius:6px;background:${accent};color:#fff;font:700 15px ${font};padding:13px 20px;box-shadow:0 10px 28px rgba(0,27,63,.28);cursor:pointer;letter-spacing:.2px}
    .dfs-chatbot-button:hover{background:#e06a1c}
    .dfs-chatbot{position:fixed;right:22px;bottom:84px;z-index:2147483000;width:384px;max-width:calc(100vw - 28px);height:576px;max-height:calc(100vh - 110px);background:#fff;border:1px solid #d5deea;border-radius:10px;box-shadow:0 24px 70px rgba(0,27,63,.3);display:none;overflow:hidden;font-family:${font};color:#17263a}
    .dfs-chatbot.open{display:flex;flex-direction:column}
    .dfs-chatbot header{background:${navy};color:#fff;padding:15px 18px;display:flex;justify-content:space-between;align-items:center}
    .dfs-chatbot header .dfs-head-title{display:flex;align-items:center;gap:9px}
    .dfs-chatbot header .dfs-avatar{width:30px;height:30px;border-radius:50%;background:${accent};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;color:#fff}
    .dfs-chatbot header b{font-size:16px;font-weight:700}
    .dfs-chatbot header small{display:block;font-size:11px;opacity:.8;font-weight:400}
    .dfs-chatbot header button{background:transparent;color:#fff;border:0;font-size:26px;line-height:1;cursor:pointer;padding:0 2px}
    .dfs-chatbot-log{flex:1;overflow:auto;padding:16px;background:#f4f7fb;display:flex;flex-direction:column;gap:10px}
    .dfs-msg{border-radius:10px;padding:11px 13px;line-height:1.4;font-size:14px;white-space:pre-wrap;box-shadow:0 1px 2px rgba(0,27,63,.06)}
    .dfs-msg.user{align-self:flex-end;background:${accent};color:#fff;max-width:86%;border-bottom-right-radius:3px}
    .dfs-msg.bot{align-self:flex-start;background:#fff;border:1px solid #e0e7f1;max-width:92%;border-bottom-left-radius:3px}
    .dfs-links{display:grid;gap:6px;margin-top:8px}
    .dfs-links a{color:${navy};font-weight:700;text-decoration:none}
    .dfs-links a:hover{text-decoration:underline}
    .dfs-links span{font-size:13px}
    .dfs-privacy{font-size:12px;color:#6a5a44;padding:9px 14px;background:#fff7ec;border-top:1px solid #f1d6b5}
    .dfs-chatbot form{display:flex;gap:8px;padding:11px;border-top:1px solid #e0e7f1;background:#fff;align-items:flex-end}
    .dfs-chatbot textarea{flex:1;resize:none;border:1px solid #cfd9e6;border-radius:6px;padding:10px;font:14px ${font};height:44px;color:#17263a}
    .dfs-chatbot textarea:focus{outline:none;border-color:${navy};box-shadow:0 0 0 3px rgba(0,58,102,.12)}
    .dfs-icon-btn{border:1px solid #cfd9e6;border-radius:6px;background:#fff;width:44px;height:44px;flex:0 0 auto;cursor:pointer;display:flex;align-items:center;justify-content:center;color:${navy};padding:0}
    .dfs-icon-btn:hover{background:#f0f4f9}
    .dfs-icon-btn.recording{background:#e5342c;border-color:#e5342c;color:#fff;animation:dfsPulse 1.1s ease-in-out infinite}
    .dfs-icon-btn[hidden]{display:none}
    @keyframes dfsPulse{0%,100%{box-shadow:0 0 0 0 rgba(229,52,44,.5)}50%{box-shadow:0 0 0 6px rgba(229,52,44,0)}}
    .dfs-send{border:0;border-radius:6px;background:${accent};color:#fff;font-weight:700;font-family:${font};height:44px;padding:0 16px;cursor:pointer;flex:0 0 auto}
    .dfs-send:hover{background:#e06a1c}
    .dfs-miclive{font-size:11px;color:#6a7686;padding:0 14px 8px;background:#fff;min-height:0}
    .dfs-chiprow{display:flex;flex-wrap:wrap;gap:6px}
    .dfs-chip{border:1px solid #cfd9e6;background:#fff;border-radius:6px;padding:7px 10px;font-size:12px;cursor:pointer;color:${navy};font-family:${font};font-weight:600}
    .dfs-chip:hover{background:#f0f4f9;border-color:${navy}}
    @media(max-width:520px){.dfs-chatbot{right:14px;bottom:76px;height:72vh}.dfs-chatbot-button{right:14px;bottom:14px}}
  `;
  document.head.appendChild(style);

  const MIC_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';

  const button = document.createElement('button');
  button.className = 'dfs-chatbot-button';
  button.textContent = 'Chat starten';
  const panel = document.createElement('section');
  panel.className = 'dfs-chatbot';
  const initial = escapeHtml(title).trim().charAt(0).toUpperCase() || 'J';
  panel.innerHTML = `<header><div class="dfs-head-title"><span class="dfs-avatar">${initial}</span><span><b>${escapeHtml(title)}</b><small>Ihr Fenster-Assistent</small></span></div><button type="button" aria-label="Schließen">×</button></header><div class="dfs-chatbot-log"></div><div class="dfs-miclive" hidden></div><div class="dfs-privacy">Bitte keine Bestellnummern, Adressen, Zahlungsdaten oder Fotos im Chat senden.</div><form><textarea placeholder="Ihre Frage…" aria-label="Chatnachricht"></textarea><button type="button" class="dfs-icon-btn dfs-mic" aria-label="Per Sprache eingeben" title="Per Sprache eingeben" hidden>${MIC_SVG}</button><button type="submit" class="dfs-send">Senden</button></form>`;
  document.body.append(button, panel);
  const log = panel.querySelector('.dfs-chatbot-log');
  const form = panel.querySelector('form');
  const input = panel.querySelector('textarea');
  const close = panel.querySelector('header button');
  const micBtn = panel.querySelector('.dfs-mic');
  const micLive = panel.querySelector('.dfs-miclive');

  function escapeHtml(value){return String(value||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function addMessage(role, text, meta){
    const msg = document.createElement('div');
    msg.className = `dfs-msg ${role}`;
    msg.innerHTML = escapeHtml(text).replace(/\n/g,'<br>');
    if (meta?.links?.length || meta?.contacts?.length) {
      const links = document.createElement('div');
      links.className = 'dfs-links';
      for (const link of meta.links || []) links.insertAdjacentHTML('beforeend', `<a href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">${escapeHtml(link.label || link.url)}</a>`);
      for (const contact of meta.contacts || []) links.insertAdjacentHTML('beforeend', `<span><b>${escapeHtml(contact.label)}:</b> ${escapeHtml(contact.value)}</span>`);
      msg.appendChild(links);
    }
    log.appendChild(msg); log.scrollTop = log.scrollHeight;
  }
  function addChips(list){
    const row=document.createElement('div'); row.className='dfs-chiprow';
    list.forEach(text=>{
      const chip=document.createElement('button'); chip.type='button'; chip.className='dfs-chip'; chip.textContent=text; chip.onclick=()=>ask(text); row.appendChild(chip);
    });
    log.appendChild(row);
  }
  async function ask(text){
    const clean = String(text || input.value || '').trim(); if(!clean) return;
    input.value=''; addMessage('user', clean); addMessage('bot','Ich prüfe das kurz…');
    const loading = log.lastElementChild;
    const turn = Number(localStorage.getItem(turnKey) || 0) + 1;
    localStorage.setItem(turnKey, String(turn));
    try{
      const res = await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:clean,sessionId:localStorage.getItem(sessionKey),turn})});
      const data = await res.json();
      loading.remove(); addMessage('bot', data.answer || 'Keine sichere Antwort gefunden.', data);
    }catch(error){ loading.remove(); addMessage('bot','Ich bin gerade nicht erreichbar. Bitte versuchen Sie es später erneut.'); }
  }

  // Spracheingabe über die Browser-Web-Speech-API (gleiches Muster wie Aufmaß per Sprache,
  // kein Backend nötig). Nur einblenden, wenn der Browser SpeechRecognition kann.
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR) {
    let recognition = null;
    let recording = false;
    let baseText = '';
    micBtn.hidden = false;

    function setLive(text){ micLive.hidden = !text; micLive.textContent = text || ''; }
    function stopUi(){ recording = false; micBtn.classList.remove('recording'); setLive(''); }

    micBtn.addEventListener('click', () => {
      if (recording) { try { recognition.stop(); } catch(e){} return; }
      recognition = new SR();
      recognition.lang = 'de-DE';
      recognition.continuous = true;
      recognition.interimResults = true;
      baseText = input.value ? input.value.replace(/\s*$/, '') + ' ' : '';
      recognition.onresult = (event) => {
        let finalText = '', interim = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const r = event.results[i];
          if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript;
        }
        if (finalText) baseText += finalText + ' ';
        input.value = (baseText + interim).trimStart();
        setLive(interim.trim() ? '… hört zu: ' + interim.trim() : '… hört zu');
      };
      recognition.onerror = (event) => {
        const err = event && event.error;
        if (err === 'not-allowed' || err === 'service-not-allowed') setLive('Mikrofon-Zugriff nicht erlaubt. Bitte im Browser erlauben.');
        else setLive('');
        stopUi();
      };
      recognition.onend = () => { stopUi(); input.focus(); };
      recording = true;
      micBtn.classList.add('recording');
      micBtn.setAttribute('aria-label', 'Aufnahme stoppen');
      setLive('… hört zu');
      try { recognition.start(); } catch(e){ stopUi(); }
    });
  }

  button.onclick=()=>{panel.classList.add('open'); if(!log.dataset.started){addMessage('bot', pageContext.greeting); addChips(pageContext.chips); log.dataset.started='1';}};
  close.onclick=()=>panel.classList.remove('open');
  form.onsubmit=(event)=>{event.preventDefault(); ask();};
})();
