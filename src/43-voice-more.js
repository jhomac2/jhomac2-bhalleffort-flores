/* =====================================================================
   VOZ · más órdenes: abrir y cerrar la caja, gastos e ingresos, productos,
   anular ventas, reportes y preguntas del negocio.
   Usa lo que deja listo 42-voice.js (VC). Todo lo que se puede hacer hablando
   también se puede hacer a mano con las pantallas de siempre.
   ===================================================================== */
(() => {
  const { V, say, confirmQ, chooseQ, askQ, voiceAudit, setUndo, parseAmount, sayMoney, eachSeq, cap, pickProduct } = VC;
  const H = VC.handlers;
  const said = () => V.cmdText || 'voz';
  // Recupera el texto como lo dijo la persona (con tildes y con «de», «del», etc. entre las palabras del nombre)
  const SMALL = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'con', 'en', 'al', 'sin', 'para']);
  const nameCase = t => t.replace(/\S+/g, (w, i) => (i > 0 && SMALL.has(w.toLowerCase())) ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase());
  const origCase = words => {
    const orig = String(V.cmdText || '').split(/\s+/).filter(Boolean);
    const key = o => VNLU.strip(o).replace(/[^a-z0-9]/g, '');
    const idx = words.map(w => orig.findIndex(o => key(o) === w));
    if (idx.length && idx.every(i => i >= 0)) {
      const a = Math.min(...idx), b = Math.max(...idx), span = orig.slice(a, b + 1);
      if (!span.some(t => /[\d$]/.test(t))) return nameCase(span.join(' ').replace(/[.,;:!?]/g, ''));
    }
    return nameCase(words.map((w, i) => idx[i] >= 0 ? orig[idx[i]] : w).join(' ').replace(/[.,;:!?]/g, ''));
  };
  const firstUp = t => { t = String(t || '').trim().replace(/[.,;:!?]+$/, ''); return t ? t[0].toUpperCase() + t.slice(1) : ''; };
  // dinero que puede ser 0 ("nada", "cero")
  const parseMoney0 = (text, r) => {
    const s = VNLU.strip(text);
    if (/\b(nada|cero|ninguno|no hay|sin dinero)\b/.test(s)) return 0;
    const a = VNLU.amountFrom(VNLU.lex(text));
    return a !== null && a >= 0 ? a : undefined;
  };
  const refresh = () => { renderTop(); renderMV(); if (['caja', 'contab', 'ventas', 'productos', 'fiados', 'cierre'].includes(S.view)) renderView(); };
  const ownerOnly = async msg => S.owner || await requireOwner(msg);

  /* ---------- abrir la caja ---------- */
  const OPEN_FIELDS = [['tienda', 'el efectivo de la tienda'], ['mvCash', 'el efectivo de Mi Vecino'], ['pichincha', 'el saldo de la cuenta Pichincha'], ['guayaquil', 'el saldo de la cuenta Guayaquil']];
  const OPEN_SHORT = { tienda: 'tienda', mvCash: 'Mi Vecino efectivo', pichincha: 'Pichincha', guayaquil: 'Guayaquil' };
  H.open_caja = r => {
    if (curSession()) return say('La caja ya está abierta.');
    const prev = lastClosedSession(), pc = prev ? prev.closing.counted : null;
    const vals = Object.assign({}, r.values || {});
    if (r.same && pc) OPEN_FIELDS.forEach(([k]) => { if (vals[k] === undefined) vals[k] = pc[k]; });
    const finish = () => confirmQ({
      title: () => `Abrir la caja con: ${OPEN_FIELDS.map(([k]) => `${OPEN_SHORT[k]} ${money(vals[k])}`).join(' · ')}`,
      spoken: () => `Abro la caja con ${OPEN_FIELDS.map(([k]) => `${OPEN_SHORT[k]} ${sayMoney(vals[k])}`).join(', ')}. ¿Confirmas?`,
      adjust: async text => {
        const lx = VNLU.lex(text);
        if (!lx.some(x => x.t === 'w' && VNLU.accLabel(x.s))) return false;
        const up = VNLU.labelAmounts(lx, VNLU.accLabel); const ks = Object.keys(up); if (!ks.length) return false;
        ks.forEach(k => { vals[k] = up[k]; }); finish(); return true;
      },
      onYes: () => {
        if (curSession()) return say('La caja ya está abierta.');
        const opening = {}; OPEN_FIELDS.forEach(([k]) => { opening[k] = r2(vals[k]); });
        openCaja(opening, said());
        say('Caja abierta. ¡Buen día de ventas!', { kind: 'ok' });
        VC.render();
      },
      onNo: () => say('Listo, no abrí la caja.'),
    });
    const missing = OPEN_FIELDS.filter(([k]) => vals[k] === undefined);
    eachSeq(missing, ([k, nm], next) => {
      const quick = pc ? [...new Set([pc[k], 0])] : [0];
      askQ({
        title: `¿Cuánto hay en ${nm}?${pc ? ` (cerraste con ${money(pc[k])}; di «sí» para usar ese valor)` : ' Cuenta y dime el valor.'}`,
        spoken: `¿Cuánto hay en ${nm}?`, quick, qprefix: '$', zeroOK: true,
        parse: (text, rr) => (rr.intent === 'yes' && pc) ? pc[k] : parseMoney0(text, rr),
        onValue: v => { vals[k] = v; next(); }, onCancel: () => say('Listo, no abrí la caja.'),
      });
    }, finish);
  };

  /* ---------- cerrar la caja ---------- */
  const CLOSE_NAMES = { tienda: 'el efectivo de la tienda', mvCash: 'el efectivo de Mi Vecino', pichincha: 'la cuenta Pichincha', guayaquil: 'la cuenta Guayaquil' };
  H.close_caja = async r => {
    const ses = curSession(); if (!ses) return say('La caja ya está cerrada.');
    const sm = sessionSummary(ses.id), exp = expectedFor(sm);
    const counted = Object.assign({}, r.values || {});
    if (r.allOk) COUNT_ROWS.forEach(([k]) => { if (counted[k] === undefined) counted[k] = exp[k]; });
    let accOwner = r.noAcc ? null : (cfg().accountingOwnerId && get('owners', cfg().accountingOwnerId) ? cfg().accountingOwnerId : null);
    if (r.accQ && !r.noAcc) { const c = VNLU.matchNames(VNLU.textTokens(r.accQ), owners()); if (c.length) accOwner = c[0].id; }
    const tog = accOwner ? [{ label: `Sumar las ventas del día a la contabilidad de ${ownerName(accOwner)}`, on: true }] : null;
    const note = (/\bnota[:,]?\s+(.+)$/i.exec(V.cmdText || '') || [])[1] || '';
    const finish = () => {
      const diff = {}; COUNT_ROWS.forEach(([k]) => { diff[k] = r2(counted[k] - exp[k]); });
      const bad = COUNT_ROWS.filter(([k]) => diff[k] !== 0).map(([k]) => `${CLOSE_NAMES[k]}: ${diff[k] > 0 ? 'sobran' : 'faltan'} ${money(Math.abs(diff[k]))}`);
      const edits = sessionEdits(ses.id).length;
      confirmQ({
        title: () => `Cerrar la caja del ${fmtDate(ses.date)}. Ventas ${money(sm.totalSales)}. ${bad.length ? bad.join('; ') + '.' : 'Todo cuadra.'}${edits ? ` Hubo ${edits} modificación(es) hoy.` : ''}`,
        spoken: () => `Cierro la caja. Ventas ${sayMoney(sm.totalSales)}. ${bad.length ? bad.join('. ') + '.' : 'Todo cuadra.'} ¿Confirmas?`,
        toggles: tog,
        adjust: async text => {
          const lx = VNLU.lex(text);
          if (!lx.some(x => x.t === 'w' && VNLU.accLabel(x.s))) return false;
          const up = VNLU.labelAmounts(lx, VNLU.accLabel); const ks = Object.keys(up); if (!ks.length) return false;
          ks.forEach(k => { counted[k] = up[k]; }); finish(); return true;
        },
        onYes: () => {
          if (!curSession()) return say('La caja ya estaba cerrada.');
          const c = closeCaja({ counted, accOwner: tog && tog[0].on ? accOwner : null, notes: note, said: said() });
          closedModal(c);
          say(`Caja cerrada. Ventas del día ${money(sm.totalSales)}. ${bad.length ? 'Quedaron diferencias anotadas.' : 'La caja cuadra.'}`, { kind: bad.length ? 'warn' : 'ok', spoken: `Caja cerrada. ${bad.length ? 'Quedaron diferencias anotadas.' : 'La caja cuadra.'}` });
        },
        onNo: () => say('Listo, no cerré la caja.'),
      });
    };
    const missing = COUNT_ROWS.filter(([k]) => counted[k] === undefined);
    if (!missing.length || r.allOk) return finish();
    eachSeq(missing, ([k], next) => askQ({
      title: `¿Cuánto hay realmente en ${CLOSE_NAMES[k]}? Debería haber ${money(exp[k])}. Di «cuadra» si es lo mismo.`,
      spoken: `¿Cuánto hay en ${CLOSE_NAMES[k]}? Debería haber ${sayMoney(exp[k])}. Di cuadra si es igual.`,
      quick: [...new Set([exp[k], 0])], qprefix: '$', zeroOK: true,
      parse: (text, rr) => (rr.intent === 'yes' || /\b(cuadra|correcto|esta bien|igual|exacto|lo mismo|todo bien)\b/.test(VNLU.strip(text))) ? exp[k] : parseMoney0(text, rr),
      onValue: v => { counted[k] = v; next(); }, onCancel: () => say('Listo, no cerré la caja.'),
    }), finish);
  };

  /* ---------- gastos, pagos a proveedores, retiros del dueño, ingresos ---------- */
  H.money_rec = r => {
    const kind = r.kind, k = MONEY_KINDS[kind];
    const open = !!curSession();
    const st = { amount: r.amount, concept: r.concept && r.concept.length ? firstUp(origCase(r.concept).toLowerCase().replace(/^\S/, c => c.toUpperCase())) : '' };
    if (!st.concept && kind === 'retiro') st.concept = 'Retiro del dueño';
    const cashOn0 = r.fromCash !== null ? (r.fromCash && open) : open;
    const accOn0 = k.acc ? (r.accounting !== null ? r.accounting : true) : false;
    const tog = [];
    if (open) tog.push({ k: 'cash', label: k.dir === 'out' ? 'Sale de la caja de la tienda de hoy' : 'Entra a la caja de la tienda de hoy', on: cashOn0 });
    if (k.acc) tog.push({ k: 'acc', label: `Anotarlo en la contabilidad de ${ownerName(accOwnerId())}`, on: accOn0 });
    const on = key => { const x = tog.find(y => y.k === key); return !!(x && x.on); };
    const setTog = (key, v) => { const x = tog.find(y => y.k === key); if (x) x.on = v; };
    const label = k.label;
    const cc = () => (st.concept && st.concept.toLowerCase() !== label.toLowerCase() ? st.concept : '');
    const where = () => [on('cash') && 'la caja', on('acc') && 'contabilidad'].filter(Boolean).join(' y ') || 'ningún lugar';
    const proceed = () => confirmQ({
      title: () => `${label} de ${money(st.amount)}${cc() ? ' · ' + cc() : ''}. Se anota en ${where()}`,
      spoken: () => `${label} de ${sayMoney(st.amount)}${cc() ? ' por ' + cc() : ''}. Se anota en ${where()}. ¿Confirmas?`,
      toggles: tog.length ? tog : null,
      adjust: async text => {
        const s = VNLU.strip(text); let ch = false;
        if (/\b(no (sale|salio|es|entra|entro) (de |a |en )?(la )?caja|sin (tocar )?(la )?caja|solo (en |de )?contabilidad|de mi (bolsillo|plata))\b/.test(s)) { setTog('cash', false); ch = true; }
        else if (/\b(de la caja|de caja|sale de la caja|salio de la caja|a la caja|solo (en |de )?(la )?caja)\b/.test(s)) { setTog('cash', true); if (/solo/.test(s)) setTog('acc', false); ch = true; }
        if (/\b(sin contabilidad|no (lo )?(anotes|pongas|registres) en contabilidad)\b/.test(s)) { setTog('acc', false); ch = true; }
        const a = parseAmount(text);
        if (a !== undefined && !ch) { st.amount = a; ch = true; }
        if (ch) { proceed(); return true; }
        return false;
      },
      onYes: async () => {
        if (!on('cash') && !on('acc')) { say('No hay dónde anotarlo. Activa «caja» o «contabilidad».', { kind: 'warn' }); return proceed(); }
        if (!on('cash') && on('acc') && !(await ownerOnly('Para anotar solo en contabilidad escribe el PIN del dueño.'))) return say('Entendido, no lo anoté.');
        let res;
        try { res = recordMoney({ kind, amount: st.amount, concept: st.concept, fromCash: on('cash'), accounting: on('acc'), said: said() }); }
        catch (e) { return say('No pude anotarlo: ' + e.message, { kind: 'bad' }); }
        refresh();
        const tx = curSession() && res.move ? sessionSummary(curSession().id).tiendaExpected : null;
        say(`Listo: ${label.toLowerCase()} de ${money(st.amount)}${cc() ? ' (' + cc() + ')' : ''}. Anotado en ${where()}.${tx !== null ? ` En la caja de la tienda debería haber ${money(tx)}.` : ''}`, { kind: 'ok', spoken: `Listo, anotado.${tx !== null ? ` En la caja debería haber ${sayMoney(tx)}.` : ''}` });
        setUndo(`el ${label.toLowerCase()} de ${money(st.amount)}`, () => {
          if (res.move && get('cashMoves', res.move.id)) removeMoney(res.move); else if (res.acc && get('accounting', res.acc.id)) removeAccounting(res.acc);
          refresh(); say(`Deshice el ${label.toLowerCase()} de ${money(st.amount)}.`, { kind: 'ok' });
        });
      },
      onNo: () => say('Listo, no lo anoté.'),
    });
    const ensure = () => {
      if (!(st.amount > 0)) return askQ({ title: `¿De cuánto es ${kind === 'ingreso' ? 'el ingreso' : kind === 'retiro' ? 'el retiro' : kind === 'compra' ? 'el pago' : 'el gasto'}?`, quick: [5, 10, 20, 50], qprefix: '$', parse: parseAmount, onValue: v => { st.amount = v; ensure(); }, onCancel: () => say('Listo, no lo anoté.') });
      if (!st.concept) return askQ({ title: kind === 'ingreso' ? '¿Por qué fue el ingreso? (ej.: venta de cartón)' : '¿En qué fue? (ej.: luz, fundas, transporte)', parse: text => firstUp(text) || undefined, onValue: v => { st.concept = v; ensure(); }, onCancel: () => say('Listo, no lo anoté.') });
      proceed();
    };
    ensure();
  };

  /* ---------- anular una venta ya cobrada ---------- */
  H.sale_void = r => {
    const all = allSales();
    const sale = r.no ? all.find(s => s.no === r.no) : all.filter(s => s.status !== 'void').pop();
    if (!sale) return say(r.no ? `No encuentro la venta #${r.no}.` : 'Todavía no hay ventas para anular.', { kind: 'warn' });
    if (sale.status === 'void') return say(`La venta #${sale.no} ya estaba anulada.`);
    if (sale.payType === 'fiado' && (sale.paid || 0) > 0) return say('Esa venta a fiado ya tiene abonos; anúlala desde «Ventas».', { kind: 'warn' });
    const ses = get('sessions', sale.sessionId), closed = ses && ses.status === 'closed';
    confirmQ({
      title: () => `Anular la venta #${sale.no} de ${money(sale.total)} (${fmtTime(sale.ts)}${sale.payType === 'fiado' ? ', a fiado' : ''}). Los productos vuelven al inventario`,
      spoken: () => `Anulo la venta número ${sale.no} de ${sayMoney(sale.total)}. ¿Confirmas?`,
      onYes: async () => {
        if (closed && !(await ownerOnly('Esa caja ya está cerrada. Escribe el PIN del dueño para anular la venta.'))) return say('Entendido, no la anulé.');
        const s = get('sales', sale.id); if (!s || s.status === 'void') return say('Esa venta ya estaba anulada.');
        voidSale(s, `Anulada por voz. Dijo: «${said()}»`);
        renderTop(); if (typeof renderLastSales === 'function') renderLastSales(); if (S.view === 'ventas') renderView();
        say(`Venta #${s.no} anulada. Los productos volvieron al inventario.`, { kind: 'ok' });
      },
    });
  };
  H.sale_cancel = (r, text) => S.cart.length ? VC.doCancelSale() : H.sale_void({ no: null }, text);

  /* ---------- precio de un producto ---------- */
  H.sale_price = r => {
    const it = r.item;
    if (!it || (!it.id && !it.cands.length)) return say('¿De qué producto? Di, por ejemplo: «cambia el precio del arroz a 0.65».', { kind: 'warn' });
    if (!(r.price > 0)) return say('¿A qué precio? Di, por ejemplo: «cambia el precio del arroz a 0.65».', { kind: 'warn' });
    pickProduct(it, p => {
      if (!p) return;
      const price = r2(r.price), line = S.cart.find(l => l.pid === p.id);
      const cartOnly = () => { line.price = price; renderCart(); say(`${p.name}: precio ${money(price)} solo en esta venta. Total ${money(cartTotal())}.`, { kind: 'ok' }); };
      const persist = () => confirmQ({
        title: () => `Cambiar el precio de ${p.name}: ${money(p.price)} → ${money(price)} para todas las ventas`,
        spoken: () => `Cambio el precio de ${p.name} a ${sayMoney(price)} para siempre. ¿Confirmas?`,
        onYes: () => {
          const pp = get('products', p.id), old = pp.price;
          saveProduct({ price }, pp);
          voiceAudit('Precio cambiado', `${pp.name}: ${money(old)} → ${money(price)} para todas las ventas`, { entity: 'product', entityId: pp.id, before: { price: old }, after: { price } }); // el cambio en sí ya queda como «Modificación» en saveProduct
          const l2 = S.cart.find(l => l.pid === p.id); if (l2) l2.price = price;
          if (S.view === 'productos') renderView(); else if (S.view === 'vender') { if (typeof renderQuick === 'function') renderQuick(); renderCart(); }
          say(`Listo: ${p.name} ahora cuesta ${money(price)}.`, { kind: 'ok' });
          setUndo(`el precio de ${p.name}`, () => { saveProduct({ price: old }, get('products', p.id)); if (S.view === 'productos') renderView(); else if (S.view === 'vender') { if (typeof renderQuick === 'function') renderQuick(); renderCart(); } say(`Deshice: ${p.name} vuelve a ${money(old)}.`, { kind: 'ok' }); });
        },
        onNo: () => say('Listo, no cambié el precio.'),
      });
      if (line && !r.persist) return chooseQ({ title: `¿Cambio el precio de ${p.name} a ${money(price)}?`, options: [{ label: 'Solo en esta venta', value: 'cart' }, { label: 'Para siempre (precio del producto)', value: 'prod' }], onPick: v => v === 'cart' ? cartOnly() : persist(), onCancel: () => say('Listo, no cambié nada.') });
      persist();
    });
  };

  /* ---------- crear producto, dueño y cliente ---------- */
  H.prod_new = r => {
    const st = { name: r.nameWords && r.nameWords.length ? origCase(r.nameWords) : '', price: r.price, ownerId: null };
    const step = () => {
      if (!st.name) return askQ({ title: '¿Cómo se llama el producto?', parse: text => firstUp(text) || undefined, onValue: v => { st.name = v; step(); }, onCancel: () => say('Listo, no creé el producto.') });
      if (!(st.price > 0)) return askQ({ title: `¿A qué precio se vende «${st.name}»?`, quick: [0.25, 0.5, 1, 2], qprefix: '$', parse: parseAmount, onValue: v => { st.price = v; step(); }, onCancel: () => say('Listo, no creé el producto.') });
      if (!st.ownerId) {
        const cs = r.ownerCands || [];
        if (cs.length === 1) { st.ownerId = cs[0].id; return step(); }
        const os = owners();
        if (!cs.length && os.length === 1) { st.ownerId = os[0].id; return step(); }
        const list_ = cs.length > 1 ? cs.map(c => get('owners', c.id)) : os;
        return chooseQ({ title: r.ownerQ && !cs.length ? `No encontré al dueño «${r.ownerQ}». ¿De quién es el producto?` : '¿De quién es el producto?', options: list_.map(o => ({ label: o.name, value: o.id })), onPick: id => { st.ownerId = id; step(); }, onCancel: () => say('Listo, no creé el producto.') });
      }
      const dup = VNLU.matchProducts(VNLU.textTokens(st.name), activeProducts()).find(c => c.score >= 0.92);
      const go_ = () => {
        const costNote = r.cost != null && !S.owner ? ' (el costo solo lo pone el dueño: no lo anoto)' : '';
        const unit = r.unit && UNITS[r.unit] ? r.unit : 'u';
        confirmQ({
          title: () => `Crear el producto «${st.name}»: precio ${money(st.price)}${S.owner && r.cost ? `, costo ${money(r.cost)}` : ''}${FRACTIONAL.has(unit) ? ', por ' + UNITS[unit] : ''}, dueño ${ownerName(st.ownerId)}, stock ${qtyFmt(r.stock || 0)}${costNote}`,
          spoken: () => `Creo el producto ${st.name} a ${sayMoney(st.price)}, de ${ownerName(st.ownerId)}. ¿Confirmas?`,
          onYes: () => {
            const p = saveProduct({ barcode: genCode(), name: st.name, ownerId: st.ownerId, price: r2(st.price), unit, stock: r.stock || 0, quick: false, trackStock: true, cost: S.owner ? r2(r.cost || 0) : 0, category: '', minStock: 0, expiry: '', active: true }, null);
            voiceAudit('Producto creado', `Producto "${p.name}" a ${money(p.price)} (${ownerName(st.ownerId)}), código ${p.barcode}`, { entity: 'product', entityId: p.id });
            const c = cfg(); c.lastOwnerId = st.ownerId; saveCfg();
            if (S.view === 'productos') renderView(); else if (S.view === 'vender' && typeof renderQuick === 'function') renderQuick();
            renderTop();
            say(`Listo: producto «${p.name}» creado a ${money(p.price)}. Código ${p.barcode}.`, { kind: 'ok', spoken: `Listo, creé el producto ${p.name}.` });
            setUndo(`el producto ${p.name}`, () => { del('products', p.id); audit('Producto eliminado', `Se deshizo la creación de "${p.name}"`, { entity: 'product', entityId: p.id, edit: true }); if (S.view === 'productos') renderView(); say(`Deshice: quité el producto «${p.name}».`, { kind: 'ok' }); });
          },
          onNo: () => say('Listo, no creé el producto.'),
        });
      };
      if (dup) return confirmQ({ title: `Ya existe «${dup.name}». ¿Creo otro producto con nombre parecido?`, onYes: go_, onNo: () => say('Listo, no creé el producto.') });
      go_();
    };
    step();
  };
  H.owner_add = async r => {
    if (!(await ownerOnly('Agregar dueños es solo para el dueño. Escribe tu PIN.'))) return say('Entendido, no lo agregué.');
    const make = name => {
      if (allOwners().some(o => norm(o.name) === norm(name))) return say(`Ya existe un dueño llamado «${name}».`, { kind: 'warn' });
      confirmQ({ title: `Agregar al dueño de productos «${name}»`, onYes: () => { const o = addOwner(name); voiceAudit('Dueño agregado', `Dueño de productos "${o.name}"`, { entity: 'owner', entityId: o.id }); say(`Listo: agregué al dueño «${o.name}». Ya puedes asignarle productos.`, { kind: 'ok' }); if (S.view === 'ajustes') renderView(); }, onNo: () => say('Listo, no lo agregué.') });
    };
    if (r.nameWords && r.nameWords.length) return make(origCase(r.nameWords));
    askQ({ title: '¿Cómo se llama el dueño?', parse: text => firstUp(text) || undefined, onValue: make, onCancel: () => say('Listo.') });
  };
  H.customer_add = r => {
    const make = name => {
      const ex = customers().find(c => norm(c.name) === norm(name));
      if (ex) return say(`Ya existe el cliente «${ex.name}».`, { kind: 'warn' });
      const c = addCustomer(name); voiceAudit('Cliente agregado', `Cliente "${c.name}"`, { entity: 'customer', entityId: c.id }); if (S.view === 'fiados') renderView();
      say(`Listo: agregué al cliente «${c.name}».`, { kind: 'ok' });
    };
    if (r.nameWords && r.nameWords.length) return make(origCase(r.nameWords));
    askQ({ title: '¿Cómo se llama el cliente?', parse: text => firstUp(text) || undefined, onValue: make, onCancel: () => say('Listo.') });
  };

  /* ---------- reportes y respaldo ---------- */
  const WHO_TXT = { tienda: 'la tienda', mv: 'Mi Vecino', owner: 'un dueño', todo: 'la tienda y Mi Vecino', cierre: 'el cierre de caja' };
  H.report = async r => {
    const rep = S.rep, rg = r.range;
    rep.who = r.who;
    if (r.who === 'owner' && r.ownerId) rep.ownerId = r.ownerId;
    if (rg) { rep.from = rg.from; rep.to = rg.to; } else if (r.act !== 'show' || !rep.from) { rep.from = today(); rep.to = today(); }
    if (r.who === 'cierre') {
      const d = rg ? rg.to : today();
      const ss = sessionsSorted().filter(x => x.date === d);
      const ses = ss[ss.length - 1] || curSession() || lastClosedSession();
      if (!ses) return say('Todavía no hay cajas para el reporte de cierre.', { kind: 'warn' });
      rep.sessionId = ses.id;
    }
    rep.phone = repPhoneFor(rep.who, rep.ownerId); rep.model = null;
    go('reportes');
    const label = `${r.who === 'owner' ? 'de ' + ownerName(rep.ownerId) : 'de ' + WHO_TXT[r.who]}${r.who === 'cierre' ? '' : ' · ' + (rg ? rg.label : 'hoy')}`;
    if (r.act === 'pdf') { try { await ACT['rep-pdf'](); } catch (e) { return say('No pude preparar el PDF: ' + e.message, { kind: 'bad' }); } return say(`Reporte ${label}: PDF descargado.`, { kind: 'ok', spoken: 'Listo, descargué el PDF.' }); }
    if (r.act === 'send') {
      if (!normPhone(rep.phone) || normPhone(rep.phone).length < 11) return say(`Reporte ${label} listo. Falta el número de WhatsApp: escríbelo en «3 · Enviar» y toca «Enviar por WhatsApp».`, { kind: 'warn', spoken: 'El reporte está listo. Falta el número de WhatsApp. Escríbelo y toca enviar.' });
      say(`Reporte ${label}. Preparo el PDF y el mensaje de WhatsApp: en la ventana que sale toca «Abrir WhatsApp» y adjunta el PDF.`, { kind: 'ok', spoken: 'Preparo el reporte. En la ventana toca abrir WhatsApp y adjunta el PDF.' });
      return ACT['rep-send']();
    }
    say(`Reporte ${label} en pantalla. Di «envía el reporte por WhatsApp» o «descarga el reporte».`, { kind: 'ok', spoken: 'Aquí está el reporte.' });
  };
  H.backup = async () => {
    if (!(await ownerOnly('El respaldo es solo para el dueño. Escribe tu PIN.'))) return say('Entendido, no hice el respaldo.');
    await exportBackup(); voiceAudit('Respaldo', 'Se pidió un respaldo de los datos'); say('Respaldo preparado. Guárdalo en un lugar seguro.', { kind: 'ok' });
  };

  /* ---------- preguntas del negocio ---------- */
  const needPin = (r, what) => (r.range && r.range.key !== 'hoy') || (!r.range && r.period && r.period !== 'hoy');
  H.q_expenses = async r => {
    const [a, b, label] = VC.periodOf(r.period, r.range);
    const other = needPin(r);
    if (other && !(await ownerOnly('Los gastos de otros días los ve el dueño. Escribe tu PIN.'))) return say('Entendido, no los muestro.');
    const cash = expensesIn(a, b, 'tienda');
    const oid = accOwnerId(), rows = oid ? accEntries(oid, a, b) : [];
    const acc = r2(sum(rows, e => e.expense)), buy = r2(sum(rows, e => e.cost - 0 * 0));
    if (!S.owner) return say(`De la caja de la tienda salieron ${money(cash)} en gastos ${label}.`);
    say(`Gastos ${label}: ${money(acc)} en la contabilidad de ${ownerName(oid)}${buy ? ` (y ${money(buy)} en compras de mercadería)` : ''}. De la caja de la tienda salieron ${money(cash)} en gastos.`);
  };
  H.q_owner = async r => {
    const [a, b, label] = VC.periodOf(r.period, r.range);
    if (needPin(r) && !(await ownerOnly('Las ventas de otros días las ve el dueño. Escribe tu PIN.'))) return say('Entendido, no las muestro.');
    const g = aggregate(a, b, { ownerId: r.ownerId });
    say(`${ownerName(r.ownerId)} vendió ${money(g.rev)} ${label} (${g.count} venta${g.count === 1 ? '' : 's'}).${S.owner ? ` Ganancia ${money(g.profit)}.` : ''}`);
  };
  H.q_lowstock = () => {
    const low = new Map();
    lowStock().forEach(p => low.set(p.id, p));
    activeProducts().filter(p => p.trackStock !== false && (p.stock || 0) <= 0).forEach(p => low.set(p.id, p));
    const arr = [...low.values()].sort((x, y) => (x.stock || 0) - (y.stock || 0));
    if (!arr.length) return say('No hay productos con poco stock. (Cuentan los que tienen un mínimo definido o están en cero.)', { kind: 'ok' });
    say(`Se están acabando ${arr.length} producto${arr.length === 1 ? '' : 's'}: ${arr.slice(0, 8).map(p => `${p.name} (${qtyFmt(p.stock || 0)})`).join(', ')}${arr.length > 8 ? ' y más' : ''}.`, { spoken: `Se están acabando ${arr.length} productos: ${arr.slice(0, 5).map(p => p.name).join(', ')}.` });
  };
  H.q_expiring = () => {
    const arr = expiringSoon(30);
    if (!arr.length) return say('No hay productos por vencer en los próximos 30 días.', { kind: 'ok' });
    say(`Por vencer: ${arr.slice(0, 6).map(p => `${p.name} (${fmtDate(p.expiry)})`).join(', ')}${arr.length > 6 ? ' y más' : ''}.`);
  };
  H.q_debtors = () => {
    const arr = customers().map(c => ({ c, d: customerDebt(c.id) })).filter(x => x.d > 0).sort((x, y) => y.d - x.d);
    if (!arr.length) return say('Nadie debe nada en este momento.', { kind: 'ok' });
    say(`Deben ${arr.length} cliente${arr.length === 1 ? '' : 's'}, en total ${money(totalDebt())}: ${arr.slice(0, 6).map(x => `${x.c.name} ${money(x.d)}`).join(', ')}${arr.length > 6 ? ' y más' : ''}.`, { spoken: `Deben ${arr.length} clientes, en total ${sayMoney(totalDebt())}.` });
  };
})();
