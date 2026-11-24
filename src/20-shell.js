/* =====================================================================
   Estructura de la app: navegación, barra superior, pantallas de inicio
   ===================================================================== */
const VIEWS = {};
const NAV = [
  ['vender', 'Vender', 'cart', false], ['ventas', 'Ventas', 'receipt', false], ['productos', 'Productos', 'box', false],
  ['fiados', 'Fiados', 'users', false], ['caja', 'Caja', 'wallet', false], ['reportes', 'Reportes', 'file', false],
  ['resumen', 'Resumen', 'chart', true], ['contab', 'Contabilidad', 'book', true], ['cambios', 'Cambios', 'history', false], ['ajustes', 'Ajustes', 'gear', true],
];
const NO_SESSION_OK = new Set(['reportes', 'cambios', 'caja', 'ventas', 'resumen', 'contab', 'productos', 'fiados', 'ajustes', 'mas', 'ayuda']);
// Modo simple (el de siempre para quien atiende): pocos botones grandes. El modo completo muestra todo el menú.
const simpleMode = () => cfg().simple !== false;
const MORE_ITEMS = [
  ['ventas', 'Ventas de hoy', 'receipt', 'Ver, corregir o anular una venta'],
  ['productos', 'Productos', 'box', 'Precios, inventario y productos nuevos'],
  ['reportes', 'Reportes', 'file', 'Enviar o descargar el reporte del día'],
  ['contab', 'Contabilidad', 'book', 'Anotar gastos e ingresos del negocio'],
  ['resumen', 'Resumen', 'chart', 'Cuánto se ganó'],
  ['cambios', 'Cambios', 'history', 'Qué se corrigió y cuándo'],
  ['ajustes', 'Ajustes', 'gear', 'PIN, respaldo, voz y datos'],
  ['ayuda', 'Ayuda', 'info', 'Qué decir con la voz'],
];
const MORE_IDS = new Set(MORE_ITEMS.map(x => x[0]).concat(['mas']));
const CREDIT_URL = 'https://www.tiktok.com/@jhordycabascango21';
const CREDIT = 'Diseñado por';
const TT_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>';
const creditLink = () => `<a class="credit-link" href="${CREDIT_URL}" target="_blank" rel="noopener" aria-label="TikTok de Jhordy Cabascango" title="Abrir mi TikTok">${TT_ICON}</a>`;

function renderNav() {
  const nav = $('#nav');
  const brand = `<div class="brandmark"><b>B</b>${esc(cfg().storeName.slice(0, 12))}</div>`;
  if (simpleMode()) {
    const cur = id => S.view === id ? 'aria-current="page"' : '';
    nav.innerHTML = brand +
      `<button data-act="nav" data-v="vender" ${cur('vender')}>${ic('cart')}<span>Vender</span></button>` +
      `<button data-act="nav" data-v="caja" ${cur('caja')}>${ic('wallet')}<span>Caja</span></button>` +
      `<button class="nav-mv" data-act="mv-toggle" title="Mi Vecino">${ic('bank')}<span>Mi Vecino</span></button>` +
      `<button data-act="nav" data-v="fiados" ${cur('fiados')}>${ic('users')}<span>Fiados</span></button>` +
      `<button data-act="nav" data-v="mas" ${MORE_IDS.has(S.view) ? 'aria-current="page"' : ''}>${ic('menu')}<span>Más</span></button>` +
      `<div class="nav-sp"></div>`;
    return;
  }
  nav.innerHTML = brand + NAV.map(([id, label, icon, locked], i) =>
    `<button data-act="nav" data-v="${id}" ${S.view === id ? 'aria-current="page"' : ''} title="${label}">${ic(icon)}<span>${label}</span>${locked && !S.owner ? ic('lock', 'lockdot') : ''}</button>` + (i === 0 ? `<button class="nav-mv" data-act="mv-toggle" title="Mi Vecino">${ic('bank')}<span>Mi Vecino</span></button>` : '')).join('') +
    `<div class="nav-sp"></div>`;
}
function renderTop() {
  const v = VIEWS[S.view] || { title: '' };
  const ses = curSession();
  const sum_ = ses ? sessionSummary(ses.id) : null;
  const edits = ses ? sessionEdits(ses.id).length : 0;
  const c = cfg();
  const days = c.lastBackup ? Math.floor((Date.now() - new Date(c.lastBackup)) / 86400000) : null;
  const title = esc(typeof v.title === 'function' ? v.title() : v.title);
  if (simpleMode()) {
    $('#top').innerHTML = `${MORE_IDS.has(S.view) && S.view !== 'mas' ? `<button class="btn ghost back" data-act="nav" data-v="mas" aria-label="Volver a Más">← Más</button>` : ''}<h1>${title}</h1><span class="sp"></span>
      ${S.owner ? `${edits ? `<button class="chip warn" data-act="go-changes" title="Ver las modificaciones de hoy">${ic('alert', 'sm')} ${edits}</button>` : ''}${S.owner && (days === null ? list('sales').length > 20 : days >= 7) ? `<button class="chip bad" data-act="nav" data-v="ajustes">${ic('down', 'sm')} Falta respaldo</button>` : ''}<button class="chip info" data-act="toggle-owner" title="Salir del modo dueño">${ic('unlock', 'sm')} Dueño</button>` : ''}
      <button class="btn mic-btn ${S.voiceOpen ? 'on' : ''}" data-act="voice-toggle" title="Hablar con el sistema (F4)" aria-label="Hablar con el sistema">${ic('mic')}<span>Hablar</span></button>
      ${ses ? `<button class="btn soft-danger" data-act="nav" data-v="cierre">Cerrar caja</button>` : `<button class="btn primary" data-act="open-gate">Abrir caja</button>`}`;
    return;
  }
  $('#top').innerHTML = `<h1>${title}</h1><span class="sp"></span>
    <button class="btn mic-btn ${S.voiceOpen ? 'on' : ''}" data-act="voice-toggle" title="Hablar con el sistema (F4)" aria-label="Hablar con el sistema">${ic('mic')}<span>Hablar</span></button>
    ${ses ? `<button class="chip ok hide-m hide-md" data-act="nav" data-v="caja" title="Ver la caja">${ic('wallet', 'sm')} Caja abierta ${fmtTime(ses.openedAt)}</button>
      <span class="chip hide-m" title="Efectivo que debería haber en la tienda">${ic('cash', 'sm')} Tienda <b class="num">${money(sum_.tiendaExpected)}</b></span>` : ''}
    ${edits ? `<button class="chip warn" data-act="go-changes" title="Ver las modificaciones de hoy">${ic('alert', 'sm')} ${edits} modificación${edits > 1 ? 'es' : ''} hoy</button>` : ''}
    ${S.owner && (days === null ? list('sales').length > 20 : days >= 7) ? `<button class="chip bad" data-act="nav" data-v="ajustes">${ic('down', 'sm')} Falta respaldo</button>` : ''}
    <button class="chip ${S.owner ? 'info' : ''}" data-act="toggle-owner" title="${S.owner ? 'Volver a modo cajera' : 'Entrar al modo dueño'}">${ic(S.owner ? 'unlock' : 'lock', 'sm')} ${S.owner ? 'Dueño' : 'Cajera'}</button>
    ${ses ? `<button class="btn sm soft-danger" data-act="nav" data-v="cierre">Cerrar caja</button>` : `<button class="btn sm primary" data-act="open-gate">Abrir caja</button>`}`;
}
function renderView() {
  const v = VIEWS[S.view];
  const root = $('#view');
  if (!v) { root.innerHTML = ''; return; }
  root.innerHTML = v.render();
  if (v.after) v.after();
}
function renderAll() {
  document.body.classList.toggle('simple', simpleMode());
  renderNav(); renderTop(); renderView(); if (typeof renderMV === 'function') renderMV();
  const fab = $('#mvFab'); if (fab) fab.hidden = !curSession();
}
function go(view) {
  S.view = view;
  document.body.classList.remove('mv-open');
  if (checkGates()) return;
  renderAll();
  const vw = $('#view'); if (vw) vw.scrollTop = 0;
  focusScan();
}
function focusScan() {
  if (S.view !== 'vender' || modalStack.length || !$('#gate').hidden) return;
  if (S.voiceOpen && document.activeElement && document.activeElement.closest && document.activeElement.closest('#vpanel')) return;
  const el = $('#scan');
  if (el && document.activeElement !== el) el.focus();
}
ACT['nav'] = async t => {
  const id = t.dataset.v;
  const locked = (NAV.find(n => n[0] === id) || [])[3];
  if (locked && !S.owner) { if (!(await requireOwner('Esta sección es solo para el dueño. Escribe tu PIN.'))) return; }
  go(id);
};
ACT['toggle-owner'] = async () => {
  if (S.owner) {
    S.owner = false;
    if (NAV.find(n => n[0] === S.view && n[3])) S.view = 'vender';
    renderAll(); toast('Modo cajera');
  } else await requireOwner('Escribe tu PIN para entrar al modo dueño.');
};
ACT['go-changes'] = () => { const s = curSession(); S.audit = { from: s ? s.date : today(), to: s ? s.date : today(), only: 'edits' }; go('cambios'); };
ACT['mv-toggle'] = () => { document.body.classList.toggle('mv-open'); };
ACT['mode-toggle'] = () => {
  const c = cfg(); c.simple = !simpleMode(); saveCfg();
  if (!c.simple && S.view === 'mas') S.view = 'vender';
  renderAll(); toast(c.simple ? 'Modo simple' : 'Modo completo (todos los menús)');
};

/* ---------- Pantalla «Más» y «Ayuda» (modo simple) ---------- */
VIEWS.mas = {
  title: 'Más',
  render() {
    const lockedIds = new Set(NAV.filter(n => n[3]).map(n => n[0]));
    return `<div class="more">
      <div class="more-grid">${MORE_ITEMS.map(([id, label, icon, sub]) => `<button class="more-card" data-act="nav" data-v="${id}">${ic(icon, 'lg')}<span class="mt">${label}${lockedIds.has(id) && !S.owner ? ic('lock', 'sm') : ''}</span><span class="ms">${sub}</span></button>`).join('')}</div>
      <div class="more-sw">
        <button class="btn lg" data-act="toggle-owner">${ic(S.owner ? 'unlock' : 'lock')} ${S.owner ? 'Salir del modo dueño' : 'Entrar como dueño (PIN)'}</button>
        <button class="btn lg" data-act="mode-toggle">${ic('eye')} Ver el sistema completo</button>
      </div>
    </div>`;
  },
};
const HELP_GROUPS = [
  ['Vender', ['«vende 2 leche y 3 pan»', '«cobrar» · «paga con 5»', '«fiado a doña Rosa una leche»', '«anula la última venta»']],
  ['Caja', ['«abre la caja igual que ayer»', '«cierra la caja»', '«¿cuánto vendí hoy?»']],
  ['Dinero', ['«anota un gasto de 5 en fundas»', '«ingreso de 10 por venta de cartón»', '«retiro del dueño de 20»']],
  ['Mi Vecino', ['«retiro 50 pichincha»', '«depósito 30 guayaquil»', '«consulta de saldo»']],
  ['Otras', ['«¿qué se está acabando?»', '«¿quién me debe?»', '«envía el reporte por WhatsApp»', '«deshacer»']],
];
VIEWS.ayuda = {
  title: 'Ayuda',
  render() {
    return `<div class="help">
      <div class="help-steps">
        <div><b>1</b><span>Toca <b>Hablar</b></span></div>
        <div><b>2</b><span>Di lo que quieres hacer</span></div>
        <div><b>3</b><span>Di <b>«sí»</b> para confirmar</span></div>
      </div>
      <button class="btn xl mic-btn" data-act="voice-toggle">${ic('mic')} Probar ahora</button>
      <p class="muted center" style="margin:0">Si no hay internet o hay mucho ruido, escribe la orden en el cuadro del asistente.</p>
      <div class="help-groups">${HELP_GROUPS.map(([t, ex]) => `<div class="card flat"><h3>${t}</h3><ul>${ex.map(e => `<li>${e}</li>`).join('')}</ul></div>`).join('')}</div>
    </div>`;
  },
};

/* Bloqueo automático del modo dueño */
setInterval(() => {
  if (S.owner && cfg().lockMinutes > 0 && Date.now() - S.lastAct > cfg().lockMinutes * 60000) {
    S.owner = false;
    if (NAV.find(n => n[0] === S.view && n[3])) S.view = 'vender';
    renderAll(); toast('Modo dueño bloqueado por inactividad', { type: 'warn' });
  }
}, 20000);

/* ---------- Pantallas obligatorias (puertas) ---------- */
function showGate(html) { const g = $('#gate'); g.innerHTML = `<div class="gate-in">${html}</div>`; g.hidden = false; }
function hideGate() { const g = $('#gate'); g.hidden = true; g.innerHTML = ''; }
function checkGates() {
  document.body.classList.toggle('simple', simpleMode());
  const c = cfg();
  if (!c.setupDone) { renderSetup(); return true; }
  const ses = curSession();
  if (!ses) {
    if (S.skipOpen && NO_SESSION_OK.has(S.view)) { if (!$('#gate').hidden) hideGate(); return false; }
    S.skipOpen = false; renderOpenGate(); return true;
  }
  if (ses.date < today() && S.view !== 'cierre') { renderStaleGate(ses); return true; }
  if (!$('#gate').hidden) hideGate();
  return false;
}
const creditHTML = () => `<div class="credit-inline"><span>${CREDIT}</span>${creditLink()}</div>`;

/* --- Primera vez --- */
let setupOwners = [];
function setupOwnersHTML() {
  return setupOwners.map((n, i) => `<span class="chip">${esc(n)} <button class="btn ghost sm icon" data-act="st-del" data-i="${i}" aria-label="Quitar" style="min-height:22px;width:22px">${ic('x', 'sm')}</button></span>`).join('') || '<span class="muted sm">Aún no agregas dueños de productos.</span>';
}
function renderSetup() {
  if (!$('#gate').hidden && $('#st-name')) return;
  setupOwners = [];
  showGate(`<div><h1>Bienvenido a Bhalleffort</h1><p class="muted" style="margin:4px 0 0">Sistema de ventas para tienda de abarrotes. Solo se hace una vez.</p></div>
    <div class="bigfield"><label class="f">Nombre del negocio<input class="in lg" id="st-name" value="BHALLEFFORT"></label></div>
    <div class="bigfield"><div class="t">${ic('lock')} PIN del dueño</div><div class="h">Con este PIN se entra al modo dueño (resumen, contabilidad, ajustes). Solo números, mínimo 4.</div>
      <div class="grid g2"><label class="f">PIN<input class="in lg" id="st-pin" type="password" inputmode="numeric" maxlength="8" autocomplete="off"></label>
      <label class="f">Repite el PIN<input class="in lg" id="st-pin2" type="password" inputmode="numeric" maxlength="8" autocomplete="off"></label></div></div>
    <div class="bigfield"><div class="t">${ic('users')} Dueños de los productos</div><div class="h">La tienda ya está incluida. Agrega a cada persona que tenga productos en tu tienda (puedes agregar más después, sin límite).</div>
      <div class="row nowrap"><input class="in lg" id="st-owner" placeholder="Nombre del dueño" data-key="st-owner"><button class="btn lg primary" data-act="st-add">${ic('plus')} Agregar</button></div>
      <div class="row" id="st-owners">${setupOwnersHTML()}</div></div>
    <div class="bigfield"><div class="t">${ic('chat')} WhatsApp para reportes (opcional)</div>
      <div class="grid g2"><label class="f">Dueño de la tienda<input class="in" id="st-ph1" inputmode="tel" placeholder="09XXXXXXXX"></label><label class="f">Dueño de Mi Vecino<input class="in" id="st-ph2" inputmode="tel" placeholder="09XXXXXXXX"></label></div></div>
    <label class="chk"><input type="checkbox" id="st-simple" checked> Modo simple: menos botones, más fácil (se puede cambiar en «Más»)</label>
    <label class="chk"><input type="checkbox" id="st-demo"> Cargar productos de ejemplo para probar (se pueden borrar en Ajustes)</label>
    <div id="st-err" class="alert bad" hidden></div>
    <button class="btn xl primary" data-act="st-go">Empezar</button>${creditHTML()}`);
  setTimeout(() => $('#st-name')?.focus(), 50);
}
ACT['st-add'] = () => {
  const i = $('#st-owner'); const n = i.value.trim();
  if (n && !setupOwners.some(x => norm(x) === norm(n)) && norm(n) !== 'tienda') { setupOwners.push(n); $('#st-owners').innerHTML = setupOwnersHTML(); }
  i.value = ''; i.focus();
};
KEY['st-owner'] = (t, e) => { if (e.key === 'Enter') { e.preventDefault(); ACT['st-add'](); } };
ACT['st-del'] = t => { setupOwners.splice(+t.dataset.i, 1); $('#st-owners').innerHTML = setupOwnersHTML(); };
ACT['st-go'] = async () => {
  const err = $('#st-err'); err.hidden = true;
  const pin = $('#st-pin').value.trim(), pin2 = $('#st-pin2').value.trim();
  const fail = m => { err.textContent = m; err.hidden = false; err.scrollIntoView({ block: 'center' }); };
  if (!$('#st-name').value.trim()) return fail('Escribe el nombre del negocio.');
  if (!/^\d{4,8}$/.test(pin)) return fail('El PIN debe tener de 4 a 8 números.');
  if (pin !== pin2) return fail('Los dos PIN no son iguales.');
  const pend = $('#st-owner').value.trim();
  if (pend) { ACT['st-add'](); }
  const c = cfg();
  c.storeName = $('#st-name').value.trim().toUpperCase();
  c.simple = !!$('#st-simple')?.checked;
  c.phones = { tienda: $('#st-ph1').value.trim(), mv: $('#st-ph2').value.trim() };
  await setPin(pin);
  put('owners', { id: 'own', name: 'Tienda', phone: c.phones.tienda, slot: 1, isStore: true, active: true });
  setupOwners.forEach(n => addOwner(n));
  c.accountingOwnerId = 'own';
  c.setupDone = true;
  saveCfg();
  if ($('#st-demo').checked) loadDemo();
  audit('Configuración inicial', 'Se configuró el sistema', {});
  hideGate();
  checkGates();
};

/* --- Abrir caja (obligatorio cada día) --- */
function renderOpenGate() {
  if (!$('#gate').hidden && $('#og-t')) return;
  const prev = lastClosedSession();
  const pc = prev ? prev.closing.counted : null;
  const hint = k => pc ? `Cerró ${prev.date === today() ? 'hoy' : fmtDate(prev.date)} con ${money(pc[k])}` : 'Cuenta lo que hay ahora y escríbelo';
  const val = k => pc ? pc[k].toFixed(2) : '';
  const field = (id, ico, title, k) => `<div class="bigfield"><div class="t">${ic(ico)} ${title}</div><div class="h">${hint(k)}</div>
    <div class="row nowrap"><span class="num" style="font-size:28px;font-weight:800">$</span><input class="in xl num-in" id="${id}" inputmode="decimal" value="${val(k)}" placeholder="0.00" data-key="og-next"></div></div>`;
  const hr = new Date().getHours();
  if (simpleMode() && pc && !S.ogEdit) {
    const rows = [['tienda', 'Efectivo de la tienda'], ['mvCash', 'Efectivo de Mi Vecino'], ['pichincha', 'Cuenta Pichincha'], ['guayaquil', 'Cuenta Guayaquil']];
    showGate(`<div><h1 id="og-t">${hr < 12 ? 'Buenos días' : hr < 19 ? 'Buenas tardes' : 'Buenas noches'}</h1>
      <p class="muted" style="margin:4px 0 0">${esc(fmtDateLong(today()))}. Esto quedó en el último cierre${prev.date === today() ? ' (de hoy)' : ` (${esc(fmtDate(prev.date))})`}:</p></div>
      <div class="og-sum">${rows.map(([k, n]) => `<div><span>${n}</span><b class="num">${money(pc[k])}</b></div>`).join('')}</div>
      <button class="btn xl primary" data-act="og-same" id="og-btn">ABRIR CAJA</button>
      <button class="btn lg" data-act="og-edit">No coincide: contar de nuevo</button>
      <button class="btn lg mic-btn" data-act="voice-toggle" id="og-voice">${ic('mic')} <span>O di «abre la caja»</span></button>
      <button class="btn ghost" data-act="og-skip">Ver reportes sin abrir la caja todavía</button>${creditHTML()}`);
    return;
  }
  showGate(`<div><h1 id="og-t">${hr < 12 ? 'Buenos días' : hr < 19 ? 'Buenas tardes' : 'Buenas noches'}. Abre la caja para vender</h1>
    <p class="muted" style="margin:4px 0 0">${esc(fmtDateLong(today()))}. Cuenta el dinero y confirma. ${pc ? 'Los valores vienen del último cierre; corrígelos si no coinciden.' : ''}</p></div>
    <div class="muted sm" style="font-weight:700">LA TIENDA</div>
    ${field('og-tienda', 'cash', 'Efectivo de la tienda', 'tienda')}
    <div class="muted sm" style="font-weight:700">MI VECINO</div>
    ${field('og-mvcash', 'cash', 'Efectivo de Mi Vecino', 'mvCash')}
    <div class="grid g2">${field('og-pich', 'bank', 'Saldo cuenta Pichincha', 'pichincha')}${field('og-guay', 'bank', 'Saldo cuenta Guayaquil', 'guayaquil')}</div>
    <div id="og-err" class="alert bad" hidden></div>
    <button class="btn xl primary" data-act="og-go" id="og-btn">ABRIR CAJA E INICIAR</button>
    <button class="btn lg mic-btn" data-act="voice-toggle" id="og-voice">${ic('mic')} <span>O di «abre la caja» y te voy preguntando</span></button>
    ${prev ? `<button class="btn" data-act="og-skip">Ver reportes y datos sin abrir la caja todavía</button>` : ''}${creditHTML()}`);
  setTimeout(() => { const f = $('#og-tienda'); f?.focus(); f?.select(); }, 60);
}
ACT['og-same'] = () => { const prev = lastClosedSession(); if (!prev) return; const c = prev.closing.counted; openCaja({ tienda: r2(c.tienda), mvCash: r2(c.mvCash), pichincha: r2(c.pichincha), guayaquil: r2(c.guayaquil) }); };
ACT['og-edit'] = () => { S.ogEdit = true; hideGate(); renderOpenGate(); };
ACT['og-skip'] = () => { S.skipOpen = true; S.view = 'reportes'; hideGate(); renderAll(); };
ACT['open-gate'] = () => { S.skipOpen = false; S.view = 'vender'; checkGates(); };
KEY['og-next'] = (t, e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const ids = ['og-tienda', 'og-mvcash', 'og-pich', 'og-guay'];
  const i = ids.indexOf(t.id);
  if (i < ids.length - 1) { const n = $('#' + ids[i + 1]); n.focus(); n.select(); } else ACT['og-go']();
};
ACT['og-go'] = () => {
  const ids = ['og-tienda', 'og-mvcash', 'og-pich', 'og-guay'];
  const err = $('#og-err'); err.hidden = true;
  for (const id of ids) {
    const raw = $('#' + id).value.trim();
    if (raw === '' || isNaN(parseFloat(raw.replace(',', '.'))) || num(raw) < 0) {
      err.textContent = 'Escribe un valor en todos los campos (si no hay dinero, escribe 0).'; err.hidden = false; $('#' + id).focus(); return;
    }
  }
  openCaja({ tienda: r2(num($('#og-tienda').value)), mvCash: r2(num($('#og-mvcash').value)), pichincha: r2(num($('#og-pich').value)), guayaquil: r2(num($('#og-guay').value)) });
};
// Abre la caja del día (la usan el botón y la voz)
function openCaja(opening, said = '') {
  S.ogEdit = false;
  const prev = lastClosedSession();
  const s = put('sessions', { id: uid(), date: today(), openedAt: new Date().toISOString(), status: 'open', opening, openedBy: roleName(), closing: null, byVoice: !!said });
  const diffs = [];
  if (prev) {
    const pc = prev.closing.counted;
    [['tienda', 'Efectivo tienda'], ['mvCash', 'Efectivo Mi Vecino'], ['pichincha', 'Saldo Pichincha'], ['guayaquil', 'Saldo Guayaquil']].forEach(([k, n]) => { if (r2(opening[k]) !== r2(pc[k])) diffs.push(`${n}: cierre ${money(pc[k])} → apertura ${money(opening[k])}`); });
  }
  audit(said ? 'Caja abierta (por voz)' : 'Caja abierta', `Apertura: tienda ${money(opening.tienda)}, Mi Vecino efectivo ${money(opening.mvCash)}, Pichincha ${money(opening.pichincha)}, Guayaquil ${money(opening.guayaquil)}${diffs.length ? '. Diferencias con el último cierre: ' + diffs.join('; ') : ''}${said ? `. Dijo: «${said}»` : ''}`, { entity: 'session', entityId: s.id, edit: diffs.length > 0 });
  hideGate();
  S.view = 'vender';
  renderAll();
  toast(`Caja abierta. ¡Buen día de ventas!`, { type: 'ok' });
  focusScan();
  return s;
}

/* --- Caja de un día anterior sin cerrar --- */
function renderStaleGate(ses) {
  showGate(`<div><h1>Falta cerrar la caja del ${esc(fmtDate(ses.date))}</h1><p class="muted" style="margin:4px 0 0">Para empezar un día nuevo, primero se cierra la caja que quedó abierta. Así los reportes de cada día quedan correctos.</p></div>
    <div class="alert warn">${ic('alert')}<span>Caja abierta el ${esc(fmtDateLong(ses.date))} a las ${fmtTime(ses.openedAt)}.</span></div>
    <button class="btn xl primary" data-act="stale-close">CERRAR CAJA DE ${esc(fmtDate(ses.date))}</button>
    <button class="btn lg mic-btn" data-act="voice-toggle">${ic('mic')} <span>O di «cierra la caja»</span></button>${creditHTML()}`);
}
ACT['stale-close'] = () => { hideGate(); S.view = 'cierre'; renderAll(); };

/* ---------- Teclado global (lector de códigos) ---------- */
document.addEventListener('keydown', e => {
  if (S.view !== 'vender' || modalStack.length || !$('#gate').hidden) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tg = e.target;
  const typing = tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT' || tg.isContentEditable);
  if (!typing && e.key.length === 1) { const el = $('#scan'); if (el) el.focus(); }
  if (e.key === 'F9') { e.preventDefault(); ACT['pos-fiado']?.(); }
  if (e.key === 'F12') { e.preventDefault(); ACT['pos-cobrar']?.(); }
  if (e.key === 'F2') { e.preventDefault(); $('#scan')?.focus(); }
});
