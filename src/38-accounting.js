/* =====================================================================
   CONTABILIDAD (un solo dueño la lleva; cada noche se le suma el saldo de ventas)
   ===================================================================== */
S.acc = { owner: null, kind: 'month', anchor: today(), from: today(), to: today() };
const ACC_TYPES = { ventas: 'Ventas del día', ingreso: 'Otro ingreso', gasto: 'Gasto', compra: 'Compra de mercadería' };
const ACC_PRESETS = { gasto: ['Luz', 'Agua', 'Internet', 'Arriendo', 'Sueldo', 'Transporte', 'Fundas', 'Otro gasto'], ingreso: ['Venta de cartón', 'Aporte del dueño', 'Otro ingreso'], compra: ['Compra a proveedor'], ventas: [] };
function accOwnerId() { return S.acc.owner || cfg().accountingOwnerId || (owners()[0] || {}).id; }
function accRows(oid, from, to) {
  let cum = 0;
  return accEntries(oid, from, to).map(e => { const u = r2((e.sales || 0) - (e.cost || 0) - (e.expense || 0)); cum = r2(cum + u); return { e, u, cum }; });
}
function accTotals(rows) { return { sales: r2(sum(rows, x => x.e.sales || 0)), cost: r2(sum(rows, x => x.e.cost || 0)), expense: r2(sum(rows, x => x.e.expense || 0)), profit: r2(sum(rows, x => x.u)) }; }
VIEWS.contab = {
  title: 'Contabilidad',
  render() {
    const a = S.acc; const oid = accOwnerId();
    const [from, to] = periodRange(a.kind, a.anchor, a.from, a.to);
    const rows = accRows(oid, from, to), t = accTotals(rows);
    const allT = accTotals(accRows(oid, '2000-01-01', '2999-12-31'));
    return `<div class="toolbar">
      <label class="row nowrap"><span class="sm muted" style="font-weight:700">Contabilidad de</span><select class="in" data-ch="acc-owner" style="min-width:180px">${owners().map(o => `<option value="${o.id}" ${o.id === oid ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select></label>
      <div class="seg">${[['month', 'Mes'], ['year', 'Año'], ['range', 'Rango']].map(([k, n]) => `<button data-act="acc-kind" data-k="${k}" aria-pressed="${a.kind === k}">${n}</button>`).join('')}</div>
      ${a.kind !== 'range' ? `<button class="btn icon" data-act="acc-shift" data-d="-1" aria-label="Anterior">‹</button><b style="min-width:150px;text-align:center">${esc(periodLabel(a.kind, from, to))}</b><button class="btn icon" data-act="acc-shift" data-d="1" aria-label="Siguiente">›</button>`
        : `<input class="in" type="date" data-ch="acc-from" value="${a.from}" style="max-width:155px"><span>a</span><input class="in" type="date" data-ch="acc-to" value="${a.to}" style="max-width:155px">`}
      <span class="sp"></span>
      <button class="btn soft-danger" data-act="acc-gasto">${ic('plus')} Anotar gasto</button>
      <button class="btn primary" data-act="acc-ingreso">${ic('plus')} Anotar ingreso</button>
      <button class="btn" data-act="acc-new">Otro (compra, ventas…)</button>
      <button class="btn" data-act="acc-day">${ic('cal')} Sumar un día de ventas</button>
      <button class="btn" data-act="acc-pdf">${ic('down')} PDF</button>
    </div>
    <p class="muted sm" style="margin:-4px 0 12px">También puedes decirlo: toca <b>Hablar</b> y di, por ejemplo, «gasto de 30 por luz» u «otro ingreso de 50 por cartón».</p>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr));margin-bottom:12px">
      ${kpi('Ingresos (ventas y otros)', money(t.sales), null)}${kpi('Costo de mercadería', money(t.cost), null)}${kpi('Gastos', money(t.expense), null)}${kpi('Utilidad del período', money(t.profit), null, 'hero')}${kpi('Utilidad acumulada total', money(allT.profit), null)}
    </div>
    ${rows.length ? `<div class="tblwrap"><table class="tbl"><thead><tr><th>Fecha</th><th>Concepto</th><th class="r">Ingresos</th><th class="r">Costo</th><th class="r">Gastos</th><th class="r">Utilidad</th><th class="r hide-m">Acumulado</th><th></th></tr></thead><tbody>${rows.map(({ e, u, cum }) => `<tr><td>${fmtDate(e.date)}</td><td>${esc(e.concept)}<div class="xs muted">${ACC_TYPES[e.type] || ''}${e.source === 'cierre' ? ' · desde el cierre de caja' : ''}${e.cashMoveId ? ' · también en la caja' : ''}${e.byVoice ? ' · por voz' : ''}</div></td><td class="r num">${e.sales ? money(e.sales) : '—'}</td><td class="r num">${e.cost ? money(e.cost) : '—'}</td><td class="r num">${e.expense ? money(e.expense) : '—'}</td><td class="r num"><b style="color:${u < 0 ? 'var(--danger)' : 'inherit'}">${money(u)}</b></td><td class="r num hide-m muted">${money(cum)}</td><td class="r nowrap"><button class="btn ghost sm icon" data-act="acc-edit" data-id="${e.id}" aria-label="Editar">${ic('edit', 'sm')}</button><button class="btn ghost sm icon" data-act="acc-del" data-id="${e.id}" aria-label="Eliminar">${ic('trash', 'sm')}</button></td></tr>`).join('')}</tbody><tfoot><tr><td colspan="2">Total</td><td class="r num">${money(t.sales)}</td><td class="r num">${money(t.cost)}</td><td class="r num">${money(t.expense)}</td><td class="r num">${money(t.profit)}</td><td class="hide-m"></td><td></td></tr></tfoot></table></div>`
        : `<div class="empty card">${ic('book')}<div style="font-weight:700">No hay registros en este período para ${esc(ownerName(oid))}.</div><div>Al cerrar la caja cada noche, el sistema pregunta si se suma el saldo de ventas de un dueño.</div></div>`}`;
  },
};
CHG['acc-owner'] = t => { S.acc.owner = t.value; cfg().accountingOwnerId = t.value; saveCfg(); renderView(); };
ACT['acc-kind'] = t => { S.acc.kind = t.dataset.k; if (S.acc.kind === 'range') { const [f, to] = periodRange('month', S.acc.anchor); S.acc.from = f; S.acc.to = to; } renderView(); };
ACT['acc-shift'] = t => { S.acc.anchor = shiftAnchor(S.acc.kind, S.acc.anchor, +t.dataset.d); renderView(); };
CHG['acc-from'] = t => { if (t.value) { S.acc.from = t.value; renderView(); } };
CHG['acc-to'] = t => { if (t.value) { S.acc.to = t.value; renderView(); } };
function accForm(e, preType) {
  const edit = !!e;
  const d = e || { date: today(), type: preType || 'gasto', concept: '', sales: 0, cost: 0, expense: 0 };
  const amount = d.type === 'gasto' ? d.expense : d.type === 'compra' ? d.cost : d.sales;
  const open = !!curSession();
  modal({
    title: edit ? 'Editar registro' : d.type === 'gasto' ? 'Anotar un gasto' : d.type === 'ingreso' ? 'Anotar un ingreso' : 'Registrar en contabilidad', size: '',
    html: `<div class="col"><label class="f">Tipo<select class="in" id="ac-type">${[['ingreso', 'Ingreso (venta u otro ingreso)'], ['gasto', 'Gasto'], ['compra', 'Compra de mercadería'], ['ventas', 'Ventas del día (con costo)']].map(([k, n]) => `<option value="${k}" ${d.type === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <div class="bills" id="ac-presets" style="justify-content:flex-start"></div>
      <label class="f">Concepto<input class="in" id="ac-concept" value="${esc(d.concept)}" placeholder="Ej.: pago de luz" autofocus></label>
      <div class="grid g2"><label class="f" id="ac-w1">Monto<input class="in xl num-in" id="ac-amt" inputmode="decimal" value="${amount ? amount.toFixed(2) : ''}"></label>
      <label class="f" id="ac-w2" hidden>Costo de esas ventas<input class="in num-in" id="ac-cost" inputmode="decimal" value="${d.cost ? d.cost.toFixed(2) : ''}"></label></div>
      <label class="f">Fecha<input class="in" type="date" id="ac-date" value="${d.date}"></label>
      ${!edit && open ? `<label class="chk" id="ac-cashw" hidden><input type="checkbox" id="ac-cash"> <span id="ac-cashl"></span></label>` : ''}</div>`,
    actions: [{ label: 'Cancelar' }, { label: 'Guardar', cls: 'primary', onClick: h => {
      const type = h.$('#ac-type').value, amt = r2(num(h.$('#ac-amt').value)), concept = h.$('#ac-concept').value.trim();
      if (!concept) { toast('Escribe el concepto', { type: 'warn' }); return false; }
      if (!(amt > 0)) { toast('Escribe el monto', { type: 'warn' }); return false; }
      const date = h.$('#ac-date').value || today();
      const f = { date, type, concept, sales: 0, cost: 0, expense: 0, ownerId: edit ? d.ownerId : accOwnerId() };
      if (type === 'gasto') f.expense = amt; else if (type === 'compra') f.cost = amt; else { f.sales = amt; if (type === 'ventas') f.cost = r2(num(h.$('#ac-cost').value)); }
      if (edit) {
        const before = JSON.parse(JSON.stringify(e)); Object.assign(e, f); put('accounting', e);
        const desc = x => `${ACC_TYPES[x.type] || x.type} "${x.concept}" ${fmtDate(x.date)}: ingresos ${money(x.sales)}, costo ${money(x.cost)}, gastos ${money(x.expense)}`;
        audit('Contabilidad modificada', `${desc(before)} → ${desc(e)}`, { entity: 'accounting', entityId: e.id, before: { type: before.type, concept: before.concept, date: before.date, sales: before.sales, cost: before.cost, expense: before.expense }, after: { type, concept, date, sales: f.sales, cost: f.cost, expense: f.expense }, edit: true });
      } else {
        const cashBox = h.$('#ac-cash'); const fromCash = !!(cashBox && !h.$('#ac-cashw').hidden && cashBox.checked && date === today());
        if (fromCash && (type === 'gasto' || type === 'compra' || type === 'ingreso')) recordMoney({ kind: type, amount: amt, concept, fromCash: true, accounting: true, date });
        else { addAccounting(f); audit('Contabilidad', `${ACC_TYPES[type]} "${concept}" ${money(amt)} para ${ownerName(f.ownerId)}`, { entity: 'accounting' }); }
      }
      toast('Guardado', { type: 'ok' }); renderTop(); renderMV(); renderView();
    } }],
    onOpen: h => {
      const upd = () => {
        const t = h.$('#ac-type').value; h.$('#ac-w2').hidden = t !== 'ventas';
        h.$('#ac-w1').firstChild.textContent = t === 'gasto' ? 'Monto del gasto' : t === 'compra' ? 'Monto de la compra' : 'Monto de ventas / ingreso';
        const pr = ACC_PRESETS[t] || [];
        h.$('#ac-presets').innerHTML = edit ? '' : pr.map(x => `<button type="button" data-preset="${esc(x)}">${esc(x)}</button>`).join('');
        const cw = h.$('#ac-cashw');
        if (cw) { cw.hidden = !(t === 'gasto' || t === 'compra' || t === 'ingreso'); h.$('#ac-cashl').textContent = t === 'ingreso' ? 'El dinero entró a la caja de la tienda de hoy' : 'El dinero salió de la caja de la tienda de hoy'; }
      };
      h.$('#ac-type').addEventListener('change', upd); upd();
      h.el.addEventListener('click', ev => { const b = ev.target.closest('[data-preset]'); if (!b) return; h.$('#ac-concept').value = b.dataset.preset; h.$('#ac-amt').focus(); });
    },
  });
}
ACT['acc-new'] = () => accForm(null);
ACT['acc-gasto'] = () => accForm(null, 'gasto');
ACT['acc-ingreso'] = () => accForm(null, 'ingreso');
ACT['acc-edit'] = t => { const e = get('accounting', t.dataset.id); if (e) accForm(e); };
ACT['acc-del'] = async t => {
  const e = get('accounting', t.dataset.id); if (!e) return;
  const linked = e.cashMoveId && get('cashMoves', e.cashMoveId);
  if (!(await ask({ title: 'Eliminar registro', msg: `¿Eliminar «${e.concept}»?${linked ? ' También se quita el movimiento de la caja de hoy.' : ''} Queda anotado en el historial de cambios.`, ok: 'Eliminar', danger: true }))) return;
  removeAccounting(e);
  renderTop(); renderMV(); renderView();
};
ACT['acc-day'] = () => {
  const oid = accOwnerId();
  const ss = sessionsSorted().filter(s => s.status === 'closed').reverse().slice(0, 60);
  if (!ss.length) { toast('Aún no hay cajas cerradas', { type: 'warn' }); return; }
  modal({
    title: `Sumar ventas de un día · ${ownerName(oid)}`, size: '',
    html: `<p class="muted" style="margin:0 0 8px">Útil si un día no se añadió al cerrar la caja.</p><label class="f">Día<select class="in" id="ad-ses">${ss.map(s => { const f = ownerDayFigures(oid, s.id); const done = accEntries(oid, s.date, s.date).some(e => e.sessionId === s.id && e.source === 'cierre'); return `<option value="${s.id}">${fmtDate(s.date)} · ${money(f.rev)}${done ? ' (ya añadido)' : ''}</option>`; }).join('')}</select></label>`,
    actions: [{ label: 'Cancelar' }, { label: 'Añadir', cls: 'primary', onClick: h => {
      const s = get('sessions', h.$('#ad-ses').value); const f = ownerDayFigures(oid, s.id);
      if (accEntries(oid, s.date, s.date).some(e => e.sessionId === s.id && e.source === 'cierre')) { toast('Ese día ya está en la contabilidad de este dueño', { type: 'warn' }); return false; }
      addAccounting({ date: s.date, ownerId: oid, type: 'ventas', concept: `Ventas del día ${fmtDate(s.date)}`, sales: f.rev, cost: f.cost, sessionId: s.id, source: 'cierre' });
      audit('Contabilidad', `Se añadieron las ventas del ${fmtDate(s.date)} (${money(f.rev)}) a ${ownerName(oid)}`, { entity: 'accounting' });
      toast('Día añadido', { type: 'ok' }); renderView();
    } }],
  });
};
ACT['acc-pdf'] = async () => {
  const a = S.acc; const oid = accOwnerId(); const [from, to] = periodRange(a.kind, a.anchor, a.from, a.to);
  const rows = accRows(oid, from, to), t = accTotals(rows);
  const m = {
    store: cfg().storeName, title: `Contabilidad de ${ownerName(oid)}`, period: from === to ? fmtDateLong(from) : `Del ${fmtDate(from)} al ${fmtDate(to)}`, from, to, generated: new Date().toISOString(), filename: `contabilidad-${slug(ownerName(oid))}-${from}_${to}.pdf`,
    sections: [{ title: 'Resumen', kv: [['Ventas', money(t.sales)], ['Costo de mercadería', money(t.cost)], ['Gastos', money(t.expense)], ['Utilidad del período', money(t.profit), true]] },
      { title: 'Registros', table: { head: ['Fecha', 'Concepto', 'Ventas', 'Costo', 'Gastos', 'Utilidad'], align: ['l', 'l', 'r', 'r', 'r', 'r'], rows: rows.map(({ e, u }) => [fmtDate(e.date), e.concept, e.sales ? money(e.sales) : '—', e.cost ? money(e.cost) : '—', e.expense ? money(e.expense) : '—', money(u)]), foot: ['Total', '', money(t.sales), money(t.cost), money(t.expense), money(t.profit)] } }],
  };
  const r = await saveFile(m.filename, reportBlob(m));
  if (r === 'saved') toast('PDF listo', { type: 'ok' });
};
