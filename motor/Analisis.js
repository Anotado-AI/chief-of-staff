// --- analizar_bandeja: el correo de N días agrupado por remitente, para la instalación ---
// Solo hechos: llegados, abiertos, contestados, lista, categoría de Gmail, tipo de baja, plataforma, filtros y etiquetas.
// No decide nada: lo que harían las políticas lo dice simular.
// Una persona con mucho correo recibe 7,500 correos al mes: leerlos toma minutos, más que una llamada de MCP. El cálculo es
// un trabajo por partes: cada llamada avanza hasta 18 s y un activador de un minuto sigue solo hasta terminar.
// Los ids y los acumulados viven en CacheService por trozos (6 h); el control del trabajo en las propiedades
// y el resultado final en el almacén. Si la caché se pierde a medias, el trabajo empieza de nuevo.
// Solo uno avanza a la vez: el candado de usuario no separa al activador de la web app anónima, así que
// el turno es una marca con vencimiento que se toma bajo el candado del script.

const ANALISIS = {
  PRESUPUESTO_LLAMADA_MS: 12000,
  PRESUPUESTO_ACTIVADOR_MS: 270000,
  LOTE: 50,
  MS_POR_LOTE: 2000,
  TANDA_LLAMADA: 100,
  TANDA_ACTIVADOR: 200,
  DIAS_ENVIADOS: 90,
  MAX_RECIBIDOS: 20000,
  MAX_ENVIADOS: 6000,
  TROZO: 90000,
  VIGENCIA_MS: 6 * 3600000,
  MAX_GRUPOS: 200,
  GRUPOS_ALMACEN: 60,
  // La salida: los campos generales primero y los grupos al final, con un tope de caracteres que deja la respuesta bajo los
  // 50,000 que Claude Code manda a un archivo, y 30 grupos por página. Con corto, la muestra de asuntos solo va en los
  // primeros 20 grupos. La web app no tiene ese tope: recibe 50 grupos con su muestra, como antes.
  TOPE_TEXTO: 45000,
  GRUPOS_POR_PAGINA: 30,
  GRUPOS_WEBAPP: 50,
  MUESTRA_CABEZA: 20,
  DESTINATARIOS: 15,
  RX_REENVIO: /^\s*(fwd?|rv|reenv\w*|enc|tr|wg)\s*:/i,
  LLAVE: 'cos3A.trabajo',
  TURNO: 'cos3A.turno',
  PREFIJO: 'cos3A.'
};

// Cada valor lleva un # al frente: la caché no distingue un texto vacío de uno que no existe.
function cachePoner_(base, texto) {
  const c = CacheService.getScriptCache();
  texto = '#' + texto;
  const n = Math.max(1, Math.ceil(texto.length / ANALISIS.TROZO));
  const o = {};
  for (let i = 0; i < n; i++) o[base + '.' + i] = texto.slice(i * ANALISIS.TROZO, (i + 1) * ANALISIS.TROZO);
  o[base + '.n'] = String(n);
  c.putAll(o, 21600);
}

function cacheLeer_(base) {
  const c = CacheService.getScriptCache();
  const n = Number(c.get(base + '.n'));
  if (!n) return null;
  const ks = [];
  for (let i = 0; i < n; i++) ks.push(base + '.' + i);
  const o = c.getAll(ks);
  let s = '';
  for (let i = 0; i < n; i++) { if (o[ks[i]] === undefined || o[ks[i]] === null) return null; s += o[ks[i]]; }
  return s.charAt(0) === '#' ? s.slice(1) : null;
}

function tomarTurno_(segundos) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return null;
  try {
    const props = PropertiesService.getScriptProperties();
    const t = JSON.parse(props.getProperty(ANALISIS.TURNO) || 'null');
    if (t && t.vence > Date.now()) return null;
    const id = Utilities.getUuid();
    props.setProperty(ANALISIS.TURNO, JSON.stringify({ id: id, vence: Date.now() + segundos * 1000 }));
    return id;
  } finally {
    lock.releaseLock();
  }
}
function soltarTurno_(id) {
  const props = PropertiesService.getScriptProperties();
  try { const t = JSON.parse(props.getProperty(ANALISIS.TURNO) || 'null'); if (t && t.id === id) props.deleteProperty(ANALISIS.TURNO); } catch (e) {}
}

function trabajoAnalisis_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(ANALISIS.LLAVE) || 'null'); } catch (e) { return null; }
}
function guardarTrabajo_(tr) {
  tr.actualizado = Date.now();
  PropertiesService.getScriptProperties().setProperty(ANALISIS.LLAVE, JSON.stringify(tr));
}

// Todos los ids de una búsqueda (de 500 en 500), por REST para pedir solo el id.
function idsDe_(q, max, conPapelera) {
  const token = ScriptApp.getOAuthToken();
  const ids = [];
  let pagina = null;
  do {
    const url = 'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=500&fields=messages/id,nextPageToken&q=' + encodeURIComponent(q) +
      (conPapelera ? '&includeSpamTrash=true' : '') + (pagina ? '&pageToken=' + encodeURIComponent(pagina) : '');
    let r;
    for (let i = 0, espera = 800; i < 4; i++, espera *= 2) {
      r = externa_(() => UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true }));
      if (r.getResponseCode() !== 429 && r.getResponseCode() < 500) break;
      Utilities.sleep(espera);
    }
    if (r.getResponseCode() !== 200) throw new Error('messages.list respondió ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 200));
    const j = JSON.parse(r.getContentText());
    (j.messages || []).forEach(m => ids.push(m.id));
    pagina = j.nextPageToken;
  } while (pagina && ids.length < max);
  return ids.slice(0, max);
}

const CABECERAS_ANALISIS = ['From', 'Subject', 'List-Unsubscribe', 'List-Unsubscribe-Post', 'List-Id', 'Precedence', 'Auto-Submitted', 'Feedback-ID', 'X-SES-Outgoing', 'X-Mailgun-Sid', 'X-Campaign-Id', 'X-MC-User'];

// Día local como número (días desde 1970 en la zona del script).
function diaLocal_(ms, desfase) { return Math.floor((Number(ms) + desfase) / 86400000); }
function desfaseZona_() {
  const z = Utilities.formatDate(new Date(), tz_(), 'Z');
  return (z[0] === '-' ? -1 : 1) * (Number(z.slice(1, 3)) * 60 + Number(z.slice(3, 5))) * 60000;
}

// Avanza el trabajo hasta agotar el presupuesto. Devuelve el trabajo (con fase 'listo' al terminar).
// Enviados (90 días): a quién le escribe la persona y en qué hilos, para contestados y contestados_en_24h.
// Recibidos (N días): por remitente, lo que hizo con cada correo.
function avanzarAnalisis_(tr, presupuesto, tandaMax) {
  const t0 = Date.now();
  const tamTanda = tandaMax || ANALISIS.TANDA_ACTIVADOR;
  const base = ANALISIS.PREFIJO + tr.id;
  const queda = () => presupuesto - (Date.now() - t0);
  const yo = yo_();
  if (tr.fase === 'listar') {
    const rec = idsDe_('newer_than:' + tr.dias + 'd -in:sent -in:chats -in:drafts -in:spam', ANALISIS.MAX_RECIBIDOS, true);
    const env = idsDe_('in:sent newer_than:' + ANALISIS.DIAS_ENVIADOS + 'd', ANALISIS.MAX_ENVIADOS, false);
    cachePoner_(base + '.rec', rec.join(','));
    cachePoner_(base + '.env', env.join(','));
    cachePoner_(base + '.agg', '{}');
    cachePoner_(base + '.cont', '{}');
    cachePoner_(base + '.envh', '{}');
    cachePoner_(base + '.envu', '{}');
    tr.n_rec = rec.length; tr.n_env = env.length; tr.hechos_rec = 0; tr.hechos_env = 0; tr.fallidos = 0; tr.dd = {};
    tr.he = []; tr.hf = []; for (let i = 0; i < 24; i++) { tr.he.push(0); tr.hf.push(0); }
    tr.fw = 0;
    tr.fase = 'enviados';
    tr.ms_listar = Date.now() - t0;
    guardarTrabajo_(tr);
  }
  const leerIds = k => { const s = cacheLeer_(base + '.' + k); return s === null ? null : (s ? s.split(',') : []); };
  const reiniciar = () => { tr.fase = 'listar'; tr.reinicios = (tr.reinicios || 0) + 1; guardarTrabajo_(tr); return tr.reinicios > 3 ? falloAnalisis_(tr, 'La caché se perdió varias veces.') : avanzarAnalisis_(tr, queda(), tamTanda); };
  if (tr.fase === 'enviados' || tr.fase === 'recibidos') {
    const env = tr.fase === 'enviados';
    const ids = leerIds(env ? 'env' : 'rec');
    const acum = cacheLeer_(base + (env ? '.cont' : '.agg'));
    const envhTxt = cacheLeer_(base + '.envh');
    const contTxt = env ? acum : cacheLeer_(base + '.cont');
    if (ids === null || acum === null || envhTxt === null || contTxt === null) return reiniciar();
    const a = JSON.parse(acum), envh = JSON.parse(envhTxt), cont = env ? a : JSON.parse(contTxt);
    // Último envío a cada destinatario (minutos). Un trabajo que empezó antes de este campo sigue sin él.
    const envuTxt = env ? cacheLeer_(base + '.envu') : null;
    const envu = envuTxt ? JSON.parse(envuTxt) : null;
    const campo = env ? 'hechos_env' : 'hechos_rec';
    const cab = env ? '&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Bcc&metadataHeaders=Subject&fields=threadId,internalDate,payload/headers'
      : '&' + CABECERAS_ANALISIS.map(h => 'metadataHeaders=' + encodeURIComponent(h)).join('&') + '&fields=id,threadId,labelIds,internalDate,payload/headers';
    // Lo que marcó leído el sistema (una política o un resumen) no cuenta como abierto.
    const ctx = env ? null : { nombres: nombresEtiquetas_(), sis: (() => { try { return leidosSistema_(almacen_()); } catch (e) { return {}; } })() };
    const desfase = desfaseZona_();
    while (tr[campo] < ids.length && queda() > 5000) {
      const tanda = ids.slice(tr[campo], tr[campo] + tamTanda);
      const rutas = tanda.map(id => 'messages/' + id + '?format=metadata' + cab);
      const datos = leerPausado_(rutas);
      // Lo que Gmail no dejó leer por cuota se reintenta una vez, despacio.
      const falta = [];
      datos.forEach((m, k) => { if (!m) falta.push(k); });
      if (falta.length && queda() > 3000) {
        Utilities.sleep(1000);
        const re = gmailFetchAll_(falta.map(k => rutas[k]), 5);
        falta.forEach((k, j) => { datos[k] = re[j]; });
      }
      datos.forEach(m => {
        if (!m) { tr.fallidos++; return; }
        const h = {}, hc = {};
        ((m.payload && m.payload.headers) || []).forEach(x => { h[x.name.toLowerCase()] = x.value; hc[x.name] = x.value; });
        if (env) {
          const minuto = Math.floor(Number(m.internalDate) / 60000);
          correos_([h.to, h.cc, h.bcc].join(',')).forEach(x => { if (x !== yo) { a[x] = (a[x] || 0) + 1; if (envu && !(envu[x] >= minuto)) envu[x] = minuto; } });
          if (m.threadId) (envh[m.threadId] = envh[m.threadId] || []).push(minuto);
          if (tr.fw !== undefined && ANALISIS.RX_REENVIO.test(h.subject || '')) tr.fw++;
          // Hora local de cada envío: Gmail no guarda a qué hora se abre un correo, así que el envío es la señal de cuándo trabaja el correo.
          // Se cuenta aparte el fin de semana (sábado y domingo, hora local): la persona casi nunca lee igual.
          if (tr.he && Number(m.internalDate) > Date.now() - 30 * 86400000) {
            const local = new Date(Number(m.internalDate) + desfase);
            tr.he[local.getUTCHours()]++;
            if (tr.hf && (local.getUTCDay() === 0 || local.getUTCDay() === 6)) tr.hf[local.getUTCHours()]++;
          }
          return;
        }
        const de = correo_(h.from);
        if (!de || de === yo) return;
        const l = m.labelIds || [];
        const t = Number(m.internalDate) || 0;
        const dia = diaLocal_(t, desfase);
        const sis = ctx.sis[m.threadId];
        const porSistema = l.indexOf('UNREAD') < 0 && sis && t / 1000 <= sis.t ? sis.por : null;
        const leido = l.indexOf('UNREAD') < 0 && !porSistema;
        // El marcado masivo se mide en la bandeja: lo que filtra Gmail o va a la papelera sigue sin leer aunque se marque todo.
        if (l.indexOf('INBOX') >= 0) { const dd = tr.dd[dia] = tr.dd[dia] || [0, 0]; dd[0]++; if (!leido) dd[1]++; }
        const g = a[de] || (a[de] = { n: 0, b: 0, p: 0, e: 0, bs: 0, ba: 0, as: 0, c24: 0, ct: 0, tb: 0, ca: {}, pl: {}, et: {}, dl: {}, bj: {}, mu: { si: [], no: [] }, u: 0 });
        g.n++;
        // Leído por una política o por un resumen: se cuenta aparte, nunca como abierto.
        if (porSistema === 'resumen') g.lr = (g.lr || 0) + 1;
        else if (porSistema) g.lp = (g.lp || 0) + 1;
        if (l.indexOf('INBOX') >= 0) g.b++;
        if (l.indexOf('STARRED') >= 0) g.e++;
        if (l.indexOf('TRASH') >= 0) { g.p++; if (leido) g.ba++; else g.bs++; }
        else if (l.indexOf('INBOX') < 0 && !leido) g.as++;
        const x = g.dl[dia] = g.dl[dia] || [0, 0];
        x[0]++; if (leido) x[1]++;
        const cat = l.filter(y => CAT_LETRA[y])[0];
        if (cat) g.ca[CAT_LETRA[cat]] = (g.ca[CAT_LETRA[cat]] || 0) + 1;
        l.forEach(y => { if (/^Label_/.test(y) && ctx.nombres[y] && !esEtiquetaCos_(ctx.nombres[y])) g.et[y] = (g.et[y] || 0) + 1; });
        if (h['list-unsubscribe']) g.tb++;
        const bj = tipoBaja_(hc);
        g.bj[bj] = (g.bj[bj] || 0) + 1;
        const pl = plataforma_(hc);
        if (pl) g.pl[pl] = (g.pl[pl] || 0) + 1;
        const resp = (envh[m.threadId] || []).filter(mi => mi * 60000 > t);
        const contesto = resp.length > 0;
        if (contesto) { g.ct++; if (resp.some(mi => mi * 60000 - t <= 86400000)) g.c24++; if (resp.some(mi => mi * 60000 - t <= 3600000)) g.c1 = (g.c1 || 0) + 1; }
        if (t > g.u) { g.u = t; g.no = nombreDe_(h.from).slice(0, 50); g.bu = bj; }
        const lid = (h['list-id'] || '').match(/<([^>]+)>/);
        if (lid || h['list-id']) g.li = (lid ? lid[1] : h['list-id']).trim().toLowerCase().slice(0, 80);
        const mu = leido ? g.mu.si : g.mu.no;
        if (mu.length < 3) mu.push([m.threadId, entidades_(h.subject || '(sin asunto)').slice(0, 60), contesto ? 1 : 0, dia]);
      });
      tr[campo] += tanda.length;
      cachePoner_(base + (env ? '.cont' : '.agg'), JSON.stringify(a));
      if (env) cachePoner_(base + '.envh', JSON.stringify(envh));
      if (envu) cachePoner_(base + '.envu', JSON.stringify(envu));
      guardarTrabajo_(tr);
    }
    if (tr[campo] >= ids.length) {
      if (env) { tr.fase = 'recibidos'; guardarTrabajo_(tr); if (queda() > 5000) return avanzarAnalisis_(tr, queda(), tamTanda); }
      else { tr.fase = 'final'; guardarTrabajo_(tr); }
    }
  }
  if (tr.fase === 'final') {
    const agg = cacheLeer_(base + '.agg'), cont = cacheLeer_(base + '.cont');
    if (agg === null || cont === null) { tr.fase = 'listar'; tr.reinicios = (tr.reinicios || 0) + 1; guardarTrabajo_(tr); return tr; }
    const st = almacen_();
    const envu = cacheLeer_(base + '.envu');
    const res = resultadoAnalisis_(tr, JSON.parse(agg), JSON.parse(cont), st, envu ? JSON.parse(envu) : null);
    cachePoner_(ANALISIS.PREFIJO + 'res', JSON.stringify(res));
    const corto = Object.assign({}, res, { grupos: res.grupos.slice(0, ANALISIS.GRUPOS_ALMACEN), recortado: res.grupos.length > ANALISIS.GRUPOS_ALMACEN || undefined });
    // Aperturas de cada remitente en el periodo confiable: [llegaron, abiertos, llegaron en el periodo confiable]. Deciden si se marca leído desde el primer día.
    // Solo quien tiene historia confiable, hasta 2,000: vive en las propiedades del script (500 KB en total).
    const ap = {};
    res.grupos.filter(g => g.nc > 0).slice(0, 2000).forEach(g => { ap[g.r] = [g.n || 0, g.l || 0, g.nc || 0]; });
    conCandado_(s2 => { s2.set('analisis', corto); s2.set('aperturas_30d', ap); });
    tr.fase = 'listo';
    tr.terminado = Date.now();
    guardarTrabajo_(tr);
    const c = CacheService.getScriptCache();
    ['rec', 'env', 'agg', 'cont', 'envh', 'envu'].forEach(k => { try { c.remove(base + '.' + k + '.n'); } catch (e) {} });
  }
  return tr;
}

// Marcado masivo: el último día antes del cual no queda nada sin leer en la bandeja (con 20 correos o más),
// seguido de un periodo donde al menos el 30% sigue sin leer. Antes de ese día, "leído" no prueba que lo abrió.
function marcadoMasivo_(dd) {
  const dias = Object.keys(dd || {}).map(Number).sort((a, b) => a - b);
  let total = 0, sinLeer = 0;
  dias.forEach(d => { total += dd[d][0]; sinLeer += dd[d][1]; });
  let antesN = 0, antesU = 0, mejor = null;
  for (let i = 0; i < dias.length - 1; i++) {
    antesN += dd[dias[i]][0]; antesU += dd[dias[i]][1];
    const despN = total - antesN, despU = sinLeer - antesU;
    if (antesN >= 20 && antesU === 0 && despN >= 20 && despU / despN >= 0.3) mejor = dias[i];
  }
  return mejor;
}

// Lotes de 50 (uno por llamada externa) con al menos 2 s cada uno: unas 25 lecturas por segundo, la mitad de la cuota por usuario
// de Gmail. Si hay una herramienta en curso (ver_hoy, leer_hilo…), el cálculo espera para dejarle la cuota.
function cederPaso_() {
  const c = CacheService.getScriptCache();
  for (let i = 0; i < 4 && c.get('cos.interactiva'); i++) Utilities.sleep(1500);
}
function marcarInteractiva_(activa) {
  try { const c = CacheService.getScriptCache(); if (activa) c.put('cos.interactiva', '1', 20); else c.remove('cos.interactiva'); } catch (e) {}
}

function leerPausado_(rutas) {
  const salida = [];
  for (let i = 0; i < rutas.length; i += ANALISIS.LOTE) {
    cederPaso_();
    const t = Date.now();
    gmailFetchAll_(rutas.slice(i, i + ANALISIS.LOTE), ANALISIS.LOTE).forEach(x => salida.push(x));
    const espera = ANALISIS.MS_POR_LOTE - (Date.now() - t);
    if (espera > 0 && i + ANALISIS.LOTE < rutas.length) Utilities.sleep(espera);
  }
  return salida;
}

function falloAnalisis_(tr, motivo) {
  tr.fase = 'error';
  tr.error = motivo;
  guardarTrabajo_(tr);
  return tr;
}

function resultadoAnalisis_(tr, agg, cont, st, envu) {
  const D = marcadoMasivo_(tr.dd);
  const diaTexto = d => Utilities.formatDate(new Date(d * 86400000 + 12 * 3600000), 'UTC', 'yyyy-MM-dd');
  const ks = Object.keys(agg).sort((a, b) => agg[b].n - agg[a].n || agg[b].u - agg[a].u);
  const total = ks.reduce((s, k) => s + agg[k].n, 0);
  let acum = 0, cobertura = 0;
  for (let i = 0; i < ks.length; i++) { acum += agg[ks[i]].n; if (acum >= total * 0.9) { cobertura = i + 1; break; } }
  const rescates = {};
  st.get('senales', []).forEach(x => { if (x.tipo === 'rescate' && x.remitente) rescates[x.remitente] = (rescates[x.remitente] || 0) + 1; });
  let filtros = [], errorFiltros = null;
  try { filtros = ((Gmail.Users.Settings.Filters.list('me') || {}).filter || []).map(f => filtroParaEmparejar_(f.id, f.criteria || {}, ((f.action || {}).removeLabelIds || []).indexOf('INBOX') >= 0)); }
  catch (e) { errorFiltros = String(e && e.message || e).slice(0, 200); }
  const nombres = nombresEtiquetas_();
  const mayor = o => { const k = Object.keys(o || {}).sort((a, b) => o[b] - o[a])[0]; return k || null; };
  const filtroDe = (r, li) => filtroQueToca_(filtros, r, li);
  const hoyDia = diaLocal_(Date.now(), desfaseZona_());
  const fila = k => {
    const g = agg[k];
    const fx = filtroDe(k, g.li);
    // En cuántas de las últimas 4 semanas llegó algo de este remitente (la prueba "se repite").
    const sem = {};
    Object.keys(g.dl).forEach(d => { const atras = hoyDia - Number(d); if (atras >= 0 && atras < 28) sem[Math.floor(atras / 7)] = 1; });
    let l = 0, nc = 0;
    Object.keys(g.dl).forEach(d => { if (D === null || Number(d) > D) { nc += g.dl[d][0]; l += g.dl[d][1]; } });
    const mu = g.mu.si.slice(0, g.mu.no.length ? 3 : 5).concat(g.mu.no).slice(0, 5)
      .map(x => [x[0], x[1], g.mu.si.indexOf(x) >= 0 ? (D !== null && x[3] <= D ? null : 1) : 0, x[2]]);
    return { r: k, no: g.no || '', n: g.n, b: g.b, l: l, nc: nc, c: cont[k] || 0, ct: g.ct, c24: g.c24, c1: g.c1 || 0, e: g.e, bs: g.bs, ba: g.ba, as: g.as, rs: rescates[k] || 0,
      co: cont[k] ? 1 : 0, ca: mayor(g.ca), li: g.li || null, tb: g.tb * 2 >= g.n ? 1 : 0, pl: mayor(g.pl), et: Object.keys(g.et).sort((a, b) => g.et[b] - g.et[a]).slice(0, 3).map(id => nombres[id]).filter(Boolean),
      fi: fx ? fx.id : null, fs: fx && fx.saca ? 1 : undefined, fp: fx && fx.parcial ? 1 : undefined, bj: g.bu || mayor(g.bj) || 'ninguna', sm: Object.keys(sem).length, mu: mu, u: g.u, lp: g.lp || undefined, lr: g.lr || undefined };
  };
  // Dominios con 3 o más remitentes (sin los de correo personal) y listas con 2 o más.
  const junta = (clave, lista) => {
    const x = { n: 0, b: 0, l: 0, nc: 0, c: 0, ct: 0, bs: 0, rem: [], bj: {} };
    lista.forEach(f => { x.n += f.n; x.b += f.b; x.l += f.l; x.nc += f.nc; x.c += f.c; x.ct += f.ct; x.bs += f.bs; x.rem.push(f.r); x.bj[f.bj] = (x.bj[f.bj] || 0) + f.n; });
    return { k: clave, n: x.n, b: x.b, l: x.l, nc: x.nc, c: x.c, ct: x.ct, bs: x.bs, nr: lista.length, rem: x.rem.slice(0, 5), bj: mayor(x.bj) };
  };
  const filas = ks.map(fila);
  const porDom = {}, porLista = {};
  filas.forEach(f => {
    const d = dominio_(f.r);
    if (d && !COS.RX_GENERICO.test(d)) (porDom[d] = porDom[d] || []).push(f);
    if (f.li) (porLista[f.li] = porLista[f.li] || []).push(f);
  });
  const dominios = Object.keys(porDom).filter(d => porDom[d].length >= 3).map(d => junta(d, porDom[d])).sort((a, b) => b.n - a.n).slice(0, 30);
  const listas = Object.keys(porLista).filter(li => porLista[li].length >= 2).map(li => junta(li, porLista[li])).sort((a, b) => b.n - a.n).slice(0, 30);
  const dias = Object.keys(tr.dd || {}).map(Number).sort((a, b) => a - b);
  const conf = D === null ? dias : dias.filter(d => d > D);
  const abiertos = filas.reduce((s, f) => s + f.l, 0), llegadosConf = filas.reduce((s, f) => s + f.nc, 0);
  // Enviados de 90 días: a quién escribe la persona, con lo que ya leyó el análisis (sin lecturas nuevas a Gmail).
  const porRemitente = {};
  filas.forEach(f => { porRemitente[f.r] = f; });
  const dest = Object.keys(cont).filter(x => !/unsubscribe|bounce|=/.test(x)).sort((a, b) => cont[b] - cont[a] || ((envu || {})[b] || 0) - ((envu || {})[a] || 0)).slice(0, ANALISIS.DESTINATARIOS)
    .map(x => { const f = porRemitente[x]; return [x, cont[x], envu && envu[x] ? envu[x] : null, f ? f.n : 0, f ? f.ct : 0, f ? f.c1 : 0, f ? f.c24 : 0]; });
  const ev = { total: tr.n_env || 0, reenvios: tr.fw === undefined ? null : tr.fw, dest: dest,
    resp: { ct: filas.reduce((s, f) => s + (f.ct || 0), 0), c1: filas.reduce((s, f) => s + (f.c1 || 0), 0), c24: filas.reduce((s, f) => s + (f.c24 || 0), 0) } };
  return { v: 8, dias: tr.dias, error_filtros: errorFiltros, he: tr.he || null, hf: tr.hf || null, ev: ev, calculado: Date.now(), segundos: Math.round((Date.now() - tr.inicio) / 1000), pasos: tr.pasos, mensajes: total, remitentes: ks.length,
    abiertos: abiertos, leidos_politica: filas.reduce((s, f) => s + (f.lp || 0), 0), leidos_resumen: filas.reduce((s, f) => s + (f.lr || 0), 0), llegados_confiable: llegadosConf, enviados_90d: tr.n_env, fallidos: tr.fallidos || 0, cobertura_90: cobertura,
    mm: D === null ? null : diaTexto(D), pc: conf.length ? { desde: diaTexto(conf[0]), hasta: diaTexto(conf[conf.length - 1]), dias: conf.length } : null,
    resto: { remitentes: Math.max(0, ks.length - ANALISIS.MAX_GRUPOS), mensajes: ks.slice(ANALISIS.MAX_GRUPOS).reduce((s, k) => s + agg[k].n, 0) },
    grupos: filas.slice(0, ANALISIS.MAX_GRUPOS), dominios: dominios, listas: listas };
}

// El resultado completo vive en la caché (6 h); el almacén guarda los grupos de más volumen por si la caché se pierde.
function analisisGuardado_(st) {
  try { const c = cacheLeer_(ANALISIS.PREFIJO + 'res'); if (c) return JSON.parse(c); } catch (e) {}
  const a = st.get('analisis', null);
  return a && a.v === 8 ? a : null;
}

// Aperturas por hora local en 30 días, de las señales abrio (un marcado masivo no deja señal abrio).
function horasDeLectura_() {
  try {
    const desde = Date.now() - 30 * 86400000;
    const h = [];
    for (let i = 0; i < 24; i++) h.push(0);
    almacen_().get('senales', []).forEach(x => { if (x.tipo === 'abrio' && x.t >= desde) h[Number(Utilities.formatDate(new Date(x.t), tz_(), 'H'))]++; });
    const total = h.reduce((a, b) => a + b, 0);
    return { lecturas: total, por_hora: h.map((n, i) => ({ hora: i, lecturas: n })).filter(x => x.lecturas), nota: total ? undefined : 'Todavía no hay lecturas medidas: el motor las registra desde que corre.' };
  } catch (e) { return { error: 'No se pudieron contar ahora.' }; }
}

// La bandeja de hoy: si deja muchos leídos y por días, usa la bandeja como lista de pendientes y Bandeja limpia no se propone.
function bandejaHoy_() {
  try {
    const x = conReintento_(() => Gmail.Users.Labels.get('me', 'INBOX'));
    const viejos = conReintento_(() => Gmail.Users.Threads.list('me', { q: 'in:inbox is:read older_than:7d', maxResults: 500 }));
    const n7 = (viejos.threads || []).length;
    // Lo que llegó a Recibidos en 30 días, en hilos y con la misma consulta que simular (consultaLlegados_): lo que sigue
    // ahí, lo que la persona archivó sin etiqueta y lo que mandó a la papelera. Archivar seguido distingue a quien usa la
    // bandeja como pendientes de quien acumula.
    const filtros = filtrosQueSacan_(), sf = sinFiltros_(filtros);
    const contar = (q, papelera) => { let n = 0, pag = null, vueltas = 0;
      do { const r = conReintento_(() => Gmail.Users.Threads.list('me', { q: q, maxResults: 500, pageToken: pag || undefined, includeSpamTrash: !!papelera })); n += (r.threads || []).length; pag = r.nextPageToken; vueltas++; } while (pag && vueltas < 4);
      return { n: n, mas: !!pag }; };
    const lleg = contar(consultaLlegados_(30, filtros), true);
    const arch = contar('newer_than:30d -in:inbox -in:trash -in:spam -in:sent -in:drafts -in:chats has:nouserlabels' + sf, false);
    const borr = contar('newer_than:30d in:trash -in:sent -in:drafts -in:chats' + sf, true);
    return { hilos: x.threadsTotal || 0, sin_leer: x.threadsUnread || 0, leidos: Math.max(0, (x.threadsTotal || 0) - (x.threadsUnread || 0)),
      leidos_con_mas_de_7_dias: n7, hay_mas: !!viejos.nextPageToken || undefined,
      llegaron_a_tu_bandeja_30d: lleg.n, archivados_por_la_persona_30d: arch.n, borrados_por_la_persona_30d: borr.n, archivados_hay_mas: lleg.mas || arch.mas || borr.mas || undefined };
  } catch (e) { return { error: 'No pude contar la bandeja ahora: ' + String(e && e.message || e).slice(0, 120) }; }
}

// La respuesta: primero los campos generales (bandeja, filtros, etiquetas, horas de envío, enviados y totales) y al final
// los grupos, para que un corte del texto nunca se lleve lo general. Los grupos van por páginas (desde_grupo y maximo) y
// con corto la muestra de asuntos queda solo en los primeros grupos. Si aun así el texto pasa del tope, se quita la
// muestra desde la cola y, si hace falta, se cortan grupos; siguiente_desde_grupo dice cómo pedir los que siguen.
function formatoAnalisis_(res, maximo, op) {
  op = op || {};
  let filtrosVigentes = null;
  const filtroFila = g => {
    const fx = filtrosVigentes ? filtroQueToca_(filtrosVigentes, g.r, g.li) : (g.fi ? { id: g.fi, saca: !!g.fs, parcial: !!g.fp } : null);
    if (!fx) return { filtro: null };
    return { filtro: fx.id, filtro_lo_saca: fx.saca ? { filtro: fx.id, parcial: fx.parcial || undefined, en_bandeja: g.b, llegaron: g.n, lo_saca: !g.b,
      nota: g.b ? 'El filtro quita Recibidos, pero ' + g.b + ' de ' + g.n + ' siguen en la bandeja.' : undefined } : undefined };
  };
  const fila = g => ({ remitente: g.r, nombre: g.no, dominio: dominio_(g.r), llegaron: g.n, en_bandeja: g.b, abiertos: g.l, llegaron_periodo_confiable: g.nc,
    contestados: g.ct, contestados_en_24h: g.c24, contestados_en_1h: g.c1 === undefined ? undefined : g.c1, correos_que_le_envio_90d: g.c, estrella: g.e, borrados_sin_abrir: g.bs, borrados_abiertos: g.ba, archivados_sin_leer: g.as,
    leidos_por_politica: g.lp || undefined, leidos_por_resumen: g.lr || undefined, rescatados: g.rs, corresponsal: !!g.co, categoria_gmail: g.ca, list_id: g.li, baja: g.bj || 'ninguna', plataforma: g.pl, etiquetas: g.et, filtro: filtroFila(g).filtro, filtro_lo_saca: filtroFila(g).filtro_lo_saca, semanas: g.sm === undefined ? undefined : g.sm,
    muestra: (g.mu || []).map(x => ({ id_hilo: x[0], asunto: x[1], abrio: x[2] === null ? 'antes del marcado masivo' : !!x[2], contesto: !!x[3] })),
    ultimo: g.u ? fecha_(g.u) : undefined });
  const junta = x => ({ grupo: x.k, remitentes: x.nr, llegaron: x.n, en_bandeja: x.b, abiertos: x.l, llegaron_periodo_confiable: x.nc, contestados: x.ct,
    borrados_sin_abrir: x.bs, baja: x.bj || 'ninguna', ejemplos_de_remitentes: x.rem });
  const horas = l => l ? l.map((n, h) => ({ hora: h, envios: n })).filter(x => x.envios) : undefined;
  const pct = res.llegados_confiable ? Math.round(100 * res.abiertos / res.llegados_confiable) : 0;
  // Lo general (unos 29,000 caracteres) va solo en la primera página; las que siguen traen solo grupos, salvo solo_grupos:
  // false. La web app recibe siempre todo.
  const soloGrupos = VIA !== 'webapp' && (op.solo_grupos === true || (op.solo_grupos !== false && Number(op.desde_grupo) > 1));
  let gm;
  try { gm = verFiltros_(); } catch (e) { gm = { error: 'No pude leer los filtros y etiquetas de Gmail: ' + String(e && e.message || e).slice(0, 200) }; }
  // El filtro de cada grupo se empareja con los filtros vigentes; sin ellos, queda el que se guardó al calcular.
  filtrosVigentes = gm.filtros ? gm.filtros.map(f => filtroParaEmparejar_(f.id, f.criterio || {}, (f.quita || []).indexOf('Recibidos') >= 0)) : null;
  const ev = res.ev;
  const general = soloGrupos ? { estado: 'listo', dias: res.dias, calculado: fecha_(res.calculado), hace: antiguedad_(res.calculado), solo_grupos: true,
    nota: 'Página solo con grupos: lo general (bandeja de hoy, filtros, etiquetas, horas, enviados y totales) va en la primera página o con solo_grupos: false.',
    como_leer: 'Los campos de cada grupo son los de la primera página. filtro_lo_saca: el filtro de Gmail que lo saca de Recibidos y si de verdad lo saca (comparado con en_bandeja).' } : {
    estado: 'listo', dias: res.dias, calculado: fecha_(res.calculado), hace: antiguedad_(res.calculado), segundos_de_calculo: res.segundos,
    resumen: res.mensajes + ' correos de ' + res.remitentes + ' remitentes en ' + res.dias + ' días; abrió el ' + pct + '%' + (res.mm ? ' desde el ' + res.mm + ' (antes hubo un marcado masivo como leído)' : '') +
      '. Los ' + res.cobertura_90 + ' remitentes de más volumen suman el 90%.',
    bandeja_hoy: bandejaHoy_(),
    filtros_gmail: gm.filtros || [], etiquetas_gmail: gm.etiquetas || [], error_filtros: gm.error || res.error_filtros || undefined,
    horas_de_envio_30d: horas(res.he),
    // Las dos listas por tipo de día; horas_de_envio_30d sigue siendo la suma de las dos.
    horas_de_envio_30d_entre_semana: res.he && res.hf ? horas(res.he.map((n, h) => n - (res.hf[h] || 0))) : undefined,
    horas_de_envio_30d_fin_de_semana: res.he && res.hf ? horas(res.hf) : undefined,
    horas_de_lectura_30d: horasDeLectura_(),
    enviados_90_dias: res.enviados_90d,
    enviados_90d: ev ? { total: ev.total, reenvios: ev.reenvios === null ? undefined : ev.reenvios,
      destinatarios: ev.dest.map(x => ({ correo: x[0], correos: x[1], ultimo: x[2] ? fecha_(x[2] * 60000) : undefined, le_escribio_en_el_periodo: x[3], contestados: x[4], contestados_en_1h: x[5], contestados_en_24h: x[6] })),
      respuesta_en_el_periodo: { contestados: ev.resp.ct, en_menos_de_1_hora: ev.resp.c1, en_menos_de_24_horas: ev.resp.c24 } }
      : { nota: 'Este análisis se calculó antes del resumen de enviados: pide analizar_bandeja con refrescar: true.' },
    total: res.mensajes, remitentes: res.remitentes, grupos_que_suman_90: res.cobertura_90,
    leidos_por_el_sistema: { por_politica: res.leidos_politica || 0, por_resumen: res.leidos_resumen || 0 },
    fecha_marcado_masivo: res.mm || null, periodo_confiable_para_abiertos: res.pc || null, no_leidos_por_cuota: res.fallidos || undefined,
    dominios: (res.dominios || []).slice(0, 15).map(junta), listas: (res.listas || []).slice(0, 15).map(junta),
    como_leer: 'Primero lo general y al final los grupos. llegaron: recibidos (incluye archivados y papelera). abiertos: sin marca de no leído, solo en el periodo confiable; lo que marcó leído una política o un resumen va en leidos_por_politica y leidos_por_resumen, nunca en abiertos. contestados: correos de ese remitente que la persona contestó en el hilo (contestados_en_1h y contestados_en_24h: en menos de una hora o de un día); correos_que_le_envio_90d: los que la persona le mandó. corresponsal: le escribió en 90 días. baja: la del correo más reciente, que es la que usaría desuscribir: un_clic (se puede dar de baja), solo_correo (daría de baja enviando un correo: no se usa) o ninguna. filtro: el id del filtro de Gmail que toca a ese remitente, con la semántica de from: de Gmail (dirección exacta, @dominio o una palabra de la dirección). filtro_lo_saca: si ese filtro quita Recibidos, cuánto sigue en la bandeja; con en_bandeja mayor que 0 no los saca a todos, y parcial dice que el filtro pide algo más que el remitente. dominios: 3 o más remitentes; listas: un List-Id con 2 o más. filtros_gmail y etiquetas_gmail: lo que la persona ya le enseñó a Gmail; no los dupliques ni los contradigas. semanas: en cuántas de las últimas 4 semanas llegó algo. horas_de_envio_30d: a qué hora local envía y contesta la persona; las dos listas van aparte en horas_de_envio_30d_entre_semana y horas_de_envio_30d_fin_de_semana. horas_de_lectura_30d: a qué hora abre, medido por el motor con sus señales (precisión de 10 minutos, sin marcados masivos); Gmail no guarda la hora en que se abre un correo, así que antes de que el motor corra no hay dato. enviados_90d: los enviados de 90 días, cuántos son reenvíos (Fwd, RV) y los 15 destinatarios principales con sus correos y la fecha del último; los contestados de cada uno y respuesta_en_el_periodo cuentan solo lo recibido en los días del análisis. grupos: por páginas con desde_grupo y maximo; siguiente_desde_grupo es el valor para pedir los que siguen. sin_muestra_desde_grupo: desde ese grupo no va la muestra de asuntos (por corto o por el tope de tamaño). Este análisis no decide: lo que harían las políticas lo dice simular.'
  };
  // Grupos de la página, con la muestra según corto y el tope de tamaño.
  const enTotal = res.grupos.length;
  const desde = Math.min(Math.max(1, Math.round(Number(op.desde_grupo) || 1)), Math.max(1, enTotal));
  const lista = res.grupos.slice(desde - 1, desde - 1 + maximo).map(fila);
  let sinMuestra = null;
  if (op.corto) lista.forEach((g, i) => { if (desde - 1 + i >= ANALISIS.MUESTRA_CABEZA) { delete g.muestra; if (sinMuestra === null) sinMuestra = desde + i; } });
  const largo = lista.map(g => JSON.stringify(g).length + 1);
  const pagina = n => ({ grupos_en_total: enTotal + res.resto.remitentes, grupos_desde: n ? desde : undefined, grupos_hasta: n ? desde + n - 1 : undefined,
    grupos_omitidos: Math.max(0, enTotal - n) + res.resto.remitentes, siguiente_desde_grupo: desde - 1 + n < enTotal ? desde + n : null,
    sin_muestra_desde_grupo: sinMuestra || undefined, recortado_por_tamano: undefined });
  // Lo fijo se mide con un recorte de 200 caracteres de reserva para el aviso.
  const fijo = JSON.stringify(Object.assign({}, general, pagina(lista.length), { recortado_por_tamano: 'x'.repeat(200), grupos: [] })).length;
  const total = n => fijo + largo.slice(0, n).reduce((a, b) => a + b, 0);
  let n = lista.length, recorte = false;
  const tope = VIA === 'webapp' ? Infinity : ANALISIS.TOPE_TEXTO;
  for (let k = n - 1; k >= 0 && total(n) > tope; k--) {
    if (!lista[k].muestra) continue;
    delete lista[k].muestra;
    largo[k] = JSON.stringify(lista[k]).length + 1;
    sinMuestra = Math.min(sinMuestra || Infinity, desde + k);
    recorte = true;
  }
  while (n > 0 && total(n) > tope) { n--; recorte = true; }
  const pag = pagina(n);
  // La copia del almacén guarda solo los primeros grupos; los demás piden recalcular.
  if (res.recortado && !pag.siguiente_desde_grupo) pag.grupos_sin_guardar = 'Esta copia guarda los primeros ' + enTotal + ' grupos. Para ver los que siguen, llama con refrescar: true.';
  if (recorte) pag.recortado_por_tamano = 'Para que la respuesta quepa, ' + (pag.sin_muestra_desde_grupo ? 'desde el grupo ' + pag.sin_muestra_desde_grupo + ' va sin muestra de asuntos' : '') +
    (n < lista.length ? (pag.sin_muestra_desde_grupo ? ' y ' : '') + 'traje ' + n + ' de los ' + lista.length + ' grupos pedidos' : '') +
    (pag.siguiente_desde_grupo ? '. Los que siguen: desde_grupo ' + pag.siguiente_desde_grupo : '') + '.';
  return Object.assign(general, pag, { grupos: lista.slice(0, n) });
}

// Si un filtro de Gmail toca a un remitente, con la semántica de from: de Gmail: una dirección completa empareja solo esa
// dirección; @dominio o dominio, ese dominio y sus subdominios; una palabra suelta, una palabra de la dirección. Antes se
// emparejaba por subcadena del dominio: un filtro de alerts@google.com tocaba a noreply@google.com y x.com caía en banamex.com.
function terminosFrom_(s) {
  return String(s || '').toLowerCase().replace(/["()]/g, ' ').split(/\s+or\s+|[\s|{},]+/).filter(t => t && t !== 'or' && t[0] !== '-');
}
function cumpleFrom_(r, t) {
  r = String(r || '').toLowerCase();
  const d = r.split('@')[1] || '';
  t = t.replace(/^\*@/, '@');
  if (t.indexOf('@') > 0) return r === t;
  if (t[0] === '@') t = t.slice(1);
  if (t.indexOf('.') >= 0) return d === t || d.slice(-(t.length + 1)) === '.' + t;
  return r.split(/[^a-z0-9]+/).indexOf(t) >= 0;
}
const OPERADOR_FROM_LIST_ = /(^|[\s(])(from|list):(\([^)]*\)|\{[^}]*\}|"[^"]*"|\S+)/g;
// criterio de Gmail (from, query, subject, to…) y si quita Recibidos.
function filtroParaEmparejar_(id, c, saca) {
  return { id: id, from: String(c.from || '').toLowerCase(), query: String(c.query || '').toLowerCase(), saca: !!saca,
    otros: !!(c.subject || c.to || c.negatedQuery || c.hasAttachment || c.size) };
}
// El primer filtro que toca a r (por from: o por list:), con preferencia por el que lo saca de Recibidos: {id, saca, parcial}.
// parcial: el filtro pide algo más que el remitente (asunto, otra consulta, tamaño), así que toca solo una parte.
function filtroQueToca_(filtros, r, li) {
  const toca = f => {
    const deQ = [], listas = [];
    f.query.replace(OPERADOR_FROM_LIST_, (_, a, op, x) => { (op === 'from' ? deQ : listas).push(x.replace(/[(){}"]/g, ' ')); return ''; });
    if (terminosFrom_(f.from + ' ' + deQ.join(' ')).some(t => cumpleFrom_(r, t))) return true;
    return !!li && terminosFrom_(listas.join(' ')).some(t => t === String(li).toLowerCase());
  };
  const l = (filtros || []).filter(toca);
  const f = l.filter(x => x.saca)[0] || l[0];
  if (!f) return null;
  const resto = f.query.replace(OPERADOR_FROM_LIST_, ' ').replace(/\bor\b/g, ' ').trim();
  return { id: f.id, saca: f.saca, parcial: !!(f.otros || resto) };
}

// Filtros y etiquetas que la persona ya tiene. Cambian poco: se guardan 10 minutos en la caché.
function verFiltros_() {
  const cache = CacheService.getScriptCache();
  try { const c = cache.get('cos3_filtros'); if (c) return JSON.parse(c); } catch (e) {}
  const nombres = nombresEtiquetas_();
  const propias = Object.keys(nombres).filter(id => /^Label_/.test(id));
  const datos = gmailFetchAll_(['settings/filters'].concat(propias.map(id => 'labels/' + id + '?fields=id,name,threadsTotal,messagesTotal,messagesUnread')), 20);
  const nom = l => l === 'INBOX' ? 'Recibidos' : l === 'UNREAD' ? 'No leído' : l === 'TRASH' ? 'Papelera' : l === 'IMPORTANT' ? 'Importante' : l === 'STARRED' ? 'Destacado' : l === 'SPAM' ? 'Spam' : (nombres[l] || l);
  const filtros = datos[0] ? (datos[0].filter || []).map(f => {
    const c = f.criteria || {}, a = f.action || {};
    const crit = {};
    ['from', 'to', 'subject', 'query', 'negatedQuery', 'hasAttachment', 'excludeChats', 'size', 'sizeComparison'].forEach(k => { if (c[k] !== undefined) crit[k] = c[k]; });
    const add = a.addLabelIds || [], quita = a.removeLabelIds || [];
    return { id: f.id, criterio: crit, agrega: add.map(nom), quita: quita.map(nom), reenvia: a.forward || undefined,
      en_palabras: (crit.from ? 'De ' + crit.from : crit.query ? 'Lo que coincide con «' + crit.query + '»' : 'Correos que coinciden') +
        (quita.indexOf('INBOX') >= 0 ? ': salen de Recibidos' : '') + (add.filter(l => /^Label_/.test(l)).length ? ' a ' + add.filter(l => /^Label_/.test(l)).map(nom).join(', ') : '') +
        (quita.indexOf('UNREAD') >= 0 ? ', leídos' : '') + (add.indexOf('TRASH') >= 0 ? ', a la papelera' : '') + '.' };
  }) : null;
  const etiquetas = propias.map((id, k) => { const x = datos[k + 1]; return x ? { id: id, nombre: x.name, hilos: x.threadsTotal, mensajes: x.messagesTotal, sin_leer: x.messagesUnread,
    del_chief_of_staff: esEtiquetaCos_(x.name) || undefined } : { id: id, nombre: nombres[id] }; }).sort((a, b) => (b.hilos || 0) - (a.hilos || 0));
  const r = { filtros: filtros || [], etiquetas: etiquetas, error: filtros ? undefined : 'Gmail no dejó leer los filtros con los permisos actuales.' };
  if (filtros) { try { cache.put('cos3_filtros', JSON.stringify(r), 600); } catch (e) {} }
  return r;
}

function progresoAnalisis_(tr, nota) {
  const tot = (tr.n_rec || 0) + (tr.n_env || 0);
  const hechos = (tr.hechos_rec || 0) + (tr.hechos_env || 0);
  const pct = tot ? Math.round(100 * hechos / tot) : 0;
  const ritmo = tr.actualizado > tr.inicio && hechos ? (tr.actualizado - tr.inicio) / hechos : 0;
  return { estado: tr.fase === 'error' ? 'error' : 'en_proceso', dias: tr.dias, fase: tr.fase, avance: pct + '%', correos_leidos: hechos, correos_por_leer: tot - hechos,
    empezo: fecha_(tr.inicio), minutos_restantes_aprox: ritmo ? Math.max(1, Math.round((tot - hechos) * ritmo / 60000)) : undefined, error: tr.error,
    nota: nota || 'Sigo leyendo en segundo plano. Vuelve a llamar analizar_bandeja en uno o dos minutos.' };
}

function programarPaso_() {
  if (ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'analisisPaso')) return;
  ScriptApp.newTrigger('analisisPaso').timeBased().after(60 * 1000).create();
}
function quitarPasos_() {
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'analisisPaso') ScriptApp.deleteTrigger(t); });
}

// Lo llama la herramienta. Responde en menos de unos 25 s: avanza 15 s y devuelve el avance o el resultado.
function analizarBandeja_(dias, maximo, refrescar, op) {
  const st = almacen_();
  const res = analisisGuardado_(st);
  let tr = trabajoAnalisis_();
  const activo = t => t && ['listar', 'enviados', 'recibidos', 'final'].indexOf(t.fase) >= 0;
  // Un recálculo de los mismos días que empezó después del resultado guardado manda sobre ese resultado.
  const recalculando = activo(tr) && tr.dias === dias && (!res || tr.inicio > res.calculado);
  if (res && res.dias === dias && !refrescar && !recalculando && Date.now() - res.calculado < ANALISIS.VIGENCIA_MS) return formatoAnalisis_(res, maximo, op);
  const turno = tomarTurno_(40);
  if (!turno) {
    if (activo(tr) && tr.dias === dias) return progresoAnalisis_(tr, 'El cálculo avanza en segundo plano. Vuelve a llamar en un minuto.');
    return progresoAnalisis_(tr || { fase: 'listar', dias: dias, inicio: Date.now() }, 'Hay otro cálculo en curso. Vuelve a llamar en un minuto.');
  }
  try {
    tr = trabajoAnalisis_();
    if (!(activo(tr) && tr.dias === dias && !refrescar)) {
      tr = { id: Date.now().toString(36), dias: dias, fase: 'listar', inicio: Date.now(), pasos: 0 };
      guardarTrabajo_(tr);
    }
    tr.pasos = (tr.pasos || 0) + 1;
    tr = avanzarAnalisis_(tr, ANALISIS.PRESUPUESTO_LLAMADA_MS, ANALISIS.TANDA_LLAMADA);
    if (tr.fase === 'listo') { quitarPasos_(); return formatoAnalisis_(analisisGuardado_(almacen_()), maximo, op); }
    if (tr.fase === 'error') return progresoAnalisis_(tr);
    programarPaso_();
    return progresoAnalisis_(tr);
  } finally {
    soltarTurno_(turno);
  }
}

// Activador de un minuto: sigue el trabajo hasta 4.5 min y, si falta, se vuelve a programar.
// Cualquier error lo reprograma (hasta 5) y queda anotado en el trabajo; la siguiente llamada también lo retoma.
function analisisPaso() {
  const t0 = Date.now();
  try { analisisPasoActivador_(); } finally { anotarTiempo_(t0); }
}
function analisisPasoActivador_() {
  const activo = t => t && ['listar', 'enviados', 'recibidos', 'final'].indexOf(t.fase) >= 0;
  let turno = null;
  try {
    quitarPasos_();
    turno = tomarTurno_(320);
    if (!turno) { programarPaso_(); return; }
    let tr = trabajoAnalisis_();
    if (!activo(tr)) return;
    tr.pasos = (tr.pasos || 0) + 1;
    tr.ultimo_paso = Date.now();
    tr = avanzarAnalisis_(tr, ANALISIS.PRESUPUESTO_ACTIVADOR_MS, ANALISIS.TANDA_ACTIVADOR);
    if (activo(tr)) programarPaso_();
  } catch (err) {
    const tr = trabajoAnalisis_();
    // Con el tope diario de Google no se reprograma: cada intento fallaría y gastaría el tiempo de activadores del día.
    // La siguiente llamada a analizar_bandeja retoma el trabajo donde quedó.
    if (esLimiteDiario_(err)) {
      try { conCandado_(st => anotarLimiteDiario_(st, 'analizar_bandeja'), 5000); } catch (e) {}
      if (activo(tr)) { tr.ultimo_error = 'limite_diario: Google limitó por hoy las lecturas; sigue al volver a llamar analizar_bandeja.'; guardarTrabajo_(tr); }
      return;
    }
    if (activo(tr)) {
      tr.errores = (tr.errores || 0) + 1;
      tr.ultimo_error = String(err && err.message || err).slice(0, 300);
      guardarTrabajo_(tr);
      if (tr.errores < 5) { try { programarPaso_(); } catch (e) {} } else falloAnalisis_(tr, tr.ultimo_error);
    }
  } finally {
    if (turno) soltarTurno_(turno);
  }
}

