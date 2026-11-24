/* =====================================================================
   VOZ · micrófono, confirmaciones y ejecución de las órdenes
   Funciona con el micrófono (Chrome/Edge) y SIEMPRE con el cuadro de texto,
   así también sirve sin internet o en un lugar con ruido.
   ===================================================================== */
const VC = { handlers: {} };
(() => {
  const SRc = window.SpeechRecognition || window.webkitSpeechRecognition;
  const V = {
    open: false, listening: false, speaking: false, src: 'text', log: [], pending: null, interim: '',
    local: { state: 'unknown', lang: '' }, micOK: false, lastUndo: null, cmdText: '', gotFinal: false, errShown: false,
    lang: 'es-EC', forceLocal: false, rec: null, voice: null,
  };
  const vcfg = () => cfg().voice;

  /* ---------- utilidades ---------- */
  const sayMoney = n => {
    n = r2(n); const d = Math.floor(n + 1e-9), c = Math.round((n - d) * 100);
    return `${d} ${d === 1 ? 'dólar' : 'dólares'}${c ? ` con ${c} centavos` : ''}`;
  };
  const spokenText = t => String(t).replace(/\$\s?(\d+(?:\.\d+)?)/g, (m, x) => sayMoney(parseFloat(x))).replace(/[«»·→—]/g, ' ').replace(/\s+/g, ' ');
  const unitWord = (u, n) => { const w = UNITS[u] || 'unidad'; return n === 1 ? w : (w === 'unidad' ? 'unidades' : w + 's'); };
  const cap = s => String(s).replace(/\S+/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
  const WLB = { lb: 1, kg: 2.20462, g: 0.00220462 };
  const convertQty = (q, from, to) => (!from || from === to || !WLB[from] || !WLB[to]) ? q : Math.round(q * WLB[from] / WLB[to] * 1000) / 1000;
  const qtyTxt = (q, p) => `${qtyFmt(q)}${FRACTIONAL.has(p.unit) ? ' ' + unitWord(p.unit, q) + ' de' : ''} ${p.name}`;
  const ctx = () => ({ products: activeProducts(), customers: customers(), bank: S.mv.bank || 'pichincha', cartCount: S.cart.length, owners: owners(), today: today() });
  const parse = text => VNLU.parse(text, ctx());
  const parseAmount = text => { const a = VNLU.amountFrom(VNLU.lex(text)); return a > 0 ? a : undefined; };
  const parseQty = text => { const n = VNLU.lex(text).find(x => x.t === 'n'); return n && n.v > 0 ? n.v : undefined; };
  const bankFromText = text => { const s = VNLU.strip(text); return /pichinch/.test(s) ? 'pichincha' : /guayaq|guaya/.test(s) ? 'guayaquil' : null; };
  const eachSeq = (arr, step, done) => { let i = 0; const next = () => { if (i >= arr.length) return done(); step(arr[i++], next); }; next(); };

  /* ---------- registro de la conversación ---------- */
  function addLog(who, text, o = {}) { V.log.push({ who, text, kind: o.kind || '', html: !!o.html }); if (V.log.length > 40) V.log.shift(); }
  function say(text, o = {}) {
    addLog('bot', text, o);
    if (V.src === 'voice' && vcfg().speak !== false && o.speak !== false) speak(o.spoken || text, o.expect);
    else if (o.expect && V.src === 'voice') scheduleListen();
    render();
  }

  /* ---------- voz que responde ---------- */
  function pickVoice() {
    if (V.voice) return V.voice;
    try {
      const vs = speechSynthesis.getVoices();
      V.voice = vs.find(v => /^es[-_](EC|MX|US|419|CO|AR|PE|CL)/i.test(v.lang)) || vs.find(v => /^es/i.test(v.lang)) || null;
    } catch (e) { }
    return V.voice;
  }
  function speak(text, expect) {
    if (!('speechSynthesis' in window)) { if (expect) scheduleListen(); return; }
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(spokenText(text));
      const v = pickVoice(); if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'es-ES';
      let ended = false;
      const end = () => { if (ended) return; ended = true; V.speaking = false; renderState(); if (expect) scheduleListen(); else if (vcfg().handsFree && V.open && !V.stopped && !V.listening) { clearTimeout(V._hf); V._hf = setTimeout(() => { if (V.open && !V.listening && !V.speaking && !V.stopped) listen({ auto: true }); }, 450); } };
      u.onstart = () => { V.speaking = true; renderState(); };
      u.onend = end; u.onerror = end;
      speechSynthesis.speak(u);
      setTimeout(end, 14000);
    } catch (e) { if (expect) scheduleListen(); }
  }
  function scheduleListen() {
    if (!V.open || !V.pending || !SRc) return;
    if (vcfg().auto === false || !V.micOK) return;
    clearTimeout(V._lt);
    V._lt = setTimeout(() => { if (V.open && V.pending && !V.listening && !V.speaking) listen({ auto: true }); }, 250);
  }
  async function checkMic() {
    try {
      const p = await navigator.permissions.query({ name: 'microphone' });
      V.micOK = p.state === 'granted';
      p.onchange = () => { V.micOK = p.state === 'granted'; };
    } catch (e) { }
  }

  /* ---------- reconocimiento de voz ---------- */
  async function probeLocal(force) {
    if (V.local.state !== 'unknown' && !force) return V.local;
    const res = { state: 'unsupported', lang: '' };
    try {
      if (SRc && typeof SRc.available === 'function' && 'processLocally' in SRc.prototype) {
        res.state = 'unavailable';
        for (const lang of ['es-EC', 'es-419', 'es-MX', 'es-US', 'es-ES']) {
          let st = 'unavailable';
          const tmo = pr => Promise.race([pr, new Promise(r => setTimeout(() => r('unavailable'), 4000))]);
          try { st = await tmo(SRc.available({ langs: [lang], processLocally: true })); } catch (e) { try { st = await tmo(SRc.available([lang], true)); } catch (e2) { } }
          if (st === 'available') { res.state = 'available'; res.lang = lang; break; }
          if ((st === 'downloadable' || st === 'downloading') && res.state !== 'downloadable') { res.state = st; res.lang = lang; }
        }
      }
    } catch (e) { }
    V.local = res;
    try { vcfg().localCache = res.state === 'available' ? { state: 'available', lang: res.lang } : null; saveCfg(); } catch (e) { }
    refreshSettings();
    return res;
  }
  const syncLocal = () => { if (V.local.state === 'unknown' && vcfg().localCache) V.local = Object.assign({ state: 'unknown', lang: '' }, vcfg().localCache); };
  const wantLocal = () => { syncLocal(); return V.local.state === 'available' && (V.forceLocal || navigator.onLine === false || vcfg().preferLocal === true); };

  function noEngine() {
    say('Este navegador no tiene reconocimiento de voz (usa Google Chrome o Microsoft Edge). Mientras tanto, escribe la orden aquí abajo.', { kind: 'warn', speak: false });
    $('#vp-in')?.focus();
  }
  function listen(o = {}) {
    if (!SRc) return noEngine();
    if (V.listening) return stop();
    V.stopped = false;
    try { speechSynthesis.cancel(); } catch (e) { }
    syncLocal();
    if (navigator.onLine === false && V.local.state === 'unknown') { probeLocal().then(() => listen(o)); return; }
    const local = wantLocal();
    if (navigator.onLine === false && !local) {
      say(V.local.state === 'downloadable'
        ? 'No hay internet y la voz sin internet aún no está descargada (Ajustes → Voz). Escribe la orden aquí abajo.'
        : 'No hay internet: el micrófono lo necesita. Escribe la orden aquí abajo; todo lo demás funciona igual.', { kind: 'warn', speak: false });
      $('#vp-in')?.focus();
      return;
    }
    const rec = new SRc();
    rec.lang = local ? (V.local.lang || 'es-ES') : V.lang;
    rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 4;
    if (local) rec.processLocally = true;
    V.gotFinal = false; V.errShown = false; V.interim = '';
    rec.onstart = () => { V.listening = true; V.micOK = true; renderState(); renderLog(); };
    rec.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          if (V.gotFinal) continue;
          V.gotFinal = true;
          const alts = []; for (let k = 0; k < r.length; k++) alts.push(r[k].transcript);
          V.interim = '';
          submit(alts[0], 'voice', alts);
          try { rec.stop(); } catch (er) { }
        } else interim += r[0].transcript;
      }
      if (interim) { V.interim = interim; renderLog(); }
    };
    rec.onerror = e => {
      const code = e.error;
      if (code === 'aborted') return;
      if (code === 'no-speech') { if (!o.auto) { V.errShown = true; say('No te escuché. Toca el micrófono y habla otra vez.', { kind: 'warn', speak: false }); } return; }
      V.errShown = true;
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        say(`El micrófono está bloqueado. Toca el candado junto a la dirección de la página y elige «Permitir» en Micrófono.${location.protocol === 'file:' ? ' (Si abres el archivo directo, el navegador pregunta cada vez: pulsa Permitir.)' : ''} Mientras, puedes escribir la orden.`, { kind: 'bad', speak: false });
      } else if (code === 'audio-capture') {
        say('No encuentro un micrófono en este equipo. Escribe la orden aquí abajo.', { kind: 'bad', speak: false });
      } else if (code === 'language-not-supported' && V.lang !== 'es-ES') {
        V.lang = 'es-ES'; V.errShown = false; setTimeout(() => listen(o), 50);
      } else if (code === 'network') {
        syncLocal();
        if (!local && V.local.state === 'unknown') { probeLocal().then(() => { if (V.local.state === 'available') { V.forceLocal = true; listen(o); } else say('No pude conectarme para reconocer la voz (¿sin internet?). Escribe la orden aquí abajo o descarga la voz sin internet en Ajustes → Voz.', { kind: 'warn', speak: false }); }); }
        else if (!local && V.local.state === 'available') { V.forceLocal = true; V.errShown = false; setTimeout(() => listen(o), 50); }
        else say('No pude conectarme para reconocer la voz (¿sin internet?). Escribe la orden aquí abajo o descarga la voz sin internet en Ajustes → Voz.', { kind: 'warn', speak: false });
      } else say('No pude usar el micrófono (' + code + '). Escribe la orden aquí abajo.', { kind: 'warn', speak: false });
    };
    rec.onend = () => {
      V.listening = false; V.interim = ''; V.rec = null;
      if (!V.gotFinal && !V.errShown && !o.auto && !vcfg().handsFree) say('No te escuché. Toca el micrófono y habla otra vez.', { kind: 'warn', speak: false });
      renderState(); renderLog();
      // modo manos libres: sigue escuchando mientras el panel esté abierto (hasta tocar el micrófono, cerrar o Esc)
      if (vcfg().handsFree && V.open && !V.stopped && !V.errShown) { clearTimeout(V._hf); V._hf = setTimeout(() => { if (V.open && !V.listening && !V.speaking && !V.stopped) listen({ auto: true }); }, 500); }
    };
    V.rec = rec;
    try { rec.start(); } catch (e) { V.listening = false; say('No pude iniciar el micrófono. Intenta de nuevo.', { kind: 'warn', speak: false }); }
  }
  function stop() { V.stopped = true; clearTimeout(V._hf); try { V.rec && V.rec.stop(); } catch (e) { } V.listening = false; renderState(); }

  /* ---------- preguntas al usuario ---------- */
  function confirmQ(o) {
    V.pending = Object.assign({ kind: 'confirm' }, o);
    const t = String(typeof o.title === 'function' ? o.title() : o.title).replace(/[.\s]+$/, '');
    const q = /\?$/.test(t) ? t : `${t}. ¿Confirmas?`;
    say(q, { expect: true, spoken: o.spoken ? o.spoken() : q });
  }
  function chooseQ(o) {
    V.pending = Object.assign({ kind: 'choose' }, o);
    const sp = `${o.title} ` + o.options.map((x, i) => `${i + 1}: ${x.label}.`).join(' ') + ' Dime el número.';
    say(o.title, { expect: true, spoken: sp });
  }
  function askQ(o) {
    V.pending = Object.assign({ kind: 'ask' }, o);
    say(o.title, { expect: true });
  }
  async function answerPending(text) {
    const p = V.pending; if (!p) return false;
    const r = parse(text);
    const done = async fn => { V.pending = null; await fn(); return true; };
    if (p.kind === 'confirm') {
      if (r.intent === 'yes') return done(() => p.onYes());
      if (r.intent === 'no') return done(async () => { if (p.onNo) await p.onNo(); else say('Listo, no hice nada.'); });
      if (p.adjust && await p.adjust(text, r)) return true;
      if (r.intent === 'unknown' || r.intent === 'empty') { say('No te entendí. Di «sí» para confirmar o «no» para cancelar.', { expect: true }); return true; }
      V.pending = null; addLog('bot', 'Cancelé la pregunta anterior.'); return false;
    }
    if (p.kind === 'choose') {
      let idx = VNLU.ordinal(text);
      if (idx == null) {
        const c = VNLU.matchProducts(VNLU.textTokens(text), p.options.map((x, i) => ({ id: i, name: x.label })));
        if (c.length && c[0].score >= 0.7 && (c.length === 1 || c[0].score - c[1].score >= 0.1)) idx = c[0].id + 1;
      }
      if (idx != null && idx >= 1 && idx <= p.options.length) return done(() => p.onPick(p.options[idx - 1].value));
      if (r.intent === 'no') return done(async () => { if (p.onCancel) await p.onCancel(); else say('Listo.'); });
      if (r.intent === 'unknown' || r.intent === 'empty' || r.intent === 'yes') { say('Di el número de la opción (1, 2, 3…) o tócala.', { expect: true }); return true; }
      V.pending = null; if (p.onCancel) await p.onCancel(); return false;
    }
    if (p.kind === 'ask') {
      if (r.intent === 'no' && !(p.zeroOK && !/\b(cancela|cancelar|olvidalo|detente|salir)\b/.test(VNLU.strip(text)))) return done(async () => { if (p.onCancel) await p.onCancel(); else say('Listo.'); });
      const v = p.parse(text, r);
      if (v !== undefined && v !== null) return done(() => p.onValue(v));
      if (r.intent === 'unknown' || r.intent === 'empty') { say(p.retry || ('No te entendí. ' + p.title), { expect: true }); return true; }
      V.pending = null; if (p.onCancel) await p.onCancel(); return false;
    }
    return false;
  }

  /* ---------- entrada principal ---------- */
  async function submit(text, src = 'text', alts = []) {
    text = String(text || '').trim(); if (!text) return;
    if (src !== 'tap') V.src = src;
    addLog('you', text); render();
    try {
      const gateOn = !$('#gate').hidden;
      if (gateOn && !cfg().setupDone) { say('Primero termina de configurar el sistema (nombre, PIN y dueños).', { kind: 'warn' }); return; }
      if (V.pending && await answerPending(text)) { render(); return; }
      V.cmdText = text;
      let r = parse(text);
      if (r.intent === 'unknown' && alts.length > 1) for (const a of alts.slice(1)) { const r2_ = parse(a); if (r2_.intent !== 'unknown') { r = r2_; break; } }
      // con la pantalla de abrir caja delante solo se puede abrir/cerrar la caja o pedir ayuda
      if (gateOn && !['open_caja', 'close_caja', 'help', 'yes', 'no', 'empty'].includes(r.intent)) { say('Primero hay que abrir la caja. Di, por ejemplo: «abre la caja» o «abre la caja igual que ayer».', { kind: 'warn', spoken: 'Primero hay que abrir la caja. Di: abre la caja.' }); return; }
      await dispatch(r, text);
    } catch (err) { console.error(err); say('Ocurrió un error: ' + err.message, { kind: 'bad', speak: false }); }
    render();
  }

  const needCaja = () => { if (curSession()) return true; say('La caja está cerrada. Ábrela primero con el botón «Abrir caja».', { kind: 'warn' }); return false; };
  const voiceAudit = (action, summary, o = {}) => audit(action + ' (por voz)', `${summary}. Dijo: «${o.said || V.cmdText || ''}»`, o);
  const setUndo = (label, fn) => { V.lastUndo = { label, fn }; };

  async function dispatch(r, text) {
    // se guarda lo que se dijo para armar la venta, así el historial muestra la orden completa y no solo «cobrar»
    if (['sale', 'sale_received', 'sale_remove', 'sale_price'].includes(r.intent)) { if (!S.cart.length) V.saleSaid = []; (V.saleSaid = V.saleSaid || []).push(text); if (V.saleSaid.length > 8) V.saleSaid.shift(); }
    if (VC.handlers[r.intent]) return VC.handlers[r.intent](r, text);
    switch (r.intent) {
      case 'empty': return;
      case 'yes': case 'no': return say('No hay nada pendiente por confirmar.');
      case 'help': return showHelp();
      case 'undo': return doUndo();
      case 'open_caja': if (curSession()) return say('La caja ya está abierta.'); ACT['open-gate'](); return say('Cuenta el dinero, escríbelo y pulsa «ABRIR CAJA E INICIAR».');
      case 'nav': return doNav(r.view);
      case 'sale': return doSale(r);
      case 'sale_received': return doReceived(r.received);
      case 'sale_remove': return doRemove(r);
      case 'sale_cancel': return doCancelSale();
      case 'sale_hold': if (!S.cart.length) return say('No hay una venta para dejar en espera.', { kind: 'warn' }); ACT['pos-hold'](); return say('Venta en espera. Atiende al siguiente cliente.', { kind: 'ok' });
      case 'sale_price': return doPrice(r);
      case 'q_total': return qTotal();
      case 'mv': return doMv(r);
      case 'mv_multi': return say('Dime una operación a la vez. Por ejemplo: «retiro 20 pichincha».', { kind: 'warn' });
      case 'mv_consulta': return doConsulta(r);
      case 'inv_in': return doInv(r, 'in');
      case 'inv_out': return doInv(r, 'out');
      case 'debt_pay': return doDebtPay(r);
      case 'q_bank': return qBank(r);
      case 'q_cash': return qCash();
      case 'q_sales': return qSales(r);
      case 'q_profit': return qProfit(r);
      case 'q_mv_counts': return qMvCounts(r);
      case 'q_debt': return qDebt(r);
      case 'q_stock': return qStock(r, false);
      case 'q_price': return qStock(r, true);
      default: {
        say(`No entendí «${text}». Puedes decir, por ejemplo: «vende 2 leche», «retiro 50 pichincha», «gasto de 5 en fundas» o «cierra la caja». Di «ayuda» para ver más.`, { kind: 'warn', spoken: 'No te entendí. Di ayuda para ver ejemplos.' });
        V.showChips = true;
      }
    }
  }

  /* ---------- ventas ---------- */
  function pickProduct(it, k) {
    if (it.id) return k(get('products', it.id));
    if (!it.cands.length) return k(null);
    chooseQ({
      title: `¿Cuál «${it.q}»?`,
      options: it.cands.map(c => { const p = get('products', c.id); return { label: c.name, sub: money(p ? p.price : 0), value: c.id }; }),
      onPick: id => k(get('products', id)), onCancel: () => { say('Listo, lo dejo.'); k(null); },
    });
  }
  function needQty(it, p, k, forStock) {
    let q = it.qty;
    if (q == null && it.money != null && p.price > 0 && !forStock) {
      q = FRACTIONAL.has(p.unit) ? Math.round(it.money / p.price * 1000) / 1000 : Math.max(1, Math.floor(it.money / p.price));
    }
    const finish = v => {
      v = convertQty(v, it.unit, p.unit);
      if (!(v > 0)) return k(null);
      if (v >= 100 && !FRACTIONAL.has(p.unit)) {
        return confirmQ({ title: () => `¿De verdad ${qtyFmt(v)} de ${p.name}?`, onYes: () => k(v), onNo: () => { say('Listo, lo dejo.'); k(null); } });
      }
      k(v);
    };
    if (q == null) {
      if (FRACTIONAL.has(p.unit) || forStock) {
        return askQ({
          title: `¿Cuántas ${unitWord(p.unit, 2)} de ${p.name}?`, quick: FRACTIONAL.has(p.unit) ? [0.5, 1, 2, 3] : [1, 2, 6, 12, 24],
          parse: parseQty, onValue: finish, onCancel: () => { say('Listo, lo dejo.'); k(null); },
        });
      }
      q = 1;
    }
    finish(q);
  }
  function groupTxt(added) {
    const m = new Map();
    added.forEach(a => { const e = m.get(a.p.id) || { p: a.p, q: 0 }; e.q = Math.round((e.q + a.q) * 1000) / 1000; m.set(a.p.id, e); });
    return [...m.values()].map(e => qtyTxt(e.q, e.p)).join(', ');
  }
  function doSale(r) {
    if (!needCaja()) return;
    if (S.view !== 'vender') go('vender');
    if (!r.items.length && !r.cobrar && !r.fiado) return say('Dime qué producto vender. Por ejemplo: «vende 2 leche y 3 gaseosas».', { kind: 'warn' });
    const added = [], missing = [];
    eachSeq(r.items, (it, next) => {
      pickProduct(it, p => {
        if (!p) { if (!it.cands.length) missing.push(it.q); return next(); }
        needQty(it, p, q => { if (q != null) { addLine(p, q); added.push({ p, q }); } next(); });
      });
    }, () => afterItems(r, added, missing));
  }
  function afterItems(r, added, missing) {
    if (r.received != null) { S.recv = String(r.received); renderCart(); }
    const total = cartTotal();
    const recvTxt = () => { if (S.recv === '' || S.recv == null || !S.cart.length) return ''; const ch = r2(num(S.recv) - total); return ch >= 0 ? ` Paga con ${money(num(S.recv))}: vuelto ${money(ch)}.` : ` Paga con ${money(num(S.recv))}: faltan ${money(-ch)}.`; };
    if (added.length || missing.length) {
      const parts = [];
      if (added.length) parts.push(`Agregado: ${groupTxt(added)}. Total ${money(total)}.${recvTxt()}`);
      if (missing.length) parts.push(`No encontré ${missing.map(m => '«' + m + '»').join(', ')} en los productos.`);
      say(parts.join(' '), { kind: missing.length && !added.length ? 'warn' : 'ok' });
    }
    if (r.fiado) return fiadoFlow(r.fiado);
    if (r.cobrar) return cobrar();
    if (!added.length && !missing.length) {
      if (r.received != null) return doReceived(r.received);
      say('La venta está vacía. Dime qué vender.', { kind: 'warn' });
    }
  }
  function doReceived(v) {
    S.recv = String(v); renderCart();
    if (!S.cart.length) return say(`Anotado: paga con ${money(v)}. Ahora dime los productos.`);
    const total = cartTotal(), ch = r2(v - total);
    say(ch >= 0 ? `Total ${money(total)}. Paga con ${money(v)}: vuelto ${money(ch)}.` : `Total ${money(total)}. Paga con ${money(v)}: faltan ${money(-ch)}.`, { kind: ch >= 0 ? 'ok' : 'warn' });
  }
  function qTotal() {
    if (!S.cart.length) return say('La venta está vacía.');
    const total = cartTotal();
    if (S.recv !== '' && S.recv != null) { const ch = r2(num(S.recv) - total); return say(ch >= 0 ? `Total ${money(total)}. Vuelto ${money(ch)}.` : `Total ${money(total)}. Faltan ${money(-ch)}.`); }
    say(`El total es ${money(total)}.`);
  }
  function cobrar() {
    if (!needCaja()) return;
    if (!S.cart.length) return say('No hay productos en la venta. Dime qué vender.', { kind: 'warn' });
    const total = cartTotal();
    if (S.recv !== '' && S.recv != null && r2(num(S.recv)) < total) return say(`Paga con ${money(num(S.recv))} y el total es ${money(total)}: faltan ${money(total - num(S.recv))}.`, { kind: 'warn' });
    return afterSale('efectivo', null, total);
  }
  async function afterSale(payType, cid, total) {
    const received = S.recv !== '' && S.recv != null ? num(S.recv) : null;
    await posSell(payType, cid);
    const all = allSales(); const sale = all[all.length - 1];
    if (!sale) return;
    sale.byVoice = true; put('sales', sale);
    const saidSale = [...(V.saleSaid || []), V.cmdText].filter((t, i, a) => t && a.indexOf(t) === i).join('» + «'); V.saleSaid = [];
    voiceAudit('Venta', `Venta #${sale.no} por ${money(sale.total)}${payType === 'fiado' ? ' a fiado' : ''}`, { entity: 'sale', entityId: sale.id, said: saidSale });
    const c = cid ? get('customers', cid) : null;
    if (payType === 'fiado') say(`Fiado anotado: ${money(total)} a ${c ? c.name : 'cliente'}. Ahora debe ${money(customerDebt(cid))}.`, { kind: 'ok' });
    else say(`Cobrado ${money(total)}${received != null && sale.change > 0 ? `. Vuelto ${money(sale.change)}` : ''}.`, { kind: 'ok' });
    setUndo(`la venta #${sale.no}`, () => {
      const s = get('sales', sale.id); if (!s || s.status === 'void') return say('Esa venta ya estaba anulada.');
      if (s.payType === 'fiado' && (s.paid || 0) > 0) return say('Esa venta ya tiene abonos; no se puede deshacer.', { kind: 'bad' });
      voidSale(s, 'Deshecha por voz justo después de cobrar');
      S.cart = s.items.map(l => ({ key: newKey(), pid: l.pid, name: l.name, ownerId: l.ownerId, qty: l.qty, price: l.price, cost: l.cost, unit: l.unit, listPrice: l.listPrice ?? l.price }));
      renderCart(); renderTop(); renderLastSales();
      say(`Deshice la venta #${s.no}. Los productos volvieron a la lista.`, { kind: 'ok' });
    });
  }
  function fiadoFlow(f) {
    if (!needCaja()) return;
    if (!S.cart.length) return say('Primero dime los productos. Por ejemplo: «2 leche fiado a Rosa».', { kind: 'warn' });
    const total = cartTotal();
    const confirmFor = c => {
      const d = customerDebt(c.id);
      confirmQ({
        title: () => `Fiado de ${money(total)} a ${c.name}${d > 0 ? ` (ya debe ${money(d)})` : ''}`,
        onYes: () => afterSale('fiado', c.id, total), onNo: () => say('Listo, no lo fié. La venta sigue en la lista.'),
      });
    };
    const cs = f.cands || [];
    if (cs.length === 1 || (cs.length > 1 && cs[0].score >= 0.9 && cs[0].score - cs[1].score >= 0.15)) return confirmFor(get('customers', cs[0].id));
    if (cs.length > 1) {
      return chooseQ({
        title: '¿A qué cliente?',
        options: cs.map(c => { const d = customerDebt(c.id); return { label: c.name, sub: d > 0 ? 'debe ' + money(d) : 'al día', value: c.id }; }),
        onPick: id => confirmFor(get('customers', id)), onCancel: () => say('Listo, no lo fié.'),
      });
    }
    if (!f.q) {
      return askQ({
        title: '¿A quién le fiamos?', parse: text => ({ q: VNLU.textTokens(text).join(' '), cands: VNLU.matchNames(VNLU.textTokens(text), customers()) }),
        onValue: v => fiadoFlow(v), onCancel: () => say('Listo, no lo fié.'),
      });
    }
    const orig = String(V.cmdText || '').split(/\s+/);
    const name = cap(f.q.split(' ').map(w => orig.find(o => VNLU.strip(o).replace(/[^a-z0-9]/g, '') === w) || w).join(' ').replace(/[.,;:!?]/g, ''));
    confirmQ({
      title: () => `No tengo un cliente «${name}». ¿Lo agrego y le fío ${money(total)}?`,
      onYes: () => { const c = addCustomer(name); return afterSale('fiado', c.id, total); }, onNo: () => say('Listo, no lo fié.'),
    });
  }
  function doRemove(r) {
    if (!S.cart.length) return say('La venta está vacía.', { kind: 'warn' });
    if (r.last) { const l = S.cart[S.cart.length - 1]; S.cart = S.cart.slice(0, -1); renderCart(); return say(`Quité ${qtyTxt(l.qty, l)}.`, { kind: 'ok' }); }
    if (!r.items.length) return say('¿Qué producto quito? Di, por ejemplo: «quita la leche».', { kind: 'warn' });
    const out = [];
    eachSeq(r.items, (it, next) => {
      const ids = new Set(it.id ? [it.id] : it.cands.map(c => c.id));
      const lines = S.cart.filter(l => ids.has(l.pid));
      const apply = l => {
        if (it.qty != null && it.qty < l.qty) { l.qty = Math.round((l.qty - it.qty) * 1000) / 1000; out.push(`${qtyFmt(it.qty)} ${l.name}`); }
        else { S.cart = S.cart.filter(x => x !== l); out.push(l.name); }
        renderCart(); next();
      };
      if (!lines.length) { out.push(null); say(`No veo «${it.q}» en la venta.`, { kind: 'warn' }); return next(); }
      if (lines.length === 1) return apply(lines[0]);
      chooseQ({ title: `¿Cuál quito?`, options: lines.map(l => ({ label: l.name, sub: 'x' + qtyFmt(l.qty), value: l.key })), onPick: k => apply(lines.find(l => l.key === k)), onCancel: () => { say('Listo.'); next(); } });
    }, () => { const o = out.filter(Boolean); if (o.length) say(`Quité: ${o.join(', ')}. Total ${money(cartTotal())}.`, { kind: 'ok' }); });
  }
  function doCancelSale() {
    if (!S.cart.length) return say('La venta ya está vacía.');
    confirmQ({
      title: () => `Vaciar la venta (${S.cart.length} producto${S.cart.length === 1 ? '' : 's'}, ${money(cartTotal())})`,
      onYes: () => { S.cart = []; S.recv = ''; V.saleSaid = []; renderCart(); say('Venta vaciada.', { kind: 'ok' }); },
    });
  }
  function doPrice(r) {
    if (!S.cart.length) return say('La venta está vacía.', { kind: 'warn' });
    const it = r.item; const ids = new Set(it ? (it.id ? [it.id] : it.cands.map(c => c.id)) : []);
    const l = S.cart.find(x => ids.has(x.pid));
    if (!l) return say('No veo ese producto en la venta.', { kind: 'warn' });
    if (!(r.price >= 0) || r.price == null) return say('¿A qué precio? Di, por ejemplo: «cambia el precio del queso a 4 dólares».', { kind: 'warn' });
    const old = l.price; l.price = r2(r.price); renderCart();
    say(`${l.name}: precio ${money(old)} → ${money(l.price)}. Total ${money(cartTotal())}.`, { kind: 'ok' });
  }

  /* ---------- Mi Vecino ---------- */
  function doMv(r) {
    if (!needCaja()) return;
    const d = OPS[r.op];
    const st = { op: r.op, bank: r.bank, amount: r.amount };
    const proceed = () => confirmQ({
      title: () => `${d.label} de ${money(st.amount)} · ${BANKS[st.bank].name}${st.amount >= 2000 ? ' — ¡es un monto grande!' : ''}`,
      spoken: () => `${d.label} de ${sayMoney(st.amount)} en ${BANKS[st.bank].name}. ¿Confirmas?`,
      banks: true, st,
      adjust: async text => {
        const b = bankFromText(text), a = parseAmount(text);
        if (!b && a === undefined) return false;
        if (b) st.bank = b;
        if (a !== undefined) st.amount = a;
        proceed(); return true;
      },
      onYes: () => execMv(st),
      onNo: () => say('Listo, no lo anoté.'),
    });
    if (!(st.amount > 0)) {
      return askQ({
        title: `¿De cuánto es el ${d.label.toLowerCase()}?`, quick: [5, 10, 20, 50, 100], qprefix: '$', parse: parseAmount,
        onValue: v => { st.amount = v; proceed(); }, onCancel: () => say('Listo, no lo anoté.'),
      });
    }
    proceed();
  }
  function execMv(st) {
    const ses = curSession(); if (!ses) return needCaja();
    const sm = sessionSummary(ses.id), d = OPS[st.op], amt = r2(st.amount), warn = [];
    if (d.bank < 0 && sm.bankBal[st.bank] < amt) warn.push(`la cuenta ${BANKS[st.bank].name} tiene solo ${money(sm.bankBal[st.bank])}`);
    if (d.cash < 0 && sm.mvCash < amt) warn.push(`el efectivo de Mi Vecino es solo ${money(sm.mvCash)}`);
    const op = addBankOp(st.bank, st.op, amt);
    voiceAudit(d.label, `${d.label} ${money(amt)} en ${BANKS[st.bank].name}`, { entity: 'bankOp', entityId: op.id });
    S.mv.bank = st.bank; S.mv.op = null; S.mv.amount = '';
    renderMV(); renderTop(); if (S.view === 'caja') renderView(); beep('ok');
    say(`Listo: ${d.label.toLowerCase()} de ${money(amt)} en ${BANKS[st.bank].name}.${warn.length ? ' Atención: ' + warn.join(' y ') + '.' : ''}`, { kind: warn.length ? 'warn' : 'ok' });
    setUndo(`el ${d.label.toLowerCase()} de ${money(amt)}`, () => { removeBankOp(op); renderMV(); renderTop(); if (S.view === 'caja') renderView(); say(`Deshice el ${d.label.toLowerCase()} de ${money(amt)}.`, { kind: 'ok' }); });
  }
  function doConsulta(r) {
    if (!needCaja()) return;
    const n = r.n || 1, bank = r.bank;
    const run = () => {
      const ops = []; for (let i = 0; i < n; i++) ops.push(addBankOp(bank, 'consulta', 0));
      voiceAudit('Consulta de saldo', `${n} consulta${n > 1 ? 's' : ''} en ${BANKS[bank].name}`, { entity: 'bankOp', entityId: ops[0].id });
      S.mv.bank = bank; renderMV(); renderTop(); if (S.view === 'caja') renderView(); beep('ok');
      const today_ = sessionSummary(curSession().id).ops.filter(o => o.type === 'consulta').length;
      say(`Anotado: ${n} consulta${n > 1 ? 's' : ''} de saldo en ${BANKS[bank].name}. Hoy van ${today_}.`, { kind: 'ok', spoken: `Anotado. Hoy van ${today_} consultas.` });
      setUndo(`${n > 1 ? 'las consultas' : 'la consulta'}`, () => { ops.forEach(o => removeBankOp(o)); renderMV(); renderTop(); say('Deshice la consulta.', { kind: 'ok' }); });
    };
    if (n > 5) return confirmQ({ title: () => `Anotar ${n} consultas de saldo en ${BANKS[bank].name}`, onYes: run });
    run();
  }

  /* ---------- inventario ---------- */
  function doInv(r, kind) {
    if (!r.items.length) return say('Dime el producto y la cantidad. Por ejemplo: «ingreso 24 leche».', { kind: 'warn' });
    const lines = [], missing = [], blocked = [];
    eachSeq(r.items, (it, next) => {
      pickProduct(it, p => {
        if (!p) { if (!it.cands.length) missing.push(it.q); return next(); }
        needQty(it, p, q => {
          if (q != null) {
            if (kind === 'out' && p.trackStock === false) blocked.push(`${p.name} no lleva control de inventario`);
            else if (kind === 'out' && (p.stock || 0) < q) blocked.push(`de ${p.name} solo hay ${qtyFmt(p.stock || 0)}`);
            else lines.push({ p, q });
          }
          next();
        }, true);
      });
    }, () => {
      if (missing.length) say(`No encontré ${missing.map(m => '«' + m + '»').join(', ')} en los productos.`, { kind: 'warn' });
      if (blocked.length) say(`No se puede: ${blocked.join('; ')}.`, { kind: 'warn' });
      if (!lines.length) return;
      invConfirm(lines, kind, r);
    });
  }
  function invConfirm(lines, kind, r) {
    const sign = kind === 'in' ? '+' : '−';
    const desc = lines.map(({ p, q }) => `${sign}${qtyFmt(q)} ${p.name} (stock ${qtyFmt(p.stock || 0)} → ${qtyFmt((p.stock || 0) + (kind === 'in' ? q : -q))})`).join(', ');
    let costNote = '';
    let cost = r.cost != null ? r.cost : null;
    if (cost != null && kind === 'in') { if (!S.owner) { costNote = ' (el costo solo lo cambia el dueño: lo ignoré)'; cost = null; } else if (lines.length > 1) { costNote = ' (con varios productos no cambio el costo)'; cost = null; } else costNote = ` · costo ${money(cost)}`; }
    const reason = kind === 'out' ? (r.reason || 'salida de inventario') : '';
    confirmQ({
      title: () => `${kind === 'in' ? 'Ingreso de mercadería' : 'Salida de inventario' + (reason && reason !== 'salida de inventario' ? ' (' + reason + ')' : '')}: ${desc}${costNote}`,
      spoken: () => `${kind === 'in' ? 'Ingreso' : 'Salida'} de ${lines.map(({ p, q }) => `${qtyFmt(q)} ${p.name}`).join(' y ')}. ¿Confirmas?`,
      onYes: () => execInv(lines, kind, cost, reason, !!r.paid), onNo: () => say('Listo, no cambié el inventario.'),
    });
  }
  function execInv(lines, kind, cost, reason, paid) {
    const ses = curSession(); const done = [];
    lines.forEach(({ p, q }) => {
      const pp = get('products', p.id); const before = pp.stock || 0;
      if (kind === 'in') {
        const oldCost = pp.cost || 0;
        adjustStock(pp.id, q);
        if (cost != null && cost !== oldCost) { const x = get('products', pp.id); x.cost = cost; put('products', x); }
        const unitCost = cost != null ? cost : oldCost;
        const pur = put('purchases', { id: uid(), ts: new Date().toISOString(), date: ses ? ses.date : today(), sessionId: ses ? ses.id : null, supplier: '', pid: pp.id, name: pp.name, ownerId: pp.ownerId, qty: q, cost: unitCost, total: r2(q * unitCost), paidCash: !!paid, byVoice: true });
        voiceAudit('Mercadería ingresada', `${qtyFmt(q)} x ${pp.name} (${ownerName(pp.ownerId)}), stock ${qtyFmt(before)} → ${qtyFmt(before + q)}${cost != null && cost !== oldCost ? `, costo ${money(oldCost)} → ${money(cost)}` : ''}`, { entity: 'product', entityId: pp.id });
        let cashId = null;
        if (paid && ses && unitCost > 0) cashId = put('cashMoves', { id: uid(), ts: new Date().toISOString(), date: ses.date, sessionId: ses.id, scope: 'tienda', kind: 'out', category: 'compra', concept: `Compra de ${pp.name}`, amount: r2(q * unitCost), byVoice: true }).id;
        done.push({ pid: pp.id, q, purId: pur.id, oldCost, cashId });
      } else {
        adjustStock(pp.id, -q);
        voiceAudit('Salida de inventario', `${qtyFmt(q)} x ${pp.name}: ${reason}. Stock ${qtyFmt(before)} → ${qtyFmt(before - q)}`, { entity: 'product', entityId: pp.id, before: { stock: before }, after: { stock: before - q }, edit: true });
        done.push({ pid: pp.id, q });
      }
    });
    if (S.view === 'productos' && typeof drawProducts === 'function') drawProducts();
    renderTop();
    say(`Listo: ${kind === 'in' ? 'ingreso' : 'salida'} de ${lines.map(({ p, q }) => `${qtyFmt(q)} ${p.name}`).join(', ')}. Stock actual: ${lines.map(({ p }) => qtyFmt(get('products', p.id).stock)).join(', ')}.`, { kind: 'ok', spoken: 'Listo, inventario actualizado.' });
    setUndo(kind === 'in' ? 'el ingreso' : 'la salida', () => {
      done.forEach(d => {
        adjustStock(d.pid, kind === 'in' ? -d.q : d.q);
        if (kind === 'in' && d.purId) del('purchases', d.purId);
        if (d.cashId && get('cashMoves', d.cashId)) removeMoney(get('cashMoves', d.cashId));
        const pr = get('products', d.pid);
        voiceAudit(kind === 'in' ? 'Ingreso deshecho' : 'Salida deshecha', `${qtyFmt(d.q)} x ${pr ? pr.name : 'producto'}`, { entity: 'product', entityId: d.pid, edit: true });
      });
      if (S.view === 'productos' && typeof drawProducts === 'function') drawProducts();
      say(`Deshice ${kind === 'in' ? 'el ingreso' : 'la salida'}.`, { kind: 'ok' });
    });
  }

  /* ---------- cobro de fiados ---------- */
  function doDebtPay(r) {
    if (!needCaja()) return;
    const cs = r.cands || [];
    const step = c => {
      const d = customerDebt(c.id);
      if (d <= 0) return say(`${c.name} no debe nada.`);
      const go_ = amt => {
        if (amt > d) { say(`${c.name} debe ${money(d)}; no puede pagar ${money(amt)}. Cobro solo la deuda.`, { kind: 'warn' }); amt = d; }
        confirmQ({
          title: () => `Cobrar ${money(amt)} a ${c.name} (debe ${money(d)}${amt < d ? ', quedaría ' + money(d - amt) : ''})`,
          onYes: () => { const p = payDebt(c.id, amt); voiceAudit('Cobro de fiado', `${c.name} pagó ${money(amt)}`, { entity: 'debtPayment', entityId: p.id }); renderTop(); if (S.view === 'fiados' || S.view === 'caja') renderView(); say(`Cobro registrado: ${money(amt)} de ${c.name}. Le quedan ${money(customerDebt(c.id))}.`, { kind: 'ok' }); setUndo('el cobro', () => { undoDebtPayment(p); renderTop(); if (S.view === 'fiados') renderView(); say('Deshice el cobro.', { kind: 'ok' }); }); },
        });
      };
      if (r.amount > 0) go_(r.amount);
      else askQ({ title: `¿Cuánto pagó ${c.name}? (debe ${money(d)})`, quick: [d], qprefix: '$', parse: parseAmount, onValue: go_ });
    };
    if (cs.length === 1) return step(get('customers', cs[0].id));
    if (cs.length > 1) return chooseQ({ title: '¿Qué cliente?', options: cs.map(c => ({ label: c.name, sub: 'debe ' + money(customerDebt(c.id)), value: c.id })), onPick: id => step(get('customers', id)) });
    say(r.customerQ ? `No encontré a un cliente llamado «${r.customerQ}».` : '¿De qué cliente? Di, por ejemplo: «Rosa abonó 5 dólares».', { kind: 'warn' });
  }

  /* ---------- preguntas ---------- */
  function qBank(r) {
    const ses = curSession(); if (!ses) return needCaja();
    const sm = sessionSummary(ses.id);
    if (r.bank) return say(`Cuenta ${BANKS[r.bank].name}: ${money(sm.bankBal[r.bank])}.`);
    say(`Efectivo de Mi Vecino ${money(sm.mvCash)}. Pichincha ${money(sm.bankBal.pichincha)}. Guayaquil ${money(sm.bankBal.guayaquil)}.`);
  }
  function qCash() {
    const ses = curSession(); if (!ses) return needCaja();
    const sm = sessionSummary(ses.id);
    say(`En la tienda debería haber ${money(sm.tiendaExpected)}. Efectivo de Mi Vecino: ${money(sm.mvCash)}.`);
  }
  const periodOf = (p, rg) => rg && rg.from ? [rg.from, rg.to, rg.label] : p === 'ayer' ? [addDays(today(), -1), addDays(today(), -1), 'ayer'] : p === 'semana' ? [...periodRange('week', today()), 'esta semana'] : p === 'mes' ? [...periodRange('month', today()), 'este mes'] : [today(), today(), 'hoy'];
  async function qSales(r) {
    if ((r.period !== 'hoy' || (r.range && r.range.key !== 'hoy')) && !(await requireOwner('Las ventas de otros días las ve el dueño. Escribe tu PIN.'))) return say('Entendido, no las muestro.');
    const [a, b, label] = periodOf(r.period, r.range), g = aggregate(a, b);
    say(`Ventas de ${label}: ${money(g.rev)} en ${g.count} venta${g.count === 1 ? '' : 's'}.`);
  }
  async function qProfit(r) {
    if (!(await requireOwner('La ganancia es solo para el dueño. Escribe tu PIN.'))) return say('Entendido, no la muestro.');
    const [a, b, label] = periodOf(r.period, r.range), g = aggregate(a, b);
    say(`Ganancia de ${label}: ${money(g.profit)} (ventas ${money(g.rev)}).`);
  }
  function qMvCounts(r) {
    const [a, b, label] = periodOf(r.period, r.range), s = mvStats(a, b).all;
    const pl = (n, a, b) => `${n} ${n === 1 ? a : b}`;
    say(`Mi Vecino ${label}: ${pl(s.deposito.n, 'depósito', 'depósitos')}, ${pl(s.retiro.n, 'retiro', 'retiros')}, ${pl(s.consulta.n, 'consulta de saldo', 'consultas de saldo')}, ${pl(s.servicio.n, 'servicio', 'servicios')}.`);
  }
  function qDebt(r) {
    if (!r.customerQ) { const n = customers().filter(c => customerDebt(c.id) > 0).length; return say(`Los clientes deben ${money(totalDebt())} en total (${n} cliente${n === 1 ? '' : 's'}).`); }
    const cs = VNLU.matchNames(VNLU.textTokens(r.customerQ), customers());
    if (!cs.length) return say(`No encontré a un cliente llamado «${r.customerQ}».`, { kind: 'warn' });
    say(cs.slice(0, 4).map(c => `${c.name} debe ${money(customerDebt(c.id))}`).join('. ') + '.');
  }
  function qStock(r, price) {
    const cs = r.cands || [];
    if (!cs.length) return say(`No encontré «${r.q}» en los productos.`, { kind: 'warn' });
    const list_ = (r.id ? [cs.find(c => c.id === r.id)] : cs.slice(0, 3)).map(c => get('products', c.id)).filter(Boolean);
    say(list_.map(p => price ? `${p.name}: ${money(p.price)}${FRACTIONAL.has(p.unit) ? ' por ' + UNITS[p.unit] : ''}` : `${p.name}: quedan ${qtyFmt(p.stock || 0)}${FRACTIONAL.has(p.unit) ? ' ' + unitWord(p.unit, p.stock) : ''}`).join('. ') + '.');
  }

  /* ---------- pantallas, deshacer y ayuda ---------- */
  async function doNav(view) {
    if (view === 'cierre' && !curSession()) return say('La caja ya está cerrada.');
    await ACT['nav']({ dataset: { v: view } });
    const nm = view === 'cierre' ? 'Cierre de caja' : (NAV.find(n => n[0] === view) || [])[1];
    if (S.view === view) say(`Listo: ${nm}.`, { kind: 'ok', spoken: `Abrí ${nm}.` });
  }
  function doUndo() {
    const u = V.lastUndo; if (!u) return say('No tengo nada reciente que deshacer.', { kind: 'warn' });
    V.lastUndo = null; u.fn();
  }
  const HELP = [
    ['Abrir y cerrar la caja', '«abre la caja» · «abre la caja igual que ayer» · «abre la caja con 50 en la tienda, 200 mi vecino, 500 pichincha y 300 guayaquil» · «cierra la caja» · «cierra la caja, todo cuadra»'],
    ['Vender', '«vende 2 leche y 3 gaseosas» · «una libra de azúcar» · «cobrar, paga con 20» · «fiado a Rosa» · «quita la leche» · «cancela la venta» · «anula la última venta»'],
    ['Mi Vecino', '«retiro 50 pichincha» · «depósito 100 guayaquil» · «consulta de saldo» · «pago de luz 35» · «cargar saldo 500»'],
    ['Gastos e ingresos', '«gasto de 25 en luz» · «gasté 5 en fundas» · «pagué 80 al proveedor Pepsi» · «otro ingreso de 50 por cartones» · «retiro del dueño 20» · «gasto de 30 por agua, no de la caja»'],
    ['Inventario y productos', '«ingreso 24 leche» · «salida 2 huevos» · «se dañaron 3 yogures» · «crea producto arroz precio 0.60 dueño Mercedes» · «cambia el precio del arroz a 0.65»'],
    ['Fiados', '«Rosa abonó 5 dólares» · «cuánto debe Rosa» · «quiénes me deben» · «agrega cliente María»'],
    ['Preguntas', '«cuánto hay en pichincha» · «cuánto vendí hoy» · «cuánto gasté este mes» · «ganancia del mes» · «cuánto vendió Mercedes» · «stock de arroz» · «qué se está acabando» · «cuántas consultas hoy»'],
    ['Reportes y pantallas', '«reporte de ayer» · «reporte de Mi Vecino de este mes» · «envía el reporte de hoy por WhatsApp» · «descarga un respaldo» · «abre contabilidad» · «deshacer» · «sí» / «no»'],
  ];
  function showHelp() {
    addLog('bot', `<div class="vp-help">${HELP.map(([t, x]) => `<div><b>${t}</b><br>${esc(x)}</div>`).join('')}</div>`, { html: true });
    V.showChips = true; render();
    if (V.src === 'voice' && vcfg().speak !== false) speak('Puedes decir: abre la caja, vende dos leche, retiro cincuenta pichincha, gasto de veinte en luz, o cierra la caja.');
  }
  function examples() {
    const ps = activeProducts(); const q = ps.filter(p => p.quick); const pool = (q.length >= 3 ? q : ps).slice(0, 6);
    const DROP = new Set(['por', 'de', 'del', 'en', 'la', 'el', 'x', 'l', 'kg', 'g', 'ml', 'lb', 'funda', 'unidad']);
    const nm = i => { const w = ((pool[i] || { name: 'leche' }).name).toLowerCase().replace(/[()]/g, '').split(/\s+/).filter(x => x && !DROP.has(x) && !/^\d/.test(x)); return (w.slice(0, 2).join(' ') || 'leche'); };
    return [`vende 2 ${nm(0)} y 1 ${nm(1)}`, 'cobrar, paga con 20', 'retiro 50 pichincha', 'depósito 100 guayaquil', 'consulta de saldo', `ingreso 12 ${nm(2)}`, 'gasto de 5 en fundas', 'otro ingreso de 20', 'cuánto hay en pichincha', 'cuánto vendí hoy', 'cierra la caja'];
  }

  /* ---------- pantalla del asistente ---------- */
  function buildShell() {
    const el = $('#vpanel'); el.hidden = false;
    el.innerHTML = `<div class="vp-head"><span class="vp-dot" id="vp-dot"></span><b id="vp-state">Listo</b><span class="sp"></span>
        <button class="btn ghost sm icon" data-act="voice-help" aria-label="Ver ejemplos" title="Qué puedo decir">${ic('info', 'sm')}</button>
        <button class="btn ghost sm icon" data-act="voice-close" aria-label="Cerrar" title="Cerrar (Esc)">${ic('x', 'sm')}</button></div>
      <div class="vp-log" id="vp-log" aria-live="polite"></div>
      <div id="vp-pend"></div>
      <div class="vp-bar"><button class="vp-mic" id="vp-mic" data-act="voice-listen" aria-label="Hablar" title="Toca y habla">${ic('mic', 'lg')}</button>
        <input class="in" id="vp-in" placeholder="…o escribe la orden y pulsa Enter" autocomplete="off" autocapitalize="off" spellcheck="false" data-key="vp-in" aria-label="Escribe la orden">
        <button class="btn primary icon" data-act="vp-send" aria-label="Enviar">${ic('send')}</button></div>
      <div class="vp-chips" id="vp-chips"></div>`;
  }
  function renderState() {
    const dot = $('#vp-dot'), st = $('#vp-state'), mic = $('#vp-mic'); if (!dot) return;
    dot.className = 'vp-dot' + (V.listening ? ' live' : V.speaking ? ' talk' : '');
    st.textContent = V.listening ? 'Te escucho…' : V.speaking ? 'Hablando…' : V.pending ? 'Esperando tu respuesta' : SRc ? 'Toca el micrófono y habla' : 'Escribe la orden';
    mic.classList.toggle('live', V.listening); mic.setAttribute('aria-pressed', String(V.listening));
  }
  function renderLog() {
    const box = $('#vp-log'); if (!box) return;
    box.innerHTML = V.log.slice(-6).map(m => `<div class="vp-msg ${m.who} ${m.kind}">${m.html ? m.text : esc(m.text)}</div>`).join('') + (V.interim ? `<div class="vp-msg you live">${esc(V.interim)}…</div>` : '');
    const last = V.log[V.log.length - 1];
    if (last && last.html && !V.interim) { const el = box.lastElementChild; box.scrollTop = el ? el.offsetTop - 8 : 0; } else box.scrollTop = box.scrollHeight;
  }
  function renderPending() {
    const el = $('#vp-pend'); if (!el) return;
    const p = V.pending;
    if (!p) { el.innerHTML = ''; return; }
    if (p.kind === 'confirm') {
      const t = typeof p.title === 'function' ? p.title() : p.title;
      el.innerHTML = `<div class="vq"><div class="vq-t">${esc(t)}</div>
        ${p.banks ? `<div class="bank-pick vq-banks">${['pichincha', 'guayaquil'].map(b => `<button data-act="v-bank" data-b="${b}" aria-pressed="${p.st.bank === b}"><span class="bk" style="background:${BANKS[b].color}"></span>${BANKS[b].name}</button>`).join('')}</div>` : ''}
        ${p.toggles ? `<div class="vq-tog">${p.toggles.map((x, i) => `<button class="${x.on ? 'on' : ''}" data-act="v-tog" data-i="${i}" aria-pressed="${!!x.on}"><span class="bx">${x.on ? '✓' : ''}</span>${esc(x.label)}</button>`).join('')}</div>` : ''}
        <div class="vq-act"><button class="btn lg" data-act="v-no">CANCELAR</button><button class="btn lg primary" data-act="v-yes">${ic('check')} CONFIRMAR</button></div>
        <div class="xs muted">También puedes decir «sí» o «no».</div></div>`;
    } else if (p.kind === 'choose') {
      el.innerHTML = `<div class="vq"><div class="vq-t">${esc(p.title)}</div>
        ${p.options.map((o, i) => `<button class="vq-opt" data-act="v-pick" data-i="${i}"><b>${i + 1}</b><span class="nm">${esc(o.label)}</span><span class="sub">${esc(o.sub || '')}</span></button>`).join('')}
        <button class="btn ghost" data-act="v-no">Ninguno</button></div>`;
    } else {
      el.innerHTML = `<div class="vq"><div class="vq-t">${esc(p.title)}</div>
        ${p.quick ? `<div class="bills">${p.quick.map(v => `<button data-act="v-quick" data-v="${v}">${p.qprefix || ''}${v}</button>`).join('')}</div>` : ''}
        <button class="btn ghost" data-act="v-no">Cancelar</button></div>`;
    }
  }
  function renderChips() {
    const el = $('#vp-chips'); if (!el) return;
    el.innerHTML = (V.showChips || V.log.length <= 2) ? `<div class="xs muted" style="width:100%">Toca un ejemplo para escribirlo:</div>` + examples().map(x => `<button data-act="v-ex" data-t="${esc(x)}">${esc(x)}</button>`).join('') : '';
  }
  function render() { if (!V.open) return; document.body.classList.toggle('v-gate', !$('#gate').hidden); renderState(); renderLog(); renderPending(); renderChips(); }

  function openPanel() {
    if (!cfg().setupDone) { toast('Primero termina de configurar el sistema.', { type: 'warn' }); return false; }
    if (!V.open) {
      V.open = true; S.voiceOpen = true; document.body.classList.add('v-open');
      buildShell(); checkMic();
      if (!V.log.length) addLog('bot', 'Habla o escribe. Por ejemplo: «vende 2 leche y 3 gaseosas».');
      try { speechSynthesis.getVoices(); } catch (e) { }
      renderTop(); render();
    }
    return true;
  }
  function closePanel() {
    stop(); try { speechSynthesis.cancel(); } catch (e) { }
    clearTimeout(V._lt);
    V.open = false; S.voiceOpen = false; V.pending = null; V.interim = '';
    document.body.classList.remove('v-open');
    const el = $('#vpanel'); el.hidden = true; el.innerHTML = '';
    renderTop(); focusScan();
  }

  ACT['voice-toggle'] = () => {
    if (!V.open) { if (openPanel()) listen(); return; }
    if (V.listening) return stop();
    listen();
  };
  ACT['voice-listen'] = () => { try { speechSynthesis.cancel(); } catch (e) { } clearTimeout(V._lt); listen(); };
  ACT['voice-close'] = () => closePanel();
  ACT['voice-help'] = () => showHelp();
  ACT['vp-send'] = () => { const i = $('#vp-in'); if (!i) return; const v = i.value; i.value = ''; submit(v, 'text'); i.focus(); };
  KEY['vp-in'] = (t, e) => { if (e.key === 'Enter') { e.preventDefault(); ACT['vp-send'](); } };
  ACT['v-ex'] = t => { const i = $('#vp-in'); if (i) { i.value = t.dataset.t; i.focus(); } };
  ACT['v-yes'] = () => submit('sí', 'tap');
  ACT['v-no'] = () => submit('no', 'tap');
  ACT['v-pick'] = t => submit(String(+t.dataset.i + 1), 'tap');
  ACT['v-quick'] = t => submit(String(t.dataset.v), 'tap');
  ACT['v-tog'] = t => { const p = V.pending; if (!p || !p.toggles) return; const x = p.toggles[+t.dataset.i]; if (x) { x.on = !x.on; if (p.onToggle) p.onToggle(x); } render(); };
  ACT['v-bank'] = t => { const p = V.pending; if (!p || !p.st) return; p.st.bank = t.dataset.b; render(); };
  document.addEventListener('keydown', e => {
    if (e.key === 'F4') { e.preventDefault(); ACT['voice-toggle'](); }
    else if (e.key === 'Escape' && V.open && !modalStack.length) closePanel();
  });

  /* ---------- Ajustes ---------- */
  function statusHTML() {
    if (!SRc) return `<div class="alert warn">${ic('alert')}<span>Este navegador no puede reconocer la voz. Usa <b>Google Chrome</b> o <b>Microsoft Edge</b> (en el celular, Chrome). Siempre puedes <b>escribir</b> las órdenes en el cuadro del asistente.</span></div>`;
    const on = navigator.onLine !== false;
    const l = V.local.state;
    const loc = l === 'available' ? 'Voz sin internet: <b>lista</b>.' : (l === 'downloadable' || l === 'downloading') ? 'Voz sin internet: <b>se puede descargar</b> (botón de abajo).' : l === 'unknown' ? 'Voz sin internet: sin revisar (pulsa «Revisar»).' : 'Voz sin internet: no disponible en este navegador (entonces el micrófono necesita internet; el cuadro de texto funciona siempre).';
    return `<div class="alert ${on ? 'ok' : 'warn'}">${ic(on ? 'check' : 'alert')}<span>Micrófono compatible. ${on ? 'Hay internet.' : '<b>Sin internet ahora.</b>'} ${loc}</span></div>`;
  }
  function refreshSettings() { const el = $('#voice-status'); if (el) el.innerHTML = statusHTML(); const b = $('#voice-install'); if (b) b.hidden = !(V.local.state === 'downloadable' || V.local.state === 'downloading'); }
  window.voiceSettingsHTML = () => {
    const v = vcfg();
    return `<div class="card"><h3>${ic('mic')} Voz</h3>
      <p class="muted sm" style="margin:-4px 0 8px">Toca <b>Hablar</b> (o la tecla <kbd>F4</kbd>) y di, por ejemplo: «vende 2 leche», «retiro 50 pichincha», «consulta de saldo», «ingreso 12 aceite». Si no hay internet o hay mucho ruido, escribe la orden en el cuadro.</p>
      <div class="col">
        <label class="chk"><input type="checkbox" data-ch="set-vspeak" ${v.speak !== false ? 'checked' : ''}> El sistema responde hablando (cuando le hablas)</label>
        <label class="chk"><input type="checkbox" data-ch="set-vauto" ${v.auto !== false ? 'checked' : ''}> Escuchar solo mi respuesta («sí» / «no») después de una pregunta</label>
        <label class="chk"><input type="checkbox" data-ch="set-vlocal" ${v.preferLocal ? 'checked' : ''}> Preferir la voz del equipo (sin internet) cuando esté disponible</label>
        <label class="chk"><input type="checkbox" data-ch="set-vhands" ${v.handsFree ? 'checked' : ''}> <span><b>Manos libres</b>: sigue escuchando solo mientras el panel de voz esté abierto (para no tocar el micrófono cada vez). Cierra el panel o toca el micrófono para parar.</span></label>
        <div id="voice-status">${statusHTML()}</div>
        <div class="row"><button class="btn primary" data-act="voice-toggle">${ic('mic')} Probar el micrófono</button><button class="btn" data-act="voice-probe">${ic('refresh')} Revisar voz sin internet</button><button class="btn" id="voice-install" data-act="voice-install" ${(V.local.state === 'downloadable' || V.local.state === 'downloading') ? '' : 'hidden'}>${ic('down')} Descargar voz sin internet</button></div>
      </div></div>`;
  };
  CHG['set-vspeak'] = t => { vcfg().speak = t.checked; saveCfg(); };
  CHG['set-vauto'] = t => { vcfg().auto = t.checked; saveCfg(); };
  CHG['set-vhands'] = t => { vcfg().handsFree = t.checked; saveCfg(); };
  CHG['set-vlocal'] = t => { vcfg().preferLocal = t.checked; saveCfg(); };
  ACT['voice-probe'] = async () => { if (!SRc) return toast('Este navegador no reconoce voz.', { type: 'warn' }); toast('Revisando…', { ms: 1500 }); await probeLocal(true); };
  ACT['voice-install'] = async () => {
    if (!SRc || typeof SRc.install !== 'function') return toast('Este navegador no permite descargar la voz sin internet.', { type: 'warn' });
    toast('Descargando la voz… necesita internet y puede tardar unos minutos.', { ms: 6000 });
    try { const ok = await SRc.install({ langs: [V.local.lang || 'es-ES'], processLocally: true }); toast(ok ? 'Voz sin internet lista' : 'No se pudo descargar la voz', { type: ok ? 'ok' : 'bad' }); }
    catch (e) { toast('No se pudo descargar: ' + (e.message || e), { type: 'bad' }); }
    await probeLocal(true);
  };
  VIEWS.ajustes.after = () => { syncLocal(); refreshSettings(); };
  window.addEventListener('online', refreshSettings); window.addEventListener('offline', refreshSettings);
  try { if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => { V.voice = null; }; } catch (e) { }

  Object.assign(VC, { doCancelSale, V, say, confirmQ, chooseQ, askQ, needCaja, voiceAudit, setUndo, parseAmount, parseQty, sayMoney, eachSeq, cap, ctx, parse, qtyTxt, vcfg, listen, submit, render, pickProduct, addLog, periodOf, unitWord });

  /* ---------- gancho para pruebas ---------- */
  window.__voice = {
    say: async (text, src = 'text') => { openPanel(); await submit(text, src); await new Promise(r => setTimeout(r, 40)); return snap(); },
    snap: () => snap(), parse, open: openPanel, close: closePanel, V,
  };
  function snap() {
    return { pending: V.pending ? { kind: V.pending.kind, title: typeof V.pending.title === 'function' ? V.pending.title() : V.pending.title, options: V.pending.options ? V.pending.options.map(o => o.label) : null } : null, log: V.log.slice(-4).map(m => (m.who === 'you' ? '> ' : '') + (m.html ? '[ayuda]' : m.text)), cart: S.cart.map(l => `${qtyFmt(l.qty)} ${l.name} @${l.price}`), recv: S.recv };
  }
})();
