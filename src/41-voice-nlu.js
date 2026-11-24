/* =====================================================================
   VOZ · intérprete de órdenes en español (no usa el DOM, se puede probar solo)
   Entrada: el texto que dijo (o escribió) la persona + el contexto (productos, clientes, banco elegido…)
   Salida: una orden clara, por ejemplo { intent: 'mv', op: 'retiro', amount: 50, bank: 'pichincha' }
   ===================================================================== */
const VNLU = (() => {
  const strip = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const round2 = n => Math.round(n * 100) / 100;
  const round3 = n => Math.round(n * 1000) / 1000;

  /* ---------- números dichos con palabras ---------- */
  const U = { cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9 };
  const T = { diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29 };
  const D = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };
  const H = { cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300, cuatrocientos: 400, cuatrocientas: 400, quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600, setecientos: 700, setecientas: 700, ochocientos: 800, ochocientas: 800, novecientos: 900, novecientas: 900 };
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  function parseRun(t, i) {
    let j = i, total = 0, cur = 0, state = 'start', any = false, thousands = false;
    while (j < t.length) {
      const w = t[j];
      if (w === 'mil') {
        if (!any && state === 'start') { total = 1000; thousands = true; state = 'M'; any = true; j++; continue; }
        if (thousands || state === 'M') break;
        total += (cur || 1) * 1000; cur = 0; state = 'M'; thousands = true; j++; continue;
      }
      if (has(H, w)) { if (state === 'start' || state === 'M') { cur += H[w]; state = 'H'; any = true; j++; continue; } break; }
      if (has(T, w)) { if (state === 'start' || state === 'M' || state === 'H') { cur += T[w]; state = 'TU'; any = true; j++; continue; } break; }
      if (has(D, w)) { if (state === 'start' || state === 'M' || state === 'H') { cur += D[w]; state = 'D'; any = true; j++; continue; } break; }
      if (w === 'y' && state === 'D' && has(U, t[j + 1]) && U[t[j + 1]] > 0) { cur += U[t[j + 1]]; state = 'TU'; j += 2; continue; }
      if (has(U, w)) { if (state === 'start' || state === 'M' || state === 'H') { cur += U[w]; state = 'TU'; any = true; j++; continue; } break; }
      break;
    }
    return any ? { v: total + cur, n: j - i } : null;
  }

  /* ---------- texto → piezas ---------- */
  function tokenize(text) {
    let s = strip(text);
    s = s.replace(/\$\s*(\d+(?:[.,]\d+)?)/g, ' $1 dolares ').replace(/(\d)\s*\$/g, '$1 dolares ');
    s = s.replace(/(^|[^\d.,])([1-9]\d{0,2})\.(\d{3})(?![\d.])/g, '$1$2$3');
    s = s.replace(/(\d),(\d{3})(?!\d)/g, '$1$2').replace(/(\d),(\d{1,2})(?!\d)/g, '$1.$2');
    s = s.replace(/[,;]/g, ' , ').replace(/[^a-z0-9.,\s]/g, ' ');
    s = s.replace(/(^|[^\d])\.|\.(?!\d)/g, '$1 ');
    const raw = s.split(/\s+/).filter(Boolean);
    const out = [];
    for (let i = 0; i < raw.length;) {
      const w = raw[i];
      if (/^\d+(\.\d+)?$/.test(w)) { out.push({ t: 'n', v: parseFloat(w), d: true }); i++; continue; }
      if (w === ',') { out.push({ t: 's' }); i++; continue; }
      if (w === 'medio' || w === 'media') { out.push({ t: 'n', v: 0.5, half: true }); i++; continue; }
      if (w === 'otro' || w === 'otra') { out.push({ t: 'n', v: 1, d: false, w }); i++; continue; }
      const r = parseRun(raw, i);
      if (r) { out.push({ t: 'n', v: r.v, d: false, w: raw[i] }); i += r.n; continue; }
      out.push({ t: 'w', s: w }); i++;
    }
    return out;
  }
  const UNITW = { libra: 'lb', libras: 'lb', lb: 'lb', lbs: 'lb', kilo: 'kg', kilos: 'kg', kg: 'kg', litro: 'l', litros: 'l', lt: 'l', lts: 'l', gramo: 'g', gramos: 'g', unidad: 'u', unidades: 'u' };
  const isW = (x, re) => x && x.t === 'w' && re.test(x.s);
  // "libra y media" → 1.5 libra ; "dos libras y media" → 2.5 libras
  function mergeHalf(t) {
    const out = [];
    for (let i = 0; i < t.length; i++) {
      const x = t[i];
      if (x.t === 'w' && has(UNITW, x.s) && isW(t[i + 1], /^y$/) && t[i + 2] && t[i + 2].half) {
        const prev = out[out.length - 1];
        if (prev && prev.t === 'n' && !prev.half && !prev.money) prev.v = round3(prev.v + 0.5); else out.push({ t: 'n', v: 1.5, d: false });
        out.push(x); i += 2; continue;
      }
      out.push(x);
    }
    return out;
  }
  // "2 dólares con 50", "2 con 50", "75 centavos"
  function combine(t) {
    const out = [];
    const isDol = x => isW(x, /^dolar(es|cito|citos)?$/);
    const isCon = x => isW(x, /^(con|coma|punto)$/);
    const isCent = x => isW(x, /^(centavo|centavos|ctvs|ctv|cents|centimos)$/);
    const smallInt = x => x && x.t === 'n' && !x.half && Number.isInteger(x.v) && x.v < 100;
    for (let i = 0; i < t.length; i++) {
      const a = t[i];
      if (a.t === 'n' && !a.half) {
        const b = t[i + 1];
        if (isDol(b)) {
          let v = a.v, k = i + 2, used = 2;
          if ((isCon(t[k]) || isW(t[k], /^y$/)) && smallInt(t[k + 1])) { v = a.v + t[k + 1].v / 100; used = k + 2 - i; if (isCent(t[k + 2])) used++; }
          else if (smallInt(t[k])) { v = a.v + t[k].v / 100; used = k + 1 - i; if (isCent(t[k + 1])) used++; }
          out.push({ t: 'n', v: round2(v), money: true }); i += used - 1; continue;
        }
        if (isCon(b) && smallInt(t[i + 2]) && Number.isInteger(a.v)) {
          const c = t[i + 2];
          out.push({ t: 'n', v: round2(a.v + (c.v < 10 ? c.v / 10 : c.v / 100)), money: !!a.money }); i += 2; continue;
        }
        if (isCent(b)) { out.push({ t: 'n', v: round2(a.v / 100), money: true }); i += 1; continue; }
      }
      out.push(a);
    }
    return out;
  }
  const lex = text => combine(mergeHalf(tokenize(text)));

  // monto de dinero: "cincuenta", "2 con 50", "uno setenta y cinco", "un dólar con 75"
  function amountFrom(t) {
    const m = t.find(x => x.t === 'n' && x.money);
    if (m) return m.v;
    for (let i = 0; i < t.length - 1; i++) {
      const a = t[i], b = t[i + 1];
      if (a.t === 'n' && b.t === 'n' && !a.half && !b.half && Number.isInteger(a.v) && Number.isInteger(b.v) && a.v < 100 && b.v >= 10 && b.v < 100) return round2(a.v + b.v / 100);
    }
    const n = t.find(x => x.t === 'n' && !x.half);
    return n ? n.v : null;
  }

  /* ---------- parecido entre palabras (por cómo suenan) ---------- */
  function phon(w) {
    return w.replace(/ll/g, 'y').replace(/qu/g, 'k').replace(/c([ei])/g, 's$1').replace(/c/g, 'k').replace(/z/g, 's').replace(/v/g, 'b').replace(/h/g, '').replace(/g([ei])/g, 'j$1').replace(/w/g, 'u').replace(/(.)\1+/g, '$1');
  }
  function lev(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  const variants = w => { const v = [w]; if (w.length > 3 && w.endsWith('s')) v.push(w.slice(0, -1)); if (w.length > 4 && w.endsWith('es')) v.push(w.slice(0, -2)); return v.map(phon); };
  function tokSim(q, t) {
    if (q === t) return 1;
    const qd = /^(\d+)/.exec(q), td = /^(\d+)/.exec(t);
    if (qd && td) return qd[1] === td[1] ? 0.9 : 0;
    let best = 0;
    for (const a of variants(q)) for (const b of variants(t)) {
      if (a === b) return 1;
      const mn = Math.min(a.length, b.length), mx = Math.max(a.length, b.length);
      if (mn < 4) continue;
      if (a.startsWith(b) || b.startsWith(a)) best = Math.max(best, 0.88);
      const s = 1 - lev(a, b) / mx;
      if (s >= 0.74) best = Math.max(best, s);
    }
    return best;
  }

  const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'por', 'para', 'al', 'a', 'en', 'con', 'y', 'e', 'mi', 'tu', 'su', 'que', 'lo', 'me', 'te', 'se', 'favor', 'porfavor', 'x', 'mas', 'menos', 'ya', 'o', 'es', 'son', 'hay', 'esta', 'este', 'ese', 'esa', 'dolar', 'dolares', 'gracias', 'oye', 'hola', 'bueno', 'pues', 'tambien', 'ademas', 'solo', 'cada', 'uno']);
  const UNIT_ONLY = new Set(Object.keys(UNITW));

  const nameTokens = name => strip(name).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const _tkc = new Map();
  const ptok = name => { let v = _tkc.get(name); if (!v) { v = nameTokens(name); if (_tkc.size > 4000) _tkc.clear(); _tkc.set(name, v); } return v; };
  function matchProducts(q, products, o = {}) {
    const Q = q.filter(w => !STOP.has(w) && !UNIT_ONLY.has(w));
    if (!Q.length) return [];
    const res = [];
    for (const p of products) {
      const P = ptok(p.name).filter(w => !STOP.has(w) && w.length > 1 && !UNIT_ONLY.has(w) && !/^(ml|cc|l|g|kg|gr)$/.test(w));
      if (!P.length) continue;
      let cov = 0, matchedP = new Set();
      for (const qt of Q) {
        let best = 0, bi = -1;
        P.forEach((pt, idx) => { const s = tokSim(qt, pt); if (s > best) { best = s; bi = idx; } });
        cov += best; if (best >= 0.74 && bi >= 0) matchedP.add(bi);
      }
      cov /= Q.length;
      const pcov = matchedP.size / P.length;
      let score = 0.78 * cov + 0.22 * pcov;
      if (cov < 0.74) score *= 0.7;
      if (p.quick) score += 0.01;
      if (strip(p.name).startsWith(Q[0])) score += 0.015;
      if (score >= 0.6) res.push({ id: p.id, name: p.name, score: round3(score) });
    }
    res.sort((a, b) => b.score - a.score || a.name.length - b.name.length);
    return res.slice(0, 5);
  }
  function autoPick(c) {
    if (!c.length) return null;
    const top = c[0], sec = c[1];
    if (top.score >= 0.86 && (!sec || top.score - sec.score >= 0.08)) return top.id;
    if (!sec && top.score >= 0.7) return top.id;
    return null;
  }
  const TITLES = new Set(['sr', 'sra', 'srta', 'senor', 'senora', 'senorita', 'don', 'dona', 'doña']);
  function matchNames(q, list) {
    const Q = q.filter(w => !STOP.has(w) && !TITLES.has(w));
    if (!Q.length) return [];
    const res = [];
    for (const c of list) {
      const P = nameTokens(c.name).filter(w => !TITLES.has(w) && !STOP.has(w));
      if (!P.length) continue;
      let cov = 0;
      for (const qt of Q) { let best = 0; for (const pt of P) best = Math.max(best, tokSim(qt, pt)); cov += best; }
      cov /= Q.length;
      if (cov >= 0.74) res.push({ id: c.id, name: c.name, score: round3(cov) });
    }
    return res.sort((a, b) => b.score - a.score).slice(0, 5);
  }

  /* ---------- artículos de una venta ---------- */
  const CMD_WORDS = new Set(['vende', 'vender', 'vendi', 'vendeme', 'vendo', 'venta', 'ventas', 'ventita', 'anota', 'anotar', 'anotame', 'apunta', 'apuntar', 'agrega', 'agregar', 'agregame', 'anade', 'anadir', 'pon', 'ponme', 'ponle', 'poner', 'suma', 'sumar', 'sumale', 'dame', 'deme', 'dar', 'dale', 'llevo', 'lleva', 'llevar', 'llevan', 'quiero', 'necesito', 'necesita', 'registra', 'registrar', 'cobra', 'cobrar', 'cobrame', 'cobrale', 'fiado', 'fiada', 'fiar', 'fia', 'fio', 'credito', 'compra', 'compro', 'cuenta', 'lista', 'carrito', 'producto', 'productos', 'articulo', 'por', 'favor', 'porfavor', 'ahora', 'luego', 'despues', 'pues', 'oye', 'hola', 'gracias']);
  const SEP = new Set(['y', 'e', 'mas', 'tambien', 'ademas', 'con', 'luego', 'despues']);

  function splitSegments(t) {
    const segs = [[]];
    for (let i = 0; i < t.length; i++) {
      const x = t[i];
      if (x.t === 's' || (x.t === 'w' && SEP.has(x.s))) { if (segs[segs.length - 1].length) segs.push([]); continue; }
      segs[segs.length - 1].push(x);
    }
    return segs.filter(s => s.length);
  }
  function parseSegment(seg, products, opts = {}) {
    seg = seg.filter(x => !(x.t === 'w' && CMD_WORDS.has(x.s)));
    let i = 0, qty = null, unit = null, money = null;
    while (i < seg.length && seg[i].t === 'w' && STOP.has(seg[i].s)) i++;
    if (seg[i] && seg[i].t === 'n') { if (seg[i].money) money = seg[i].v; else qty = seg[i].v; i++; }
    if (seg[i] && seg[i].t === 'w' && has(UNITW, seg[i].s)) { unit = UNITW[seg[i].s]; i++; if (qty === null && money === null) qty = 1; }
    while (seg[i] && seg[i].t === 'w' && (seg[i].s === 'de' || seg[i].s === 'del' || seg[i].s === 'la' || seg[i].s === 'el' || seg[i].s === 'los' || seg[i].s === 'las')) i++;
    const rest = seg.slice(i);
    const words = rest.filter(x => x.t === 'w').map(x => x.s);
    const nums = rest.filter(x => x.t === 'n' && !x.money && !x.half);
    // un número suelto dentro del nombre ("cola 500") o una cantidad al final ("pan 5")
    const inName = n => products.some(p => nameTokens(p.name).some(tk => { const m = /^(\d+)/.exec(tk); return m && m[1] === String(n.v); }));
    let q = words.slice();
    if (qty === null && money === null && nums.length) {
      const n = nums[nums.length - 1];
      if (inName(n)) q = words.concat(String(n.v)); else qty = n.v;
    }
    if (!q.length) return null;
    const trim = a => { a = a.slice(); while (a.length && STOP.has(a[0])) a.shift(); while (a.length && STOP.has(a[a.length - 1])) a.pop(); return a; };
    q = trim(q);
    if (!q.length) return null;
    let cands = matchProducts(q, products);
    let extra = [];
    if (!cands.length && opts.span && q.length > 1) {
      // "panes marcos": busca el tramo que sí es un producto; lo que sobra queda aparte (p. ej. el nombre del cliente)
      let best = null;
      for (let len = q.length - 1; len >= 1; len--) for (let st = 0; st + len <= q.length; st++) {
        const sub = q.slice(st, st + len), c = matchProducts(sub, products);
        if (c.length && c[0].score >= 0.8 && (!best || len > best.len)) best = { len, st, c, sub };
      }
      if (best) { cands = best.c; extra = q.filter((_, i) => i < best.st || i >= best.st + best.len); q = trim(best.sub); }
    }
    return { q: q.join(' '), qty, unit, money, cands, id: autoPick(cands), extra };
  }
  function parseItems(t, products, opts) {
    return splitSegments(t).map(s => parseSegment(s, products, opts)).filter(Boolean);
  }

  /* ---------- reconocimiento de órdenes ---------- */
  const YES = new Set(['si', 'sii', 'claro', 'confirmo', 'confirmar', 'confirma', 'dale', 'ok', 'okey', 'okay', 'correcto', 'afirmativo', 'exacto', 'listo', 'adelante', 'procede', 'hazlo', 'va', 'sip', 'seguro']);
  const NO = new Set(['no', 'nop', 'cancela', 'cancelar', 'cancelalo', 'olvidalo', 'negativo', 'detente', 'para', 'nada', 'equivocado', 'incorrecto', 'anula']);
  const ORD = { primero: 1, primera: 1, uno: 1, un: 1, una: 1, segundo: 2, segunda: 2, dos: 2, tercero: 3, tercera: 3, tres: 3, cuarto: 4, cuarta: 4, cuatro: 4, quinto: 5, quinta: 5, cinco: 5 };
  const BANKS_RX = { pichincha: /\b(pichinch\w*|pichinc\w*)\b/, guayaquil: /\b(guayaquil|guayaq\w*|guaya)\b/ };
  const VIEWS = [
    ['cierre', /\b(cerrar|cierra|cierre|cerrando)\b.*\bcaja\b|\bcierre de caja\b|^cierre$/],
    ['vender', /\b(vender|punto de venta|pantalla principal|pantalla de inicio|inicio|principal|pantalla de ventas)\b/],
    ['ventas', /\b(ventas|historial de ventas|las ventas)\b/],
    ['productos', /\b(productos|inventario|mercaderia|stock)\b/],
    ['fiados', /\b(fiados|fiado|deudas|deudores|clientes)\b/],
    ['caja', /\bcaja\b/],
    ['reportes', /\b(reportes|reporte|informe|informes)\b/],
    ['resumen', /\b(resumen|dashboard|utilidad|panel|estadisticas|graficos)\b/],
    ['contab', /\bcontabilidad\b/],
    ['cambios', /\b(cambios|historial de cambios|modificaciones|historial)\b/],
    ['ajustes', /\b(ajustes|configuracion|opciones)\b/],
  ];

  /* ---------- fechas y períodos ("ayer", "el 3 de noviembre", "este mes") ---------- */
  const MESES_N = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
  const MESES_T = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIAS_N = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
  const pad2 = n => String(n).padStart(2, '0');
  const dstr = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const pD = x => { const [y, m, d] = x.split('-').map(Number); return new Date(y, m - 1, d); };
  const addD = (x, n) => { const d = pD(x); d.setDate(d.getDate() + n); return dstr(d); };
  const monthRange = x => { const d = pD(x); return [dstr(new Date(d.getFullYear(), d.getMonth(), 1)), dstr(new Date(d.getFullYear(), d.getMonth() + 1, 0))]; };
  const dayLabel = x => { const d = pD(x); return `el ${d.getDate()} de ${MESES_T[d.getMonth()]}`; };
  function rangeFrom(t, today) {
    if (!today) return null;
    const W = t.filter(x => x.t === 'w').map(x => x.s), txt = W.join(' ');
    const mi = t.findIndex(x => x.t === 'w' && has(MESES_N, x.s));
    if (mi > 0) {
      const mo = MESES_N[t[mi].s]; let y = +today.slice(0, 4), expl = false;
      if (isW(t[mi + 1], /^(de|del)$/) && t[mi + 2] && t[mi + 2].t === 'n' && t[mi + 2].v >= 2000) { y = t[mi + 2].v; expl = true; }
      const ns = t.slice(0, mi).filter(x => x.t === 'n' && !x.half && Number.isInteger(x.v) && x.v >= 1 && x.v <= 31);
      const fix = (dd) => { let d = `${y}-${pad2(mo)}-${pad2(dd)}`; if (!expl && d > today) d = `${y - 1}-${pad2(mo)}-${pad2(dd)}`; return d; };
      if (ns.length >= 2 && W.includes('al')) { const a = fix(ns[ns.length - 2].v), b = fix(ns[ns.length - 1].v); return { key: 'rango', from: a <= b ? a : b, to: a <= b ? b : a, label: `del ${ns[ns.length - 2].v} al ${ns[ns.length - 1].v} de ${MESES_T[mo - 1]}`, explicit: true }; }
      if (ns.length) { const d = fix(ns[ns.length - 1].v); return { key: 'rango', from: d, to: d, label: dayLabel(d), explicit: true }; }
      const [a, b] = monthRange(`${y}-${pad2(mo)}-01`); return { key: 'rango', from: a, to: b, label: `${MESES_T[mo - 1]} ${y}`, explicit: true };
    }
    if (/\b(anteayer|antier|antes de ayer)\b/.test(txt)) { const d = addD(today, -2); return { key: 'rango', from: d, to: d, label: 'anteayer' }; }
    if (/\bayer\b/.test(txt)) { const d = addD(today, -1); return { key: 'ayer', from: d, to: d, label: 'ayer' }; }
    if (/\bhoy\b/.test(txt)) return { key: 'hoy', from: today, to: today, label: 'hoy' };
    if (/\b(semana pasada|la semana anterior)\b/.test(txt)) { const k = (pD(today).getDay() + 6) % 7; const a = addD(today, -k - 7); return { key: 'rango', from: a, to: addD(a, 6), label: 'la semana pasada' }; }
    if (/\b(esta semana|de la semana|semanal|la semana|semana)\b/.test(txt)) { const k = (pD(today).getDay() + 6) % 7; const a = addD(today, -k); return { key: 'semana', from: a, to: addD(a, 6), label: 'esta semana' }; }
    if (/\b(mes pasado|el mes anterior)\b/.test(txt)) { const d = pD(today); const [a, b] = monthRange(dstr(new Date(d.getFullYear(), d.getMonth() - 1, 1))); return { key: 'mespasado', from: a, to: b, label: 'el mes pasado' }; }
    if (/\b(este mes|del mes|mensual|el mes|mes)\b/.test(txt)) { const [a, b] = monthRange(today); return { key: 'mes', from: a, to: b, label: 'este mes' }; }
    if (/\b(este ano|del ano|anual|el ano|ano)\b/.test(txt)) { const y = today.slice(0, 4); return { key: 'ano', from: `${y}-01-01`, to: `${y}-12-31`, label: 'este año' }; }
    const wd = W.find(w => has(DIAS_N, w));
    if (wd) { const cur = pD(today).getDay(); let back = (cur - DIAS_N[wd] + 7) % 7; const d = addD(today, -back); return { key: 'rango', from: d, to: d, label: 'el ' + wd, explicit: true }; }
    return null;
  }

  /* ---------- "tienda 50, pichincha 500…" → cantidades por etiqueta ---------- */
  function labelAmounts(t, labelOf) {
    const items = [];
    t.forEach(x => { if (x.t === 'n' && !x.half) items.push({ n: x.v }); else if (x.t === 'w') { const k = labelOf(x.s); if (k) items.push({ k }); } });
    const run = style => {
      const out = {}, left = [];
      if (style === 'A') { let lab = null; for (const it of items) { if (it.k) lab = it.k; else if (lab) { if (out[lab] === undefined) out[lab] = it.n; lab = null; } else left.push(it.n); } }
      else { let num = null; for (const it of items) { if (it.n !== undefined) { if (num !== null) left.push(num); num = it.n; } else if (num !== null) { if (out[it.k] === undefined) out[it.k] = num; num = null; } } if (num !== null) left.push(num); }
      return { out, left };
    };
    const A = run('A'), B = run('B');
    const best = B.left.length < A.left.length ? B : A;
    const out = best.out;
    if (best.left.length && out.tienda === undefined) out.tienda = best.left[0];
    return out;
  }
  const accLabel = w => /^(tienda|local|negocio|mostrador)$/.test(w) ? 'tienda' : /^(vecino|mv|corresponsal)$/.test(w) ? 'mvCash' : BANKS_RX.pichincha.test(w) ? 'pichincha' : BANKS_RX.guayaquil.test(w) ? 'guayaquil' : null;
  // quita las palabras de la orden ("abre la caja con") para que "caja" no cuente como etiqueta
  const afterCaja = t => { const i = t.findIndex(x => x.t === 'w' && /^(caja|dia|jornada)$/.test(x.s)); return i >= 0 ? t.slice(i + 1) : t; };
  const nameAfter = (t, rx) => { let i = -1; t.forEach((x, k) => { if (x.t === 'w' && rx.test(x.s)) i = k; }); return t.slice(i + 1).filter(x => x.t === 'w' && !STOP.has(x.s)).map(x => x.s); };

  const MR_FLAGS = /\bno (de |a |en )(la )?caja\b|\b(no )?(sale|salio|salieron|entra|entro|entraron)( de| a| en)?( la)? caja\b|\bde la caja\b|\bde caja\b|\bde la tienda\b|\bsolo (en |de )?(la )?(caja|contabilidad)\b|\b(en|de|a|para) (la )?contabilidad( de \w+)?\b|\bsin (tocar )?(la )?(caja|contabilidad)\b|\bde mi (bolsillo|plata)\b|\bcon mi plata\b/g;
  const MR_KW = new Set(['gasto', 'gastos', 'gaste', 'gastamos', 'gastaron', 'gastado', 'egreso', 'egresos', 'anota', 'anotar', 'anotame', 'apunta', 'apuntar', 'registra', 'registrar', 'pon', 'poner', 'agrega', 'agregar', 'anade', 'nuevo', 'nueva', 'otro', 'otra', 'dolar', 'dolares', 'centavos', 'pague', 'pagamos', 'pagar', 'page', 'pago', 'pagado', 'cancele', 'abone', 'abonamos', 'retiro', 'retire', 'retiramos', 'saque', 'saco', 'saca', 'sacamos', 'ingreso', 'ingresos', 'ingrese', 'entro', 'entrada', 'dinero', 'plata', 'aporte', 'aportaron', 'aporto', 'extra', 'personal', 'dueno', 'duena', 'patron', 'patrona', 'mio', 'mi', 'tambien', 'ademas', 'favor']);
  function parseMoneyRec(s, kind) {
    const fromCash = /\b(de la caja|de caja|de la tienda|sale de la caja|salio de la caja|saque de la caja|entra a la caja|entro a la caja|a la caja|del cajon)\b/.test(s) && !/\bno (sale|salio|es|entra|entro) (de |a |en )?(la )?caja\b|\bno (de|a|en) (la )?caja\b|\bsin (tocar )?(la )?caja\b/.test(s) ? true
      : /\bno (sale|salio|es|entra|entro) (de |a |en )?(la )?caja\b|\bno (de|a|en) (la )?caja\b|\bsin (tocar )?(la )?caja\b|\bsolo (en |de )?contabilidad\b|\bde mi (bolsillo|plata)\b|\bcon mi plata\b/.test(s) ? false : null;
    const accounting = /\bsolo (en |de )?(la )?caja\b|\bno (lo )?(anotes|pongas|registres|sumes) (en )?contabilidad\b|\bsin contabilidad\b/.test(s) ? false : (/\bcontabilidad\b/.test(s) ? true : null);
    const t2 = lex(s.replace(MR_FLAGS, ' '));
    const art = (x, i) => x.t === 'n' && /^(un|una|otro|otra)$/.test(x.w || '') && !isW(t2[i + 1], /^dolar/);
    const nums = t2.map((x, i) => (x.t === 'n' && !x.half && !art(x, i)) ? i : -1).filter(i => i >= 0);
    const mi = nums.find(i => t2[i].money);
    const ai = mi !== undefined ? mi : (nums.length ? nums[0] : -1);
    const amount = nums.length ? amountFrom(nums.map(i => t2[i])) : null;
    const clean = ws => { ws = ws.filter(x => x.t === 'w' && !MR_KW.has(x.s)).map(x => x.s); while (ws.length && STOP.has(ws[0])) ws.shift(); while (ws.length && STOP.has(ws[ws.length - 1])) ws.pop(); return ws; };
    let concept = ai >= 0 ? clean(t2.slice(ai + 1)) : [];
    if (!concept.length) concept = ai >= 0 ? clean(t2.slice(0, ai)) : clean(t2);
    return { intent: 'money_rec', kind, amount: amount !== null && amount > 0 ? amount : null, concept, fromCash, accounting: kind === 'retiro' ? false : accounting };
  }
  function parseProdNew(t, ctx) {
    const KWF = { precio: 'price', vale: 'price', cuesta: 'price', cuestan: 'price', vende: 'price', venta: 'price', costo: 'cost', compro: 'cost', compra: 'cost', stock: 'stock', cantidad: 'stock', inventario: 'stock', existencia: 'stock', unidades: 'stock', unidad: 'stock', dueno: 'owner', duena: 'owner', propietario: 'owner', categoria: 'cat' };
    const DROP = new Set(['crea', 'crear', 'creame', 'nuevo', 'nueva', 'producto', 'productos', 'agrega', 'agregar', 'anade', 'anadir', 'registra', 'registrar', 'da', 'de', 'alta', 'un', 'una', 'el', 'la', 'con', 'y', 'llamado', 'llamada', 'que', 'se', 'llama', 'nombre', 'por', 'dolar', 'dolares', 'cada', 'tiene', 'tengo', 'hay']);
    const seg = { name: [], price: [], cost: [], stock: [], owner: [], cat: [] }; let cur = 'name', unit = null;
    for (let i = 0; i < t.length; i++) {
      const x = t[i];
      if (x.t === 'w' && has(KWF, x.s)) {
        const k = KWF[x.s];
        if (k === 'stock' && /^unidad(es)?$/.test(x.s) && seg[cur].length && seg[cur][seg[cur].length - 1].t === 'n') { seg.stock.push(seg[cur].pop()); cur = 'name'; continue; }
        cur = k; continue;
      }
      if (x.t === 'w' && x.s === 'a' && cur === 'name' && seg.name.some(y => y.t === 'w') && t[i + 1] && t[i + 1].t === 'n') { cur = 'price'; continue; }
      if (x.t === 'w' && has(UNITW, x.s) && cur === 'name' && (isW(t[i - 1], /^por$/) || !seg.name.length === false)) { if (UNITW[x.s] !== 'u') unit = UNITW[x.s]; continue; }
      if (x.t === 's') continue;
      seg[cur].push(x);
    }
    const nameW = seg.name.filter(x => x.t === 'w' && !DROP.has(x.s) && !/^(dolar|dolares)$/.test(x.s)).map(x => x.s);
    const numsIn = a => a.filter(x => x.t === 'n' && !x.half);
    let price = amountFrom(numsIn(seg.price)), cost = amountFrom(numsIn(seg.cost));
    if (price === null) { const n = seg.name.filter(x => x.t === 'n' && !x.half && (x.money || (x.d === true) )).pop() || (nameW.length ? seg.name.filter(x => x.t === 'n' && !x.half).pop() : null); if (n) price = n.v; }
    const st = numsIn(seg.stock)[0];
    const ownerQ = seg.owner.filter(x => x.t === 'w' && !STOP.has(x.s) && !TITLES.has(x.s)).map(x => x.s);
    return { intent: 'prod_new', nameWords: nameW, price, cost, stock: st ? st.v : null, unit, ownerQ: ownerQ.join(' '), ownerCands: matchNames(ownerQ, ctx.owners || []) };
  }

  function bankIn(s) { for (const b in BANKS_RX) if (BANKS_RX[b].test(s)) return b; return null; }
  function wordsOnly(t, drop) { return t.filter(x => x.t === 'w' && !STOP.has(x.s) && !CMD_WORDS.has(x.s) && !(drop && drop.has(x.s))).map(x => x.s); }

  function parse(text, ctx = {}) {
    const products = ctx.products || [], customers = ctx.customers || [];
    const s = strip(text).replace(/\s+/g, ' ').trim();
    if (!s) return { intent: 'empty' };
    const t = lex(text);
    const words = t.filter(x => x.t === 'w').map(x => x.s);
    const hasNum = t.some(x => x.t === 'n' && !x.half);
    const T = re => re.test(s);
    const bank = bankIn(s);
    const bankObj = { bank: bank || ctx.bank || 'pichincha', bankGuessed: !bank };

    // sí / no
    if (words.length <= 4 && !hasNum) {
      if (YES.has(words[0])) return { intent: 'yes' };
      if (NO.has(words[0]) && !T(/venta|todo|lista/)) return { intent: 'no' };
    }
    if (T(/\b(ayuda|ayudame|que puedo decir|que puedes hacer|comandos|instrucciones|como funciona|que sabes hacer)\b/)) return { intent: 'help' };

    if ((ctx.cartCount || 0) > 0 && /^(el |al |a )?(fiado|fiar|fialo|fiado por favor)$/.test(s)) return { intent: 'sale', items: [], cobrar: false, fiado: { q: '', cands: [] }, received: null };

    // ---- abrir y cerrar la caja (con o sin cantidades) ----
    const rg = rangeFrom(t, ctx.today);
    if (T(/\b(abrir|abre|abrime|abramos|abrimos|inicia|iniciar|empieza|empezar|empecemos|arranca|arrancar)\b.*\b(caja|dia|jornada)\b/)) {
      const vals = labelAmounts(afterCaja(t), accLabel);
      return { intent: 'open_caja', values: vals, same: T(/\b(igual|mismo|mismos|misma|mismas|como ayer|de ayer|lo mismo|del cierre|anterior|como cerramos|como quedo|como quedamos)\b/) };
    }
    if (T(/\b(cerrar|cierra|cierre|cerremos|cerramos|cerrando)\b.*\b(caja|dia|jornada)\b|^(el )?cierre( de caja| del dia)?$/)) {
      const accQ = /contabilidad (?:de|del|para)\s+([a-z ]+)/.exec(s);
      return {
        intent: 'close_caja', values: labelAmounts(afterCaja(t), accLabel),
        allOk: T(/\b(cuadra|cuadro|todo (bien|correcto|ok|igual)|esta correcto|esta bien|correcto|sin diferencias?|no hay diferencias?|todo cuadra|igual que lo que dice)\b/),
        noAcc: T(/\b(sin|no)\b.*\bcontabilidad\b|\bno (la )?(anotes|anadas|sumes|pongas)\b/), accQ: accQ ? accQ[1].trim() : '',
      };
    }

    // ---- preguntas sobre gastos, poco stock, por vencer y quién debe ----
    if (T(/\b(gasto|gastos|gaste|gastamos|gastado|gastaron|egreso|egresos)\b/) && (!hasNum || T(/\b(cuanto|cuantos)\b/) || (rg && rg.explicit && !t.some(x => x.t === 'n' && x.money)))) return { intent: 'q_expenses', period: rg ? rg.key : 'hoy', range: rg };
    if (!hasNum && T(/\b(se estan acabando|se esta acabando|acabando|por acabar|se acaban|stock bajo|bajo stock|poco stock|faltantes|que falta|que me falta|que debo comprar|que tengo que comprar|que hay que comprar|que debo reponer|agotados?|sin stock)\b/)) return { intent: 'q_lowstock' };
    if (!hasNum && T(/\b(por vencer|proximos a vencer|que vence|que vencen|vencen pronto|vence pronto|caducan|por caducar)\b/)) return { intent: 'q_expiring' };
    if (!T(/\b(cuanto|cuantos)\b/) && (T(/\b(quienes|quien|cuales|que clientes|clientes que|los que)\b.*\b(deben|debe|deuda|fiados?|fiaron)\b/) || T(/\blista de (fiados|deudores|deudas)\b|\bdeudores\b/))) return { intent: 'q_debtors' };

    // ---- reportes y respaldo ----
    if (T(/\b(respaldo|respaldar|copia de seguridad|backup)\b/)) return { intent: 'backup' };
    if (T(/\b(reporte|reportes|informe|informes)\b/) || (T(/\b(envia|enviar|enviame|manda|mandar|mandame|mandalo|comparte|compartir)\b/) && T(/\b(whatsapp|wasap|guasap|ws)\b/))) {
      const act = T(/\b(envia|enviar|enviame|manda|mandar|mandame|mandalo|comparte|compartir|whatsapp|wasap|guasap)\b/) ? 'send' : T(/\b(descarga|descargar|baja|bajar|pdf|guarda|guardar|imprime|imprimir)\b/) ? 'pdf' : 'show';
      let who = T(/\b(mi vecino|corresponsal|bancos?)\b/) ? 'mv' : T(/\b(todo|completo|tienda y mi vecino|los dos)\b/) ? 'todo' : T(/\b(cierre|de la caja)\b/) ? 'cierre' : null;
      let ownerId = null;
      for (const o of (ctx.owners || [])) { if (!o.isStore && nameTokens(o.name).some(nt => nt.length >= 3 && words.some(w => tokSim(w, nt) >= 0.88))) { ownerId = o.id; who = 'owner'; break; } }
      if (act !== 'show' || rg || who) return { intent: 'report', act, who: who || 'tienda', ownerId, range: rg };
    }

    // ---- agregar dueño / cliente / producto ----
    if (T(/\b(crea|crear|creame|nuevo producto|producto nuevo|nuevos productos|(agrega|agregar|anade|anadir|registra|registrar|da de alta) (un |el )?(nuevo )?producto)\b/)) return parseProdNew(t, ctx);
    if (!T(/\bproducto\b/) && T(/\b(agrega|agregar|anade|anadir|crea|crear|nuevo|nueva|registra|registrar)\b.*\b(dueno|duena)\b/)) return { intent: 'owner_add', nameWords: nameAfter(t, /^(dueno|duena|llamado|llamada|nombre|llama)$/) };
    if (T(/\b(agrega|agregar|anade|anadir|crea|crear|nuevo|nueva|registra|registrar)\b.*\bcliente\b/)) return { intent: 'customer_add', nameWords: nameAfter(t, /^(cliente|llamado|llamada|nombre|llama)$/) };

    // ---- cambiar el precio de un producto (en la venta o para siempre) ----
    if (hasNum && ((T(/\bprecio\b/) && T(/\b(cambia|cambiar|cambiale|pon|poner|ponle|modifica|modificar|baja|bajar|sube|subir|subele|bajale|actualiza|actualizar|nuevo)\b/)) || T(/\b(ahora|desde ahora|desde hoy)\b.*\b(cuesta|cuestan|vale|valen|sale|salen)\b/))) {
      const price = (t.filter(x => x.t === 'n' && x.money).pop() || t.filter(x => x.t === 'n' && !x.half).pop() || {}).v;
      const body = t.filter(x => x.t === 'w' && !/^(cambia|cambiar|cambiale|pon|poner|ponle|modifica|modificar|baja|bajar|sube|subir|subele|bajale|actualiza|actualizar|precio|de|del|la|el|a|en|con|dolar|dolares|centavos|un|una|nuevo|ahora|desde|hoy|cuesta|cuestan|vale|valen|sale|salen|producto|siempre)$/.test(x.s));
      const items = parseItems(body, products);
      return { intent: 'sale_price', item: items[0] || null, price: price === undefined ? null : price, persist: T(/\b(producto|inventario|siempre|desde ahora|de ahora en adelante|nuevo precio|ahora (cuesta|vale|sale)|a partir de|precio de venta|lista de precios|definitivo|permanente)\b/) };
    }

    // ---- gastos, pagos a proveedores, retiros del dueño y otros ingresos ----
    if (T(/\b(retiro|retire|retiramos|saque|saco|saca|sacamos)\b/) && T(/\b(dueno|duena|patron|patrona|personal|para mi|propio|mio)\b/)) return parseMoneyRec(s, 'retiro');
    if (T(/\bproveedor(es)?\b/) && T(/\b(pago|pague|pagamos|pagar|page|pagado|cancele|cancelamos|abone|abonamos)\b/)) return parseMoneyRec(s, 'compra');
    if (T(/\b(gasto|gastos|gaste|gastamos|gastaron|gastado|egreso|egresos)\b/)) return parseMoneyRec(s, 'gasto');
    if (T(/\b(otro ingreso|ingreso extra|ingreso de dinero|entrada de dinero|entro dinero|entro plata|aporte|aportaron|aporto|me dieron dinero)\b/)) return parseMoneyRec(s, 'ingreso');
    if (T(/\b(ingreso|ingresos|ingrese|entrada)\b/) && hasNum && (T(/\b(dolar|dolares|centavos)\b/) || T(/\bpor\b/)) && !T(/\b(stock|inventario|mercaderia)\b/)) {
      const kw = new Set(['ingreso', 'ingresos', 'ingrese', 'entrada', 'de', 'por', 'dolar', 'dolares', 'centavos', 'con', 'y', 'un', 'una']);
      const its = parseItems(t.filter(x => !(x.t === 'w' && kw.has(x.s))), products);
      if (!its.some(i => i.cands.length)) return parseMoneyRec(s, 'ingreso');
    }

    // ---- ir a una pantalla ----
    if (T(/\b(abre|abrir|abrime|ve a|vete a|ir a|ir al|llevame|muestrame|mostrar|pasa a|cambia a|entra a|entrar a|quiero ver|ver)\b/) || T(/\b(cerrar|cierra)\b.*\bcaja\b/) || T(/^(la |el |ir a |ve a )?(caja|reportes?|resumen|contabilidad|ajustes|productos|inventario|fiados?|ventas|historial|vender|cierre|inicio|principal|pantalla de inicio|pantalla principal|cierre de caja)$/)) {
      if (!T(/\b(cuanto|cuantos|cuantas)\b/)) {
        for (const [v, rx] of VIEWS) if (rx.test(s)) return { intent: 'nav', view: v };
      }
    }

    if (T(/\b(deshacer|deshaz|deshaga|desahacer|me equivoque|equivoque|error mio|anula lo ultimo|deshace lo ultimo)\b/)) return { intent: 'undo' };
    if (T(/^(el |la )?(total|vuelto|cambio)$/) || T(/^(dame|dime|cual es|cuanto es|a cuanto sale) (el )?(total|vuelto|cambio)$/) || T(/\bcuanto (es|va|seria|sale|hay que cobrar|le cobro|cobro|le doy de vuelto|de vuelto)( el)?( total| en total| todo| esto| ahora)?$/)) return { intent: 'q_total' };
    if (T(/\b(quita|quitar|borra|borrar|elimina|eliminar|saca|sacar)\b.*\b(ultim[oa]|ese|esa|lo ultimo)\b/) && !T(/\b(inventario|stock)\b/)) return { intent: 'sale_remove', items: [], last: true };

    // ---- anular una venta ya cobrada ----
    if (T(/\b(anula|anular|anulame|devuelve|devolver|reversa|reversar|borra|borrar|elimina|eliminar|cancela|cancelar)\b.*\b(ultima venta|ultimo cobro|venta anterior|venta (numero |no |n |#)?\d+|venta ya cobrada|venta cobrada|venta de recien)\b/)) {
      const m = /venta (?:numero |no |n |#)?(\d+)/.exec(s);
      return { intent: 'sale_void', no: m ? +m[1] : null };
    }
    // ---- venta: cancelar / en espera ----
    if (T(/\b(cancela|cancelar|anula|anular|vacia|vaciar|borra|borrar|elimina|eliminar|limpia|limpiar)\b.*\b(venta|todo|lista|carrito|cuenta|compra)\b|\bempezar de nuevo\b/)) return { intent: 'sale_cancel' };
    if (T(/\b(en espera|poner en espera|deja en espera|dejar en espera|pausa|pausar)\b/)) return { intent: 'sale_hold' };

    // ---- consultas del sistema (cuánto hay…) ----
    const qWord = T(/\b(cuanto|cuantos|cuantas|cual|cuales|dime|dime el|dimelo|decime|que saldo|como esta|como estan|me deben|nos deben|a cuanto|que hay|quedan|queda)\b/);
    const qFixed = T(/\b(total de fiados|total fiado|total de deudas|fiados totales|lo fiado|todos los fiados)\b/) || T(/^(saldo|saldos|stock|precio|ganancia|utilidad|ventas|deudas?|resumen del dia)\b/) || T(/\b(saldo de|saldos de|stock de|precio de|ganancia de|ganancia del|utilidad de|ventas de hoy|ventas del dia|ventas de ayer|ventas de|saldo en|total de hoy)\b/);
    const invUp = hasNum && T(/\b(sube|subir|aumenta|aumentar|baja|bajar|repon\w*|ingres\w*|entrada)\b/);
    if (!invUp && (qWord || qFixed) && !T(/\b(consulta|consultas)\b/) || (T(/\b(cuanto|cuantos|cuantas)\b/) && T(/\b(consultas?)\b/))) {
      const period = rg ? rg.key : (T(/\b(mes|mensual|este mes)\b/) ? 'mes' : T(/\bayer\b/) ? 'ayer' : T(/\bsemana\b/) ? 'semana' : 'hoy');
      // ¿cuánto vendió / ganó un dueño de productos?
      if (T(/\b(vendio|vendieron|gano|gananci\w*|ventas|vende|ganado)\b/)) { const ow = (ctx.owners || []).find(o => !o.isStore && nameTokens(o.name).some(nt => nt.length >= 3 && words.some(w => tokSim(w, nt) >= 0.88))); if (ow) return { intent: 'q_owner', ownerId: ow.id, period, range: rg }; }
      if (T(/\b(consultas?|depositos?|retiros?|operaciones|servicios|movimientos|transacciones)\b/)) return { intent: 'q_mv_counts', period, range: rg };
      if (T(/\b(ganancia|ganancias|utilidad|gane|ganamos|gano|ganado)\b/)) return { intent: 'q_profit', period, range: rg };
      if (bank || T(/\b(saldo|saldos|banco|bancos|mi vecino|corresponsal|cuentas?)\b/)) {
        if (!T(/\b(debe|deuda|deben)\b/)) return { intent: 'q_bank', bank };
      }
      if (T(/\b(vendi|vendimos|vendido|vendio|ventas|facturado|facture)\b/)) return { intent: 'q_sales', period, range: rg };
      if (T(/\b(debe|deben|deuda|deudas|fiado|fiados|fiaron|credito)\b/)) {
        const q = wordsOnly(t, new Set(['debe', 'deben', 'deuda', 'deudas', 'cuanto', 'cuantos', 'cuantas', 'dime', 'total', 'todos', 'clientes', 'hay', 'tengo', 'me', 'nos', 'fiado', 'fiados', 'fiaron', 'credito', 'cual', 'es', 'las', 'los']));
        return { intent: 'q_debt', customerQ: q.join(' ') };
      }
      if (T(/\b(caja|efectivo|plata|dinero|tienda)\b/) && !T(/\b(stock|quedan|queda)\b/)) return { intent: 'q_cash' };
      if (T(/\b(precio|cuesta|cuestan|vale|valen|cobran|a cuanto)\b/)) {
        const q = wordsOnly(t, new Set(['precio', 'cuesta', 'cuestan', 'vale', 'valen', 'cuanto', 'cobran', 'dime', 'cual', 'es', 'el']));
        const c = matchProducts(q, products);
        return { intent: 'q_price', q: q.join(' '), cands: c, id: autoPick(c) };
      }
      const q = wordsOnly(t, new Set(['stock', 'quedan', 'queda', 'hay', 'cuanto', 'cuantos', 'cuantas', 'dime', 'inventario', 'existencia', 'existencias', 'tengo', 'tenemos', 'cual', 'es', 'unidades', 'libras', 'libra', 'kilos', 'litros']));
      if (q.length) { const c = matchProducts(q, products); return { intent: 'q_stock', q: q.join(' '), cands: c, id: autoPick(c) }; }
      return { intent: 'unknown' };
    }

    // ---- Mi Vecino: consulta de saldo (solo se cuenta) ----
    if (T(/\b(consulta|consultas|consulto|consultaron|consultar|consultaba)\b/)) {
      if (T(/\b(del mes|este mes|mes|ayer|de hoy|hoy|esta semana|semana|del dia|llevamos|van|hubo|total)\b/)) return { intent: 'q_mv_counts', period: rg ? rg.key : T(/\bmes\b/) ? 'mes' : T(/\bayer\b/) ? 'ayer' : T(/\bsemana\b/) ? 'semana' : 'hoy', range: rg };
      const nIdx = t.findIndex(x => x.t === 'n' && !x.half);
      const n = nIdx >= 0 ? Math.max(1, Math.min(50, Math.round(t[nIdx].v))) : 1;
      return Object.assign({ intent: 'mv_consulta', n }, bankObj);
    }

    // ---- Mi Vecino: depósitos, retiros, servicios… ----
    const opRx = [
      ['cargar', /\b(cargar|carga|cargue|cargo|recargar|recarga|recargue|recargo)\b.*\b(saldo|banco|cuenta|pichincha|guayaquil)\b|\bcargar\b/],
      ['sacar', /\b(sacar|saque|saca|pasar|paso|pase)\b.*\b(saldo|banco|cuenta del banco|del banco)\b/],
      ['servicio', /\bservicios?\b|\b(pag(o|os|ar|ue|aron|ando))\b.*\b(luz|agua|telefono|internet|planilla|cnel|claro|movistar|cnt|tv|cable)\b/],
      ['retiro', /\bretir(o|os|ar|a|e|aron|ado|ando|aria|aran|amos)\b/],
      ['deposito', /\bdeposit(o|os|ar|a|e|aron|ado|ando|aria|aran|amos)\b/],
    ];
    const found = [];
    for (const [op, rx] of opRx) { const m = rx.exec(s); if (m) found.push({ op, at: m.index }); }
    if (found.length) {
      const distinct = Array.from(new Set(found.filter(f => f.op !== 'servicio' || !found.some(g => g.op === 'deposito' || g.op === 'retiro')).map(f => f.op)));
      if (distinct.length > 1 && !(distinct.length === 2 && distinct.includes('cargar') && distinct.includes('deposito'))) return { intent: 'mv_multi' };
      const op = distinct.includes('cargar') ? 'cargar' : distinct[0];
      const rest = t.filter(x => !(x.t === 'w' && (BANKS_RX.pichincha.test(x.s) || BANKS_RX.guayaquil.test(x.s))));
      const opAt = rest.findIndex(x => x.t === 'w' && /^(retir|deposit|servicio|cargar|carga|cargue|cargo|recargar|recarga|recargue|recargo|sacar|saque|saca|pasar|paso|pase|pag)/.test(x.s));
      const after = opAt >= 0 ? rest.slice(opAt + 1) : rest;
      let amount = amountFrom(after);
      if (amount === null && opAt > 0) { const b = rest.slice(0, opAt); const n = b.find(x => x.t === 'n' && !x.half && (x.money || x.v >= 5)); if (n) amount = amountFrom(b); }
      return Object.assign({ intent: 'mv', op, amount }, bankObj);
    }

    // ---- cobro de deuda (fiado) ----
    if (T(/\b(abono|abona|abonar|abonaron|abonado|pago de (la )?deuda|pago su deuda|cobrar fiado|cobro de fiado|cobra el fiado|cobre el fiado|pago el fiado|pago fiado|saldo su deuda|pagar fiado)\b/) || (T(/\b(pago|pagaron|pago|cancelo|cancelaron|dio|dieron)\b/) && T(/\b(deuda|fiado|fiada|debia|debe)\b/))) {
      const q = wordsOnly(t, new Set(['abono', 'abona', 'abonar', 'abonaron', 'abonado', 'pago', 'pagaron', 'cancelo', 'cancelaron', 'deuda', 'fiado', 'fiada', 'debia', 'debe', 'cobrar', 'cobro', 'cobra', 'cobre', 'de', 'su', 'saldo', 'dio', 'dieron', 'pagar', 'el', 'la']));
      const amount = amountFrom(t.filter(x => !(x.t === 'w')));
      return { intent: 'debt_pay', customerQ: q.join(' '), cands: matchNames(q, customers), amount };
    }

    // ---- inventario ----
    const invIn = T(/\b(ingreso|ingresos|ingresa|ingresar|ingresaron|ingrese|entrada|entradas|entraron|entro|llegaron|llego|llegada|recibi|recibimos|recibir|compre|compramos|surtir|surti|surtimos|reponer|repuse|reposicion|aumenta|aumentar|sube el stock)\b/);
    const invOut = T(/\b(saque|saca|sacar|sacamos)\b.*\b(inventario|stock|mercaderia)\b|\b(salida|salidas|baja|bajas|dar de baja|danaron|danado|danados|danada|dano|vencio|vencieron|vencido|vencidos|merma|mermas|consumo|regale|regalamos|obsequie|descuenta|descontar|se perdio|perdida|saque del inventario|saque de inventario|saca del inventario)\b/) ;
    if (invIn || invOut) {
      const kind = invIn && (!invOut || s.search(/\b(ingres|entrad|entraron|llegaron|recibi|compre|surt|repon|aument)/) <= s.search(/\b(salida|baja|dano|venci|merma|consumo|regal|descuent|perdi)/)) ? 'in' : 'out';
      // costo: "costo 85", "cuesta 0.85", "a 0.85 cada una"
      let cost = null, tk = t.slice();
      for (let i = 0; i < tk.length; i++) {
        const w = tk[i];
        if (w.t === 'w' && /^(costo|cuesta|cuestan|costaron)$/.test(w.s)) { const rest = tk.slice(i + 1); const a = amountFrom(rest.filter(x => x.t === 'n' || (x.t === 'w' && /^(dolar|dolares|centavos|con|y|de)$/.test(x.s)))); if (a !== null) { cost = a; tk.splice(i, rest.length + 1); break; } }
        if (w.t === 'w' && w.s === 'a' && tk[i + 1] && tk[i + 1].t === 'n' && tk.slice(i + 2, i + 5).some(x => x.t === 'w' && /^(cada|c)$/.test(x.s))) { cost = tk[i + 1].v; tk.splice(i, 2); break; }
      }
      const reason = !invOut ? '' : T(/dan/) ? 'dañado' : T(/venci/) ? 'vencido' : T(/consumo|me lleve|regal|obsequi/) ? (T(/regal|obsequi/) ? 'regalo' : 'consumo propio') : T(/perd/) ? 'perdido' : 'salida de inventario';
      const KW = new Set(['ingreso', 'ingresos', 'ingresa', 'ingresar', 'ingresaron', 'ingrese', 'entrada', 'entradas', 'entraron', 'entro', 'llegaron', 'llego', 'llegada', 'recibi', 'recibimos', 'recibir', 'compre', 'compramos', 'surtir', 'surti', 'surtimos', 'reponer', 'repuse', 'reposicion', 'aumenta', 'aumentar', 'sube', 'stock', 'inventario', 'salida', 'salidas', 'baja', 'bajas', 'dar', 'danaron', 'danado', 'danados', 'danada', 'dano', 'vencio', 'vencieron', 'vencido', 'vencidos', 'merma', 'mermas', 'consumo', 'regale', 'regalamos', 'obsequie', 'descuenta', 'descontar', 'perdio', 'perdida', 'saque', 'saca', 'del', 'de', 'se', 'unidades', 'unidad', 'mercaderia', 'mercancia', 'al', 'el', 'lo', 'un', 'una', 'una', 'cajas', 'caja']);
      const body = tk.filter(x => !(x.t === 'w' && KW.has(x.s)));
      const items = parseItems(body, products);
      if (!items.some(i => i.id || i.cands.length) && hasNum && T(/\brecib/)) return { intent: 'sale_received', received: amountFrom(t.filter(x => x.t === 'n')) };
      const it = items[0] || null;
      return { intent: kind === 'in' ? 'inv_in' : 'inv_out', item: it, items, cost, reason, paid: kind === 'in' && T(/\b(pague|pagado|pagada|pagamos|de la caja)\b/) };
    }

    // ---- venta ----
    const wCobrar = T(/\b(cobra|cobrar|cobrame|cobrale|cobre|cobro|cobrarle|cobrando)\b|\b(terminar|termina|cierra|cerrar|finaliza|finalizar|listo con)\b.*\b(venta|cuenta|compra)\b|\bya pago\b|\bya pagaron\b/);
    const wFiado = T(/\b(fiado|fiada|fiar|fia|fio|fiame|a credito|dejar debiendo|apuntar a|apunta a|apuntalo|apuntala)\b/);
    // dinero recibido: "paga con 20", "recibí 20", "me da 20"
    let received = null;
    for (let i = 0; i < t.length; i++) {
      const w = t[i];
      if (w.t === 'w' && /^(paga|pagan|pagaron|pago|recibi|recibimos|da|dan|dio|dieron|entrega|entrego|billete|con)$/.test(w.s)) {
        const rest = t.slice(i + 1, i + 8);
        const a = amountFrom(rest.filter(x => x.t === 'n' || (x.t === 'w' && /^(de|con|dolar|dolares|y)$/.test(x.s))));
        if (a !== null && (w.s !== 'con' || t.slice(0, i).some(x => x.t === 'w' && /^(paga|pagan|pago|cobra|cobrar|recibi|da|dan)$/.test(x.s)) || wCobrar)) { received = a; break; }
      }
    }
    // quitar de la lista
    if (T(/\b(quita|quitar|quitale|quitame|saca|sacar|elimina|eliminar|borra|borrar|resta|restar|sin)\b/) && !wFiado) {
      const KW = new Set(['quita', 'quitar', 'quitale', 'quitame', 'saca', 'sacar', 'elimina', 'eliminar', 'borra', 'borrar', 'resta', 'restar', 'sin', 'de', 'la', 'el', 'lista', 'venta', 'cuenta']);
      const items = parseItems(t.filter(x => !(x.t === 'w' && KW.has(x.s))), products);
      return { intent: 'sale_remove', items };
    }
    // cliente del fiado: se separa su nombre de los productos
    const FIADO_W = new Set(['fiado', 'fiada', 'fiar', 'fia', 'fio', 'fiame', 'fialo', 'fiala', 'credito', 'apuntar', 'apunta', 'apuntalo', 'apuntala', 'anota', 'dejar', 'deja', 'debiendo', 'cuenta']);
    let tt = stripPayWords(t);
    let nameWords = [];
    if (wFiado) {
      tt = tt.filter(x => !(x.t === 'w' && (TITLES.has(x.s) || FIADO_W.has(x.s))));
      const drop = new Set();
      tt.forEach((x, i) => {
        if (x.t !== 'w' || STOP.has(x.s) || CMD_WORDS.has(x.s) || has(UNITW, x.s)) return;
        const hit = customers.some(c => nameTokens(c.name).some(nt => tokSim(x.s, nt) >= 0.85));
        if (!hit) return;
        const pm = matchProducts([x.s], products);
        if (pm.length && pm[0].score >= 0.9) return;
        drop.add(i);
      });
      nameWords = tt.filter((_, i) => drop.has(i)).map(x => x.s);
      tt = tt.filter((_, i) => !drop.has(i));
    }
    let itemsRaw = parseItems(tt, products, { span: wFiado });
    if (wFiado && !nameWords.length) {
      const unres = itemsRaw.filter(i => !i.cands.length && i.qty === null && i.money === null);
      nameWords = unres.flatMap(i => i.q.split(' ')).concat(itemsRaw.flatMap(i => i.extra || [])).filter(w => w && !STOP.has(w));
      itemsRaw = itemsRaw.filter(i => !unres.includes(i));
    }
    const itemsOK = itemsRaw.filter(i => i.id || i.cands.length);
    if (received !== null && !wCobrar && !wFiado && !itemsOK.length && !T(/\b(vende|vender|agrega|anota|pon)\b/)) return { intent: 'sale_received', received };
    const fiado = wFiado ? { q: nameWords.join(' '), cands: matchNames(nameWords, customers) } : null;
    const hasVerb = T(/\b(vende|vender|vendi|vendeme|venta|anota|anotar|anotame|apunta|agrega|agregar|agregame|anade|anadir|pon|ponme|ponle|suma|sumar|dame|deme|dar|llevo|lleva|llevar|quiero|necesito|registra|registrar|otra|otro)\b/);
    if (itemsOK.length || (hasVerb && itemsRaw.length)) return { intent: 'sale', items: itemsRaw, cobrar: wCobrar && !wFiado, fiado, received };
    if (wFiado) return { intent: 'sale', items: [], cobrar: false, fiado, received };
    if (wCobrar) return { intent: 'sale', items: [], cobrar: true, fiado: null, received };
    return { intent: 'unknown' };
  }
  function stripPayWords(t) {
    // quita "paga con 20" para que el 20 no se tome como cantidad de un producto
    const out = [];
    for (let i = 0; i < t.length; i++) {
      const w = t[i];
      if (w.t === 'w' && /^(paga|pagan|pagaron|pago|recibi|recibimos|me|da|dan|dio|dieron|entrega|entrego)$/.test(w.s)) {
        let j = i + 1; while (t[j] && ((t[j].t === 'w' && /^(con|de|dolar|dolares|y)$/.test(t[j].s)) || (t[j].t === 'n'))) j++;
        if (j > i + 1 && t.slice(i + 1, j).some(x => x.t === 'n')) { i = j - 1; continue; }
      }
      out.push(w);
    }
    return out;
  }

  /* ---------- ayudas para respuestas parciales ---------- */
  function ordinal(text) {
    const t = lex(text);
    const n = t.find(x => x.t === 'n' && !x.half && x.v >= 1 && x.v <= 9);
    if (n) return n.v;
    for (const x of t) if (x.t === 'w' && has(ORD, x.s)) return ORD[x.s];
    return null;
  }
  const textTokens = text => strip(text).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);

  return { parse, lex, strip, amountFrom, ordinal, matchProducts, matchNames, autoPick, textTokens, phon, round2, round3, UNITW, rangeFrom, labelAmounts, accLabel };
})();
