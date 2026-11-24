/* =====================================================================
   CAJA: resumen del día, ingresos/egresos, cierre obligatorio, historial
   ===================================================================== */
const MOVE_CATS = {
  out: [['gasto', 'Gasto del negocio (luz, arriendo, fundas…)'], ['compra', 'Pago a proveedor / compra de mercadería'], ['retiro', 'Retiro del dueño'], ['otro', 'Otro egreso']],
  in: [['aporte', 'Aporte o dinero que entra'], ['otro', 'Otro ingreso']],
};
S.cajaHist = null;
VIEWS.caja = {
  title: 'Caja',
  render() {
    const ses = curSession();
    return `<div class="tabs" role="tablist"><button role="tab" data-act="caja-tab" data-t="hoy" aria-selected="${S.cajaTab === 'hoy'}">Caja de hoy</button><button role="tab" data-act="caja-tab" data-t="hist" aria-selected="${S.cajaTab === 'hist'}">Cajas anteriores</button></div>${S.cajaTab === 'hoy' ? (ses ? cajaHoyHTML(ses) : '<div class="empty card">La caja está cerrada.</div>') : cajaHistHTML()}`;
  },
};
ACT['caja-tab'] = t => { S.cajaTab = t.dataset.t; renderView(); };
const line = (label, val, o = {}) => `<div class="row nowrap" style="padding:5px 0;${o.top ? 'border-top:2px solid var(--line);margin-top:4px;padding-top:9px;' : ''}"><span class="${o.muted ? 'muted' : ''}" style="flex:1;min-width:0;${o.bold ? 'font-weight:800' : ''}">${label}</span><span class="num" style="font-weight:${o.bold ? 800 : 700};font-size:${o.big ? 26 : 16}px;${o.color ? 'color:' + o.color : ''}">${val}</span></div>`;
function cajaHoyHTML(ses) {
  const sm = sessionSummary(ses.id);
  const mvIn = r2(sum(sm.ops.filter(o => OPS[o.type].cash > 0), o => o.amount)), mvOut = r2(sum(sm.ops.filter(o => OPS[o.type].cash < 0), o => o.amount));
  const comCash = r2(sum(sm.ops.filter(o => o.commissionCash), o => o.commission));
  const dayMoves = sm.moves.slice().sort((a, b) => a.ts < b.ts ? 1 : -1);
  return `<div class="grid g2">
    <div class="card"><h3>${ic('cash')} Efectivo de la tienda</h3>
      ${line('Caja inicial', money(ses.opening.tienda), { muted: true })}
      ${line(`+ Ventas en efectivo (${sm.sales.filter(s => s.payType === 'efectivo').length})`, money(sm.cashSales))}
      ${line('+ Cobros de fiados', money(sm.debtCollected))}
      ${line('+ Otros ingresos', money(sm.tIn))}
      ${line('− Egresos (gastos, proveedores)', money(sm.tOut))}
      ${line('Debería haber en caja', money(sm.tiendaExpected), { top: true, bold: true, big: true, color: 'var(--brand)' })}
      <div class="alert info" style="margin-top:10px">${ic('info', 'sm')}<span>Ventas a fiado de hoy: <b>${money(sm.fiadoSales)}</b>. No suman al efectivo hasta que se cobren. Deudas totales por cobrar: <b>${money(totalDebt())}</b>.</span></div>
    </div>
    <div class="card"><h3>${ic('bank')} Mi Vecino</h3>
      ${line('Efectivo inicial', money(ses.opening.mvCash), { muted: true })}
      ${line(`+ Entradas de efectivo (depósitos, servicios)`, money(mvIn))}
      ${line('− Salidas de efectivo (retiros)', money(mvOut))}
      ${comCash ? line('+ Comisiones cobradas', money(comCash)) : ''}
      ${line('± Otros movimientos', money(sm.mIn - sm.mOut))}
      ${line('Debería haber en efectivo', money(sm.mvCash), { top: true, bold: true, big: true, color: 'var(--brand)' })}
      <hr>
      ${line(`${bankBadge('pichincha')} Cuenta Pichincha: inicio ${money(ses.opening.pichincha)}`, money(sm.bankBal.pichincha), { bold: true })}
      ${line(`${bankBadge('guayaquil')} Cuenta Guayaquil: inicio ${money(ses.opening.guayaquil)}`, money(sm.bankBal.guayaquil), { bold: true })}
      <div class="xs muted" style="margin-top:6px">${sm.ops.length} operaciones hoy (${sm.ops.filter(o => o.type === 'consulta').length} consultas de saldo)${sm.commissions ? ` · comisiones ${money(sm.commissions)}` : ''}</div>
    </div>
  </div>
  <div class="card" style="margin-top:14px"><div class="row"><h3 style="margin:0">Ingresos y egresos de efectivo</h3><span class="sp"></span><button class="btn primary" data-act="move-new">${ic('plus')} Registrar movimiento</button></div>
    ${dayMoves.length ? `<div class="tblwrap" style="margin-top:10px"><table class="tbl"><thead><tr><th>Hora</th><th>Dónde</th><th>Concepto</th><th class="r">Monto</th><th></th></tr></thead><tbody>${dayMoves.map(m => `<tr><td>${fmtTime(m.ts)}</td><td>${m.scope === 'mv' ? 'Mi Vecino' : 'Tienda'}</td><td>${esc(m.concept)}<div class="xs muted">${esc((MOVE_CATS[m.kind].find(c => c[0] === m.category) || [0, m.category])[1])}</div></td><td class="r num" style="color:${m.kind === 'in' ? 'var(--good)' : 'var(--danger)'}"><b>${m.kind === 'in' ? '+' : '−'}${money(m.amount)}</b></td><td class="r"><button class="btn ghost sm icon" data-act="move-del" data-id="${m.id}" aria-label="Eliminar">${ic('trash', 'sm')}</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted" style="margin:8px 0 0">Aquí se anotan los gastos, pagos a proveedores o retiros del dueño. Hoy no hay movimientos.</p>'}
  </div>
  <div class="center" style="margin:18px 0 6px"><button class="btn xl soft-danger" data-act="nav" data-v="cierre">Cerrar caja del día</button></div>`;
}
ACT['move-new'] = () => {
  const h = modal({
    title: 'Registrar movimiento de efectivo', size: '',
    html: `<div class="col"><div class="seg" id="mn-kind"><button data-act="mn-kind" data-k="out" aria-pressed="true">Sale dinero</button><button data-act="mn-kind" data-k="in" aria-pressed="false">Entra dinero</button></div>
      <div class="seg" id="mn-scope"><button data-act="mn-scope" data-s="tienda" aria-pressed="true">De la tienda</button><button data-act="mn-scope" data-s="mv" aria-pressed="false">De Mi Vecino</button></div>
      <label class="f">Tipo<select class="in" id="mn-cat"></select></label>
      <label class="f">Concepto<input class="in" id="mn-concept" placeholder="Ej.: pago de luz, fundas, proveedor Pepsi" autofocus></label>
      <label class="f">Monto<input class="in xl num-in" id="mn-amt" inputmode="decimal" placeholder="0.00"></label>
      <label class="chk" id="mn-accw"><input type="checkbox" id="mn-acc" checked> Anotarlo también en la contabilidad de <b id="mn-accn"></b></label></div>`,
    actions: [{ label: 'Cancelar' }, { label: 'Guardar', cls: 'primary', onClick: hh => {
      const amt = r2(num(hh.$('#mn-amt').value)); const concept = hh.$('#mn-concept').value.trim();
      if (!concept) { toast('Escribe el concepto', { type: 'warn' }); return false; }
      if (!(amt > 0)) { toast('Escribe el monto', { type: 'warn' }); return false; }
      const ses = curSession();
      const kind = hh._kind || 'out', scope = hh._scope || 'tienda', cat = hh.$('#mn-cat').value;
      const toAcc = !hh.$('#mn-accw').hidden && hh.$('#mn-acc').checked;
      if (scope === 'tienda' && toAcc) {
        const mk = kind === 'in' ? 'ingreso' : cat === 'compra' ? 'compra' : 'gasto';
        const r = recordMoney({ kind: mk, amount: amt, concept, fromCash: true, accounting: true });
        if (r.move && r.move.category !== cat) { r.move.category = cat; put('cashMoves', r.move); }
      } else {
        put('cashMoves', { id: uid(), ts: new Date().toISOString(), date: ses.date, sessionId: ses.id, scope, kind, category: cat, concept, amount: amt });
        audit('Movimiento de efectivo', `${kind === 'in' ? 'Entró' : 'Salió'} ${money(amt)} (${scope === 'mv' ? 'Mi Vecino' : 'Tienda'}): ${concept}`, { entity: 'cashMove' });
      }
      toast('Movimiento guardado', { type: 'ok' }); renderTop(); renderMV(); if (S.view === 'caja') renderView();
    } }],
    onOpen: hh => {
      hh._kind = 'out'; hh._scope = 'tienda';
      hh.$('#mn-accn').textContent = ownerName(accOwnerId());
      const accVis = () => { const cat = hh.$('#mn-cat').value; hh.$('#mn-accw').hidden = !(hh._scope === 'tienda' && (hh._kind === 'in' || cat === 'gasto' || cat === 'compra')); };
      const cats = () => { hh.$('#mn-cat').innerHTML = MOVE_CATS[hh._kind].map(c => `<option value="${c[0]}">${c[1]}</option>`).join(''); accVis(); };
      cats();
      hh.$('#mn-cat').addEventListener('change', accVis);
      hh.el.addEventListener('click', e => {
        const b = e.target.closest('[data-act]'); if (!b) return;
        if (b.dataset.act === 'mn-kind') { hh._kind = b.dataset.k; $$('#mn-kind button', hh.el).forEach(x => x.setAttribute('aria-pressed', x === b)); cats(); }
        if (b.dataset.act === 'mn-scope') { hh._scope = b.dataset.s; $$('#mn-scope button', hh.el).forEach(x => x.setAttribute('aria-pressed', x === b)); accVis(); }
      });
      hh.$('#mn-amt').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); hh.el.querySelector('footer .primary').click(); } });
    },
  });
};
ACT['mn-kind'] = () => { }; ACT['mn-scope'] = () => { };
ACT['move-del'] = async t => {
  const m = get('cashMoves', t.dataset.id); if (!m) return;
  if (!(await ask({ title: 'Eliminar movimiento', msg: `¿Eliminar «${m.concept}» por ${money(m.amount)}?${m.accId && get('accounting', m.accId) ? ' También se quita de la contabilidad.' : ''} Queda anotado en el historial de cambios.`, ok: 'Eliminar', danger: true }))) return;
  removeMoney(m);
  renderTop(); renderMV(); renderView();
};

/* --- Historial de cajas --- */
function cajaHistHTML() {
  const ss = sessionsSorted().reverse();
  if (!ss.length) return '<div class="empty card">Aún no hay cajas.</div>';
  return `<div class="tblwrap"><table class="tbl"><thead><tr><th>Fecha</th><th>Horario</th><th class="r">Ventas</th><th class="r">Diferencia tienda</th><th class="r">Modificaciones</th><th></th></tr></thead><tbody>${ss.map(s => {
    const sm = sessionSummary(s.id);
    const diff = s.closing ? s.closing.diff.tienda : null;
    return `<tr><td><b>${fmtDate(s.date)}</b></td><td>${fmtTime(s.openedAt)}${s.closedAt ? ' – ' + fmtTime(s.closedAt) : ' · <span class="badge ok">abierta</span>'}</td><td class="r num">${money(sm.totalSales)}</td>
      <td class="r num">${diff === null ? '—' : diff === 0 ? '<span class="badge ok">Cuadra</span>' : `<span class="badge ${diff < 0 ? 'bad' : 'warn'}">${diff > 0 ? 'Sobra ' : 'Falta '}${money(Math.abs(diff))}</span>`}</td>
      <td class="r">${s.closing ? (s.closing.editCount ? `<span class="badge warn">${s.closing.editCount}</span>` : '0') : '—'}</td>
      <td class="r nowrap"><button class="btn sm" data-act="ses-view" data-id="${s.id}">Ver</button>${S.owner && s.status === 'closed' ? ` <button class="btn sm ghost" data-act="ses-reopen" data-id="${s.id}">Reabrir</button>` : ''}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}
ACT['ses-view'] = t => {
  const s = get('sessions', t.dataset.id); if (!s) return;
  const sm = sessionSummary(s.id), c = s.closing;
  const edits = sessionEdits(s.id);
  const row = (n, k) => c ? `<tr><td>${n}</td><td class="r num">${money(c.expected[k])}</td><td class="r num">${money(c.counted[k])}</td><td class="r">${c.diff[k] === 0 ? '<span class="badge ok">Cuadra</span>' : `<span class="badge ${c.diff[k] < 0 ? 'bad' : 'warn'}">${c.diff[k] > 0 ? 'Sobra ' : 'Falta '}${money(Math.abs(c.diff[k]))}</span>`}</td></tr>` : '';
  modal({
    title: `Caja del ${fmtDate(s.date)}`, size: 'wide',
    html: `<div class="row" style="margin-bottom:8px"><span class="chip">Abierta ${fmtTime(s.openedAt)} por ${esc(s.openedBy || '')}</span>${s.closedAt ? `<span class="chip">Cerrada ${fmtTime(s.closedAt)} por ${esc(c.closedBy || '')}</span>` : '<span class="chip ok">Abierta</span>'}</div>
      <div class="grid g4" style="margin-bottom:10px"><div class="card kpi flat"><span class="l">Ventas</span><span class="v">${money(sm.totalSales)}</span><span class="d eq">${sm.count} ventas</span></div><div class="card kpi flat"><span class="l">Efectivo</span><span class="v">${money(sm.cashSales)}</span></div><div class="card kpi flat"><span class="l">Fiado</span><span class="v">${money(sm.fiadoSales)}</span></div><div class="card kpi flat"><span class="l">Cobros de fiado</span><span class="v">${money(sm.debtCollected)}</span></div></div>
      ${c ? `<div class="tblwrap"><table class="tbl"><thead><tr><th>Conteo al cerrar</th><th class="r">Debía haber</th><th class="r">Se contó</th><th class="r">Resultado</th></tr></thead><tbody>${row('Efectivo tienda', 'tienda')}${row('Efectivo Mi Vecino', 'mvCash')}${row('Cuenta Pichincha', 'pichincha')}${row('Cuenta Guayaquil', 'guayaquil')}</tbody></table></div>${c.notes ? `<p><b>Nota:</b> ${esc(c.notes)}</p>` : ''}
      ${c.accounting ? `<p class="muted sm">Se añadió a contabilidad de <b>${esc(ownerName(c.accounting.ownerId))}</b>: ventas ${money(c.accounting.sales)}.</p>` : ''}` : ''}
      <h3 style="font-size:15px;margin:14px 0 6px">Modificaciones de esta caja (${edits.length})</h3>
      ${edits.length ? `<div class="tblwrap"><table class="tbl"><tbody>${edits.map(a => `<tr><td class="nowrap">${fmtTime(a.ts)}</td><td><b>${esc(a.action)}</b><div class="sm">${esc(a.summary)}</div></td><td>${esc(a.user)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No hubo modificaciones.</p>'}`,
    actions: [{ label: 'Informe PDF del cierre', onClick: () => { S.rep.who = 'cierre'; S.rep.sessionId = s.id; S.rep.model = null; closeTopModal(); go('reportes'); return false; }, keep: true }, { label: 'Cerrar', cls: 'primary' }],
  });
};
ACT['ses-reopen'] = async t => {
  const s = get('sessions', t.dataset.id); if (!s) return;
  if (curSession()) { toast('Ya hay una caja abierta. Ciérrala primero.', { type: 'warn' }); return; }
  if (!(await ask({ title: 'Reabrir caja', msg: `¿Reabrir la caja del ${fmtDate(s.date)}? Se podrá vender y corregir de nuevo; luego hay que cerrarla otra vez. Queda anotado en el historial.`, ok: 'Reabrir', danger: true }))) return;
  if (s.closing && s.closing.accounting) { del('accounting', s.closing.accounting.entryId); }
  s.reopened = (s.reopened || 0) + 1; s.status = 'open'; s.prevClosing = s.closing; s.closing = null; s.closedAt = null;
  put('sessions', s);
  audit('Caja reabierta', `Se reabrió la caja del ${fmtDate(s.date)}`, { entity: 'session', entityId: s.id, edit: true });
  renderAll(); toast('Caja reabierta', { type: 'warn' });
};

/* =====================================================================
   CIERRE DE CAJA
   ===================================================================== */
const COUNT_ROWS = [['tienda', 'Efectivo de la tienda', 'cash'], ['mvCash', 'Efectivo de Mi Vecino', 'cash'], ['pichincha', 'Saldo cuenta Pichincha', 'bank'], ['guayaquil', 'Saldo cuenta Guayaquil', 'bank']];
function expectedFor(sm) { return { tienda: sm.tiendaExpected, mvCash: sm.mvCash, pichincha: sm.bankBal.pichincha, guayaquil: sm.bankBal.guayaquil }; }
VIEWS.cierre = {
  title: 'Cerrar caja',
  render() {
    const ses = curSession();
    if (!ses) return '<div class="empty card">No hay una caja abierta.</div>';
    const sm = sessionSummary(ses.id);
    const exp = expectedFor(sm);
    const edits = sessionEdits(ses.id);
    const defOwner = cfg().accountingOwnerId;
    const figs = owners().map(o => ({ o, f: ownerDayFigures(o.id, ses.id) }));
    const stale = ses.date < today();
    if (simpleMode()) return cierreSimpleHTML({ ses, sm, exp, edits, figs, defOwner, stale });
    return `<div style="max-width:900px;margin:0 auto" class="col">
      <div><h2 style="font-size:24px;font-weight:800">Cierre de caja · ${esc(fmtDateLong(ses.date))}</h2>${stale ? `<div class="alert warn" style="margin-top:8px">${ic('alert')}<span>Esta caja quedó abierta desde un día anterior. Ciérrala para poder abrir la de hoy.</span></div>` : ''}</div>
      ${edits.length ? `<div class="alert warn" style="flex-direction:column;gap:6px"><div class="row nowrap">${ic('alert')}<b>Hoy se hicieron ${edits.length} modificación${edits.length > 1 ? 'es' : ''}.</b> <span style="font-weight:500">Todas quedaron guardadas en el historial de cambios.</span></div>
        <ul style="margin:0 0 0 26px;padding:0;font-weight:500">${edits.slice(0, 6).map(a => `<li>${fmtTime(a.ts)} · ${esc(a.summary)}</li>`).join('')}${edits.length > 6 ? `<li><button class="btn sm" data-act="go-changes">Ver las ${edits.length}</button></li>` : ''}</ul></div>` : `<div class="alert ok">${ic('check')}<span>Hoy no hubo modificaciones en ventas, precios ni movimientos.</span></div>`}
      <div class="grid g4"><div class="card kpi"><span class="l">Ventas del día</span><span class="v">${money(sm.totalSales)}</span><span class="d eq">${sm.count} ventas</span></div><div class="card kpi"><span class="l">En efectivo</span><span class="v">${money(sm.cashSales)}</span></div><div class="card kpi"><span class="l">A fiado (no suma)</span><span class="v">${money(sm.fiadoSales)}</span></div><div class="card kpi"><span class="l">Mi Vecino</span><span class="v">${sm.ops.length}</span><span class="d eq">operaciones</span></div></div>
      <div class="card"><h3>1 · Cuenta el dinero</h3><p class="muted sm" style="margin:-4px 0 10px">Escribe lo que realmente hay. Si coincide, toca «Está correcto».</p>
        <div class="tblwrap"><table class="tbl"><thead><tr><th>Qué se cuenta</th><th class="r">Debería haber</th><th style="width:170px">Hay realmente</th><th style="width:150px">Resultado</th></tr></thead><tbody>
        ${COUNT_ROWS.map(([k, n, t]) => `<tr><td><b>${n}</b></td><td class="r num"><b>${money(exp[k])}</b></td><td><div class="row nowrap"><input class="in num-in" id="cnt-${k}" data-in="cnt" data-k="${k}" inputmode="decimal" placeholder="0.00"><button class="btn sm" data-act="cnt-ok" data-k="${k}" title="Está correcto">${ic('check', 'sm')}</button></div></td><td id="cnt-res-${k}" class="sm muted">Falta contar</td></tr>`).join('')}
        </tbody></table></div></div>
      <div class="card"><h3>2 · ¿Añadir el saldo de ventas a contabilidad?</h3><p class="muted sm" style="margin:-4px 0 10px">Elige de qué dueño se suma el día. Solo un dueño lleva contabilidad.</p>
        <div class="col" style="gap:6px">${figs.map(({ o, f }) => `<label class="chk bigfield" style="flex-direction:row;align-items:center;padding:10px 14px"><input type="radio" name="acc-owner" value="${o.id}" ${o.id === defOwner ? 'checked' : ''}>${ownerPill(o.id)}<span class="sp"></span><span class="num"><b>${money(f.rev)}</b> ventas${S.owner ? ` · ganancia ${money(f.profit)}` : ''}${f.pend ? ` · fiado ${money(f.pend)}` : ''}</span></label>`).join('')}
        <label class="chk bigfield" style="flex-direction:row;align-items:center;padding:10px 14px"><input type="radio" name="acc-owner" value="none" ${defOwner ? '' : 'checked'}><span>No añadir hoy</span></label></div></div>
      <div class="card"><h3>3 · Nota del día (opcional)</h3><textarea class="in" id="cl-notes" placeholder="Ej.: faltaron $0.50 porque di mal el vuelto"></textarea></div>
      <div class="row" style="justify-content:space-between"><button class="btn lg" data-act="nav" data-v="${stale ? 'caja' : 'vender'}">Volver</button><button class="btn xl primary" data-act="cl-go" id="cl-btn">CERRAR CAJA</button></div>
    </div>`;
  },
};
// Cierre en modo simple: una pregunta por pantalla (tienda, Mi Vecino, Pichincha, Guayaquil) y al final cerrar
const CL_NAMES = { tienda: 'el efectivo de la tienda', mvCash: 'el efectivo de Mi Vecino', pichincha: 'la cuenta Pichincha', guayaquil: 'la cuenta Guayaquil' };
function cierreSimpleHTML({ ses, sm, exp, edits, figs, defOwner, stale }) {
  const n = COUNT_ROWS.length;
  return `<div class="cl-wiz col">
    <div><div class="muted" style="font-size:17px">${esc(fmtDateLong(ses.date))} · ventas del día <b class="num">${money(sm.totalSales)}</b> (${sm.count})</div>
      ${stale ? `<div class="alert warn" style="margin-top:8px">${ic('alert')}<span>Esta caja quedó abierta desde un día anterior. Ciérrala para poder abrir la de hoy.</span></div>` : ''}
      ${edits.length ? `<div class="alert warn" style="margin-top:8px">${ic('alert')}<span>Hoy hubo ${edits.length} modificación${edits.length > 1 ? 'es' : ''} (quedan guardadas en «Cambios»).</span></div>` : ''}</div>
    ${COUNT_ROWS.map(([k, nm], i) => `<div class="card cl-step" data-s="${i}" ${i ? 'hidden' : ''}>
      <div class="cl-prog">Paso ${i + 1} de ${n + 1}</div>
      <h3>¿Cuánto hay realmente en ${CL_NAMES[k]}?</h3>
      <div class="cl-exp">Debería haber <b class="num">${money(exp[k])}</b></div>
      <div class="row nowrap" style="margin:12px 0 4px"><span class="num" style="font-size:30px;font-weight:800">$</span><input class="in xl num-in" id="cnt-${k}" data-in="cnt" data-k="${k}" inputmode="decimal" placeholder="0.00" data-key="cl-enter"></div>
      <div style="min-height:28px" id="cnt-res-${k}" class="sm muted">Cuenta y escribe el valor</div>
      <div class="col" style="margin-top:8px"><button class="btn xl primary" data-act="cl-ok" data-k="${k}">${ic('check')} Está correcto (${money(exp[k])})</button>
        <button class="btn lg" data-act="cl-next">Siguiente con el valor que escribí</button>${i ? `<button class="btn ghost" data-act="cl-prev">← Atrás</button>` : ''}</div></div>`).join('')}
    <div class="card cl-step" data-s="${n}" hidden>
      <div class="cl-prog">Paso ${n + 1} de ${n + 1}</div>
      <h3>Revisa y cierra</h3>
      <div id="cl-recap" class="cl-recap"></div>
      <div class="sm" style="font-weight:700;margin:14px 0 6px">¿Sumar las ventas de hoy a la contabilidad?</div>
      <div class="col" style="gap:6px">${figs.map(({ o, f }) => `<label class="chk bigfield" style="flex-direction:row;align-items:center;padding:10px 14px"><input type="radio" name="acc-owner" value="${o.id}" ${o.id === defOwner ? 'checked' : ''}>${ownerPill(o.id)}<span class="sp"></span><span class="num"><b>${money(f.rev)}</b></span></label>`).join('')}
        <label class="chk bigfield" style="flex-direction:row;align-items:center;padding:10px 14px"><input type="radio" name="acc-owner" value="none" ${defOwner ? '' : 'checked'}><span>No sumar hoy</span></label></div>
      <label class="f" style="margin-top:12px">Nota del día (opcional)<textarea class="in" id="cl-notes" placeholder="Ej.: faltaron $0.50 por un vuelto"></textarea></label>
      <div class="col" style="margin-top:12px"><button class="btn xl primary" data-act="cl-go" id="cl-btn">CERRAR CAJA</button><button class="btn ghost" data-act="cl-prev">← Atrás</button></div>
    </div>
    <button class="btn ghost" data-act="nav" data-v="${stale ? 'caja' : 'vender'}">Cancelar y volver</button>
  </div>`;
}
function clShow(i) {
  const steps = [...document.querySelectorAll('.cl-step')];
  steps.forEach(st => { st.hidden = +st.dataset.s !== i; });
  if (i === COUNT_ROWS.length) {
    const sm = liveSummary(), exp = sm ? expectedFor(sm) : {};
    $('#cl-recap').innerHTML = COUNT_ROWS.map(([k, n]) => {
      const el = $('#cnt-' + k); const v = el && el.value.trim() !== '' ? r2(num(el.value)) : null;
      const d = v === null ? null : r2(v - exp[k]);
      return `<div class="rc"><span>${n}</span><b class="num">${v === null ? '—' : money(v)}</b>${d === null ? '' : d === 0 ? '<span class="badge ok">Cuadra</span>' : `<span class="badge ${d < 0 ? 'bad' : 'warn'}">${d > 0 ? 'Sobra ' : 'Falta '}${money(Math.abs(d))}</span>`}</div>`;
    }).join('');
  }
  const cur = steps.find(st => +st.dataset.s === i);
  const inp = cur && cur.querySelector('input.in'); if (inp && !inp.value) setTimeout(() => inp.focus(), 30);
  const v = $('#view'); if (v) v.scrollTop = 0;
}
const clCur = () => { const c = document.querySelector('.cl-step:not([hidden])'); return c ? +c.dataset.s : 0; };
function clNext() {
  const i = clCur();
  if (i < COUNT_ROWS.length) {
    const k = COUNT_ROWS[i][0], el = $('#cnt-' + k);
    if (!el || el.value.trim() === '' || isNaN(parseFloat(el.value.replace(',', '.')))) { toast('Escribe cuánto hay (si no hay nada, escribe 0)', { type: 'warn' }); el?.focus(); return; }
  }
  clShow(Math.min(i + 1, COUNT_ROWS.length));
}
ACT['cl-ok'] = t => { ACT['cnt-ok'](t); clNext(); };
ACT['cl-next'] = () => clNext();
ACT['cl-prev'] = () => clShow(Math.max(clCur() - 1, 0));
KEY['cl-enter'] = (t, e) => { if (e.key === 'Enter') { e.preventDefault(); clNext(); } };
INP['cnt'] = t => updateCount(t.dataset.k);
ACT['cnt-ok'] = t => { const sm = liveSummary(); const k = t.dataset.k; $('#cnt-' + k).value = expectedFor(sm)[k].toFixed(2); updateCount(k); };
function updateCount(k) {
  const sm = liveSummary(); if (!sm) return;
  const exp = expectedFor(sm)[k]; const inp = $('#cnt-' + k); const res = $('#cnt-res-' + k);
  if (!inp || !res) return;
  if (inp.value.trim() === '') { res.className = 'sm muted'; res.textContent = 'Falta contar'; return; }
  const d = r2(num(inp.value) - exp);
  if (d === 0) { res.innerHTML = '<span class="badge ok">Cuadra</span>'; }
  else res.innerHTML = `<span class="badge ${d < 0 ? 'bad' : 'warn'}">${d > 0 ? 'Sobra ' : 'Falta '}${money(Math.abs(d))}</span>`;
}
ACT['cl-go'] = async () => {
  const ses = curSession(); if (!ses) return;
  const sm = sessionSummary(ses.id); const exp = expectedFor(sm);
  const counted = {}; const diff = {};
  for (const [k, n] of COUNT_ROWS) {
    const el = $('#cnt-' + k);
    if (!el || el.value.trim() === '' || isNaN(parseFloat(el.value.replace(',', '.')))) { toast(`Falta contar: ${n}`, { type: 'warn' }); el?.focus(); return; }
    counted[k] = r2(num(el.value)); diff[k] = r2(counted[k] - exp[k]);
  }
  const accSel = document.querySelector('input[name="acc-owner"]:checked');
  const accOwner = accSel && accSel.value !== 'none' ? accSel.value : null;
  const edits = sessionEdits(ses.id);
  const totalDiff = diff.tienda;
  const msg = `Se cerrará la caja del ${fmtDate(ses.date)}. Ventas ${money(sm.totalSales)}.${totalDiff !== 0 ? ` Efectivo de la tienda: ${totalDiff > 0 ? 'sobran' : 'faltan'} ${money(Math.abs(totalDiff))}.` : ''}${edits.length ? ` Hubo ${edits.length} modificación(es).` : ''}${accOwner ? ` Se añadirá a la contabilidad de ${ownerName(accOwner)}.` : ''} Ya no se podrá vender hasta abrir la caja de nuevo.`;
  if (!(await ask({ title: '¿Cerrar la caja?', msg, ok: 'Sí, cerrar caja', danger: false }))) return;
  const notes = ($('#cl-notes')?.value || '').trim();
  closedModal(closeCaja({ counted, accOwner, notes }));
};
// Cierra la caja del día (la usan el botón y la voz). counted = lo que se contó; accOwner = dueño al que se suman las ventas (o null)
function closeCaja({ counted, accOwner = null, notes = '', said = '' }) {
  const ses = curSession(); if (!ses) throw new Error('No hay caja abierta');
  const sm = sessionSummary(ses.id); const exp = expectedFor(sm);
  const diff = {}; COUNT_ROWS.forEach(([k]) => { diff[k] = r2(counted[k] - exp[k]); });
  const edits = sessionEdits(ses.id);
  let accounting = null;
  if (accOwner) {
    const f = ownerDayFigures(accOwner, ses.id);
    const e = addAccounting({ date: ses.date, ownerId: accOwner, type: 'ventas', concept: `Ventas del día ${fmtDate(ses.date)}`, sales: f.rev, cost: f.cost, expense: 0, sessionId: ses.id, source: 'cierre' });
    accounting = { ownerId: accOwner, entryId: e.id, sales: f.rev, cost: f.cost };
    const c = cfg(); c.accountingOwnerId = accOwner; saveCfg();
  }
  ses.status = 'closed'; ses.closedAt = new Date().toISOString();
  ses.closing = { counted, expected: exp, diff, notes, editCount: edits.length, editIds: edits.map(e => e.id), closedBy: roleName(), accounting, byVoice: !!said, totals: { sales: sm.totalSales, cash: sm.cashSales, fiado: sm.fiadoSales, debtCollected: sm.debtCollected } };
  put('sessions', ses);
  audit(said ? 'Caja cerrada (por voz)' : 'Caja cerrada', `Cierre del ${fmtDate(ses.date)}: ventas ${money(sm.totalSales)}, diferencia tienda ${money(diff.tienda)}, Mi Vecino efectivo ${money(diff.mvCash)}, Pichincha ${money(diff.pichincha)}, Guayaquil ${money(diff.guayaquil)}. ${edits.length} modificaciones.${notes ? ' Nota: ' + notes : ''}${said ? ` Dijo: «${said}»` : ''}`, { entity: 'session', entityId: ses.id });
  S.cart = []; persistCart();
  renderTop(); renderMV();
  return ses;
}
function closedModal(ses) {
  const sm = sessionSummary(ses.id); const c = ses.closing;
  let next = 'vender';
  const bad = Object.entries(c.diff).filter(([, v]) => v !== 0);
  modal({
    title: 'Caja cerrada', size: '',
    html: `<div class="alert ${bad.length ? 'warn' : 'ok'}">${ic(bad.length ? 'alert' : 'check')}<span>${bad.length ? 'La caja se cerró con diferencias. Quedaron anotadas.' : 'La caja cuadra. ¡Buen trabajo!'}</span></div>
      <div class="col" style="margin-top:10px">${line('Ventas del día', money(sm.totalSales), { bold: true })}${line('Efectivo tienda contado', money(c.counted.tienda))}${line('Efectivo Mi Vecino contado', money(c.counted.mvCash))}${line('Cuenta Pichincha', money(c.counted.pichincha))}${line('Cuenta Guayaquil', money(c.counted.guayaquil))}
      ${c.accounting ? `<div class="sm muted">Añadido a contabilidad de ${esc(ownerName(c.accounting.ownerId))}: ${money(c.accounting.sales)}</div>` : ''}</div>
      <p class="muted sm">Puedes enviar el reporte del día y descargar un respaldo antes de salir.</p>`,
    actions: [
      { label: `${ic('send', 'sm')} Reporte por WhatsApp`, onClick: () => { S.rep.who = 'cierre'; S.rep.sessionId = ses.id; S.rep.model = null; next = 'reportes'; S.skipOpen = true; closeTopModal(); return false; }, keep: true },
      { label: `${ic('down', 'sm')} Respaldo`, onClick: () => { exportBackup(); return false; }, keep: true },
      { label: 'Listo', cls: 'primary' },
    ],
    onClose: () => { S.view = next; if (!checkGates()) renderAll(); },
  });
}
