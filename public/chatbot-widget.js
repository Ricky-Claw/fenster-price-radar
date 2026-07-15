(function(){
  const currentScript = document.currentScript || [...document.scripts].find(s => /chatbot-widget\.js/.test(s.src));
  const scriptUrl = currentScript?.src ? new URL(currentScript.src, window.location.href) : new URL(window.location.href);
  const apiBase = (currentScript?.dataset.apiUrl || scriptUrl.origin).replace(/\/$/, '');
  const endpoint = `${apiBase}/api/chatbot`;
  const title = currentScript?.dataset.title || 'Janela';
  const accent = currentScript?.dataset.accent || '#004b93';
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

  const style = document.createElement('style');
  style.textContent = `
    .dfs-chatbot-button{position:fixed;right:22px;bottom:22px;z-index:2147483000;border:0;border-radius:999px;background:${accent};color:#fff;font:800 15px system-ui;padding:14px 18px;box-shadow:0 12px 34px #001b3f33;cursor:pointer}
    .dfs-chatbot{position:fixed;right:22px;bottom:84px;z-index:2147483000;width:380px;max-width:calc(100vw - 28px);height:560px;max-height:calc(100vh - 110px);background:#fff;border:1px solid #dbe4ee;border-radius:22px;box-shadow:0 20px 70px #001b3f33;display:none;overflow:hidden;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#17263a}
    .dfs-chatbot.open{display:flex;flex-direction:column}.dfs-chatbot header{background:${accent};color:#fff;padding:16px 18px;display:flex;justify-content:space-between;align-items:center}.dfs-chatbot header b{font-size:16px}.dfs-chatbot header button{background:transparent;color:#fff;border:0;font-size:24px;cursor:pointer}
    .dfs-chatbot-log{flex:1;overflow:auto;padding:16px;background:#f6f9fc;display:flex;flex-direction:column;gap:10px}.dfs-msg{border-radius:16px;padding:11px 13px;line-height:1.38;font-size:14px;white-space:pre-wrap}.dfs-msg.user{align-self:flex-end;background:${accent};color:#fff;max-width:86%}.dfs-msg.bot{align-self:flex-start;background:#fff;border:1px solid #e3ebf3;max-width:92%}.dfs-links{display:grid;gap:6px;margin-top:8px}.dfs-links a{color:${accent};font-weight:800;text-decoration:none}.dfs-privacy{font-size:12px;color:#687789;padding:10px 14px;background:#fff7ec;border-top:1px solid #f1d6b5}.dfs-chatbot form{display:flex;gap:8px;padding:12px;border-top:1px solid #e3ebf3;background:#fff}.dfs-chatbot textarea{flex:1;resize:none;border:1px solid #dbe4ee;border-radius:14px;padding:10px;font:14px system-ui;height:44px}.dfs-chatbot form button{border:0;border-radius:14px;background:${accent};color:#fff;font-weight:900;padding:0 14px;cursor:pointer}.dfs-chiprow{display:flex;flex-wrap:wrap;gap:6px}.dfs-chip{border:1px solid #dbe4ee;background:#fff;border-radius:999px;padding:7px 9px;font-size:12px;cursor:pointer;color:#26384d}
    @media(max-width:520px){.dfs-chatbot{right:14px;bottom:76px;height:70vh}.dfs-chatbot-button{right:14px;bottom:14px}}
  `;
  document.head.appendChild(style);

  const button = document.createElement('button');
  button.className = 'dfs-chatbot-button';
  button.textContent = 'Chat starten';
  const panel = document.createElement('section');
  panel.className = 'dfs-chatbot';
  panel.innerHTML = `<header><b>${escapeHtml(title)}</b><button type="button" aria-label="Schließen">×</button></header><div class="dfs-chatbot-log"></div><div class="dfs-privacy">Bitte keine Bestellnummern, Adressen, Zahlungsdaten oder Fotos im Chat senden.</div><form><textarea placeholder="Ihre Frage…" aria-label="Chatnachricht"></textarea><button type="submit">Senden</button></form>`;
  document.body.append(button, panel);
  const log = panel.querySelector('.dfs-chatbot-log');
  const form = panel.querySelector('form');
  const input = panel.querySelector('textarea');
  const close = panel.querySelector('header button');

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
  button.onclick=()=>{panel.classList.add('open'); if(!log.dataset.started){addMessage('bot', pageContext.greeting); addChips(pageContext.chips); log.dataset.started='1';}};
  close.onclick=()=>panel.classList.remove('open');
  form.onsubmit=(event)=>{event.preventDefault(); ask();};
})();
