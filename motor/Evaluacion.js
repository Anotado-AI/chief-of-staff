// --- Simular, aplicar y exportar por hilo ---
// simular y exportar_evaluacion son de solo lectura; aplicar mueve con las políticas activas y deja todo en
// Actividad con deshacer. Páginas de 200 hilos, leídas a la mitad de la cuota de Gmail (un hilo cuesta 10
// unidades), para que las demás herramientas sigan respondiendo.

const EVALUACION = {
  PAGINA: 200,
  LOTE: 25,
  MS_POR_LOTE: 1600,
  LOTE_HILOS: 10,
  MS_POR_LOTE_HILOS: 800,
  // Una llamada de Claude a un conector puede cortarse antes de 30 segundos: la lectura de Gmail para a los 14 y sigue con siguiente.
  PRESUPUESTO_MS: 14000,
  CACHE_SIM: 'cos3s.'
};

// Un hilo completo cuesta 10 unidades de cuota y uno de sus mensajes 5. Se lee el último mensaje de cada
// hilo y el hilo completo solo si tiene varios mensajes en la búsqueda o un envío de la persona.
function leerPaginaHilos_(ids, q, qEnviados, conPapelera, t0) {
  const token = ScriptApp.getOAuthToken();
  const quiero = {};
  ids.forEach(id => { quiero[id] = 1; });
  const listar = (consulta, max, papelera, fn) => {
    let pag = null, vueltas = 0;
    do {
      const url = 'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=500&fields=messages(id,threadId),nextPageToken&q=' + encodeURIComponent(consulta) +
        (papelera ? '&includeSpamTrash=true' : '') + (pag ? '&pageToken=' + encodeURIComponent(pag) : '');
      const r = gmailGet_(url, token);
      if (r.getResponseCode() !== 200) break;
      const j = JSON.parse(r.getContentText());
      (j.messages || []).forEach(fn);
      pag = j.nextPageToken;
      vueltas++;
    } while (pag && vueltas < max && Date.now() - t0 < EVALUACION.PRESUPUESTO_MS / 3);
  };
  const ultimo = {}, cuenta = {};
  listar(q, 12, conPapelera, m => { if (!quiero[m.threadId]) return; cuenta[m.threadId] = (cuenta[m.threadId] || 0) + 1; if (!ultimo[m.threadId]) ultimo[m.threadId] = m.id; });
  const conEnvio = {};
  if (qEnviados) listar(qEnviados, 4, false, m => { if (quiero[m.threadId]) conEnvio[m.threadId] = 1; });
  const qs = ENCABEZADOS.map(h => 'metadataHeaders=' + encodeURIComponent(h)).join('&');
  const completos = ids.filter(id => !ultimo[id] || cuenta[id] > 1 || conEnvio[id]);
  const sueltos = ids.filter(id => completos.indexOf(id) < 0);
  const salida = {};
  const pausado = (lista, ruta, lote, ms, guardar) => {
    for (let i = 0; i < lista.length; i += lote) {
      if (Date.now() - t0 > EVALUACION.PRESUPUESTO_MS) break;
      cederPaso_();
      const t = Date.now();
      const parte = lista.slice(i, i + lote);
      gmailFetchAll_(parte.map(ruta), lote).forEach((x, k) => { if (x) guardar(parte[k], x); });
      const espera = ms - (Date.now() - t);
      if (espera > 0 && i + lote < lista.length) Utilities.sleep(espera);
    }
  };
  pausado(sueltos, id => 'messages/' + ultimo[id] + '?format=metadata&' + qs + '&fields=' + encodeURIComponent('id,threadId,labelIds,snippet,internalDate,payload/headers'),
    EVALUACION.LOTE, EVALUACION.MS_POR_LOTE, (id, m) => { salida[id] = { id: id, messages: [m] }; });
  pausado(completos, id => 'threads/' + id + '?format=metadata&' + qs + '&fields=' + encodeURIComponent('id,messages(id,threadId,labelIds,snippet,internalDate,payload/headers)'),
    EVALUACION.LOTE_HILOS, EVALUACION.MS_POR_LOTE_HILOS, (id, t) => { salida[id] = t; });
  return ids.map(id => salida[id]);
}

function listaHilosPagina_(q, pagina, maximo, conPapelera) {
  const url = 'https://gmail.googleapis.com/gmail/v1/users/me/threads?maxResults=' + maximo + '&fields=threads/id,nextPageToken,resultSizeEstimate&q=' + encodeURIComponent(q) +
    (conPapelera ? '&includeSpamTrash=true' : '') + (pagina ? '&pageToken=' + encodeURIComponent(pagina) : '');
  const r = gmailGet_(url);
  if (r.getResponseCode() === 400 && pagina) throw new Error('La página ' + pagina + ' ya no vale. Empieza otra vez sin pagina.');
  if (r.getResponseCode() === 403 || r.getResponseCode() === 429) throw new Error('Gmail limitó la velocidad por la cuota de un minuto. Vuelve a llamar en un minuto con la misma página.');
  if (r.getResponseCode() !== 200) throw new Error('threads.list respondió ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 200));
  const j = JSON.parse(r.getContentText());
  return { ids: (j.threads || []).map(x => x.id), siguiente: j.nextPageToken || null, estimado: j.resultSizeEstimate };
}

// ---------- Qué políticas cuentan ----------
// politicas: ids (en cualquier estado salvo retirada; el nivel no importa). lote: las políticas vivas más lo que
// cambiarían las propuestas abiertas de ese lote con su opción recomendada, sin guardar nada. Sin nada: las vivas.
function contextoEvaluacion_(st, op, t0) {
  op = op || {};
  let ctx;
  if (op.politicas && op.politicas.length) {
    op.politicas.forEach(id => politica_(st, id));
    ctx = contextoPoliticas_(st, { solo: op.politicas });
    if (!ctx.politicas.length) throw new Error('Esas políticas no tienen condiciones compiladas todavía: guárdalas con guardar_politica antes de simular.');
  } else if (op.lote) {
    ctx = contextoPoliticas_(st);
    const v = politicasDelLote_(st, op.lote);
    ctx.politicas = v.politicas;
    ctx.lote = { lote: op.lote, propuestas: v.propuestas, sin_efecto: v.sin_efecto };
    ctx.origen = v.origen;
    ctx.grupos = v.grupos;
  } else ctx = contextoPoliticas_(st);
  ctx.t0 = t0;
  ctx.nombres = nombresEtiquetas_();
  // Lo que ya estaba en el buzón lo vio el análisis de instalación: sus remitentes cuentan como conocidos.
  const yo = yo_();
  const corr = corresponsalesCache_(st, yo, t0, false).mapa;
  const conocidos = Object.assign({}, ctx.conocidos);
  Object.keys(corr || {}).forEach(x => { conocidos[x] = 1; });
  const an = analisisGuardado_(st);
  ((an && an.grupos) || []).forEach(g => { if (g.r) conocidos[g.r] = 1; });
  ctx.conocidos = conocidos;
  ctx.mm = an && an.mm ? Date.parse(an.mm + 'T23:59:59' + Utilities.formatDate(new Date(), tz_(), 'XXX')) : null;
  return ctx;
}

function politicasDelLote_(st, lote) {
  const lista = JSON.parse(JSON.stringify(listaPoliticas_(st)));
  const props = listaPropuestas_(st).filter(p => p.lote === lote && p.estado === 'abierta');
  const origen = {};
  let sin = 0;
  props.forEach(p => {
    const rec = recomendadaSegura_(p), o = p.opciones.filter(x => x.etiqueta === rec)[0] || p.opciones[0];
    const efs = o ? aplanarEfecto_(o.efecto) : [];
    if (!efs.length) { sin++; return; }
    efs.forEach(ef => {
      if (ef.nivel) {
        const pol = lista.filter(x => x.id === ef.nivel.politica)[0];
        if (pol) { pol.nivel = ef.nivel.nivel; pol.estado = 'activa'; pol.aprobada = Date.now(); origen[pol.id] = p.id; }
        return;
      }
      if (!ef.politica) return;
      const d = ef.politica;
      let pol = d.id ? lista.filter(x => x.id === d.id)[0] : null;
      if (!pol) { pol = { id: 'nueva:' + p.id, nombre: corto_(d.nombre || d.texto, 60), texto: d.texto, nivel: 'propone', estado: 'activa', compilado: { condiciones: [], excepciones: [] }, acciones: [] }; lista.push(pol); }
      if (d.compilado) pol.compilado = normalizarCompilado_(st, d.compilado);
      const suma = (l, x) => { const y = l.filter(z => z.campo === x.campo)[0]; if (y) x.valores.forEach(v => { if (y.valores.indexOf(v) < 0) y.valores.push(v); }); else l.push({ campo: x.campo, valores: x.valores.slice() }); };
      if (d.agregar) { const a = normalizarCompilado_(st, d.agregar); a.condiciones.forEach(x => suma(pol.compilado.condiciones, x)); a.excepciones.forEach(x => suma(pol.compilado.excepciones, x)); }
      if (d.quitar) {
        const q = normalizarCompilado_(st, d.quitar);
        q.condiciones.forEach(x => { const y = pol.compilado.condiciones.filter(z => z.campo === x.campo)[0]; if (y) y.valores = y.valores.filter(v => x.valores.indexOf(v) < 0); });
        pol.compilado.condiciones = pol.compilado.condiciones.filter(x => x.valores.length);
      }
      if (d.acciones) pol.acciones = normalizarAcciones_(d.acciones);
      // Qué propuesta mandó cada condición: con ese id, «Que se quede» contesta a la propuesta correcta.
      origen[pol.id] = p.id;
      [d.compilado, d.agregar].forEach(x => { if (x && x.condiciones) x.condiciones.forEach(c => (c.valores || []).forEach(v => { origen[pol.id + '|' + c.campo + '|' + String(v).toLowerCase()] = p.id; })); });
      pol.nivel = d.nivel || (pol.nivel === 'apagado' ? 'propone' : pol.nivel);
      pol.estado = d.estado === 'pausada' || d.estado === 'retirada' ? d.estado : 'activa';
      pol.aprobada = Date.now();
    });
  });
  // Las ya contestadas (antes de aplicar el plan) ya están en las políticas: solo se agrega su vínculo, para que «Que se
  // quede» conteste a la propuesta correcta. Las abiertas mandan si las dos apuntan a lo mismo.
  listaPropuestas_(st).filter(p => p.lote === lote && (p.estado === 'aceptada' || p.estado === 'corregida') && !p.aplicada && p.respuesta).forEach(p => {
    const o = p.opciones.filter(x => x.etiqueta === p.respuesta.opcion)[0];
    const efs = o ? aplanarEfecto_(o.efecto) : [];
    efs.forEach(ef => {
      if (ef.nivel) { if (!origen[ef.nivel.politica]) origen[ef.nivel.politica] = p.id; return; }
      if (!ef.politica) return;
      const d = ef.politica;
      (d.id ? [d.id] : (p.politicas_tocadas || [])).forEach(pid => {
        if (!origen[pid]) origen[pid] = p.id;
        [d.compilado, d.agregar].forEach(x => { if (x && x.condiciones) x.condiciones.forEach(c => (c.valores || []).forEach(v => { const k = pid + '|' + c.campo + '|' + String(v).toLowerCase(); if (!origen[k]) origen[k] = p.id; })); });
      });
    });
  });
  // El destino de un grupo va en su propuesta grupo:<remitente o dominio>, aunque su opción recomendada no traiga efecto
  // (el remitente ya está en la compilación de su política): «Que se quede» contesta esa propuesta, no la de la política.
  const grupos = {};
  listaPropuestas_(st).filter(p => p.lote === lote && /^grupo:/i.test(String(p.objeto || '')) && !p.aplicada && ['abierta', 'aceptada', 'corregida', 'rechazada'].indexOf(p.estado) >= 0)
    .forEach(p => { grupos[String(p.objeto).slice(6).trim().toLowerCase()] = p.id; });
  return { politicas: lista.filter(politicaViva_), propuestas: props.length, sin_efecto: sin, origen: origen, grupos: grupos };
}
// La propuesta grupo: de un remitente: por su dirección, por su dominio o por un dominio padre (sears.com para mail.sears.com).
function grupoDe_(grupos, f) {
  if (!grupos) return undefined;
  const de = String(f.de || '').toLowerCase(), dom = String(f.dominio || '').toLowerCase();
  if (grupos[de]) return grupos[de];
  for (let d = dom; d && d.indexOf('.') > 0; d = d.slice(d.indexOf('.') + 1)) if (grupos[d]) return grupos[d];
  return undefined;
}

// La decisión para un hilo: la de su último mensaje recibido. Un hilo donde la persona escribió es conversación.
function decisionHilo_(t, ctx) {
  const ms = sinBorradores_(t.messages);
  const recibidos = ms.filter(m => !tiene_(m, 'SENT'));
  if (!recibidos.length) return { ms: ms, m: null, dec: { accion: 'queda', acciones: [], motivo: 'solo mensajes de la persona', avisos: [] } };
  const m = metadatoDe_(recibidos[recibidos.length - 1]);
  if (ms.some(x => tiene_(x, 'SENT'))) ctx.conversaciones[t.id] = 1;
  const dec = decidirMensaje_(m, ctx);
  const abierto = recibidos.every(x => !tiene_(x, 'UNREAD'));
  const abrio = ctx.mm && Number(m.internalDate) <= ctx.mm && abierto ? null : abierto;
  return { ms: ms, m: m, dec: dec, abrio: abrio };
}

// Lo que llegó a Recibidos en N días, en hilos: lo que sigue ahí, lo que la persona archivó sin ponerle etiqueta y lo que
// mandó a la papelera. No entra lo que un filtro suyo saca de Recibidos, spam, enviados, borradores ni chats. simular
// (resumen.antes) y analizar_bandeja (bandeja_hoy.llegaron_a_tu_bandeja_30d) cuentan con esta misma consulta.
function filtrosQueSacan_() {
  try { return ((Gmail.Users.Settings.Filters.list('me') || {}).filter || []).filter(f => f.action && (f.action.removeLabelIds || []).indexOf('INBOX') >= 0 && f.criteria && f.criteria.from).map(f => f.criteria.from).slice(0, 20); } catch (e) { return []; }
}
function sinFiltros_(filtros) { return (filtros || []).map(f => ' -from:(' + String(f).replace(/[(){}]/g, ' ') + ')').join(''); }
function consultaLlegados_(dias, filtros) { return 'newer_than:' + dias + 'd -in:spam -in:sent -in:drafts -in:chats {in:inbox in:trash has:nouserlabels}' + sinFiltros_(filtros); }

// «Abrió» por hilo no distingue cuando casi nada está sin leer en Recibidos (menos de 2%): entonces se mide por remitente,
// con sus aperturas del periodo confiable de analizar_bandeja (aperturas_30d). Abrió si abre la mitad o más de lo suyo.
const ABRIO = { SIN_LEER_MIN: 0.02, MIN_HILOS: 50, TASA: 0.5 };
function abrioPorRemitente_(st) {
  if (!Object.keys(st.get('aperturas_30d', {}) || {}).length) return false;
  try { const x = conReintento_(() => Gmail.Users.Labels.get('me', 'INBOX')); return (x.threadsTotal || 0) >= ABRIO.MIN_HILOS && (x.threadsUnread || 0) < ABRIO.SIN_LEER_MIN * x.threadsTotal; } catch (e) { return false; }
}

function saleDeBandeja_(acciones) { return acciones.some(a => /^carpeta:/.test(a) || a === 'papelera' || a === 'spam'); }

// ---------- simular(politicas o lote, dias, pagina) ----------
// El resumen se acumula entre páginas: la página que trae siguiente=null cierra la cuenta del periodo. Un hilo que Gmail
// no dejó leer (429 o falta de tiempo) se guarda y se lee otra vez en la página siguiente; terminadas las páginas, una
// página más solo con los que faltan. Completo es haber leído todos, no solo haber terminado las páginas. aplicar hace lo
// mismo con los hilos que no pudo leer.
const INTENTOS_LECTURA = 3;
function simular_(st, op) {
  const t0 = Date.now();
  const dias = op.dias;
  let simId = null, token = null;
  if (op.pagina) { const x = String(op.pagina).split('|'); simId = x[0]; token = x[1] || null; }
  const cache = CacheService.getScriptCache();
  let acum = null;
  if (simId) { try { acum = JSON.parse(cache.get(EVALUACION.CACHE_SIM + simId) || 'null'); } catch (e) {} }
  if (simId && !acum) throw new Error('La simulación ' + simId + ' venció (dura 6 horas). Empieza otra vez sin pagina.');
  if (!simId) { simId = Utilities.getUuid().slice(0, 8); acum = { antes: 0, despues: 0, salen: 0, abiertos_que_salen: 0, espera_a_opus: 0, propone: 0, sensibles: 0, por_politica: {}, por_decision: {}, paginas: 0 }; }
  acum.faltan = acum.faltan || {};
  // Lo que llegó en el periodo (consultaLlegados_): lo que sigue en Recibidos, lo que la persona archivó a mano y lo que
  // mandó a la papelera. La misma base que analizar_bandeja, para que el antes y después cuadre con lo que llegó.
  if (!acum.q) { acum.q = consultaLlegados_(dias, filtrosQueSacan_()); acum.abrio_por = abrioPorRemitente_(st) ? 'remitente' : 'hilo'; }
  const q = acum.q;
  const aperturas = acum.abrio_por === 'remitente' ? st.get('aperturas_30d', {}) : null;
  // token "-": las páginas ya terminaron y esta solo lee los que faltan.
  const lista = token === '-' ? { ids: [], siguiente: null } : listaHilosPagina_(q, token, op.maximo, true);
  const recuperar = Object.keys(acum.faltan).filter(id => acum.faltan[id] < INTENTOS_LECTURA && lista.ids.indexOf(id) < 0);
  const ids = recuperar.concat(lista.ids);
  const ctx = contextoEvaluacion_(st, op, t0);
  const datos = leerPaginaHilos_(ids, q, 'in:sent newer_than:' + (dias + 1) + 'd', true, t0);
  const idsMsg = [];
  datos.forEach(t => { if (t) sinBorradores_(t.messages).forEach(m => idsMsg.push(m.id)); });
  consultasPara_(ctx, idsMsg, dias + 1);
  const decisiones = [];
  let sinLeer = 0;
  ids.forEach((id, k) => {
    const t = datos[k];
    if (!t) { sinLeer++; acum.faltan[id] = (acum.faltan[id] || 0) + 1; return; }
    delete acum.faltan[id];
    const x = decisionHilo_(t, ctx);
    if (!x.ms.length) return;
    if (aperturas && x.m) { const a = aperturas[correo_(x.m.h['From'])]; x.abrio = a && a[2] > 0 ? a[1] / a[2] >= ABRIO.TASA : null; }
    const sale = x.dec.accion === 'actua' && saleDeBandeja_(x.dec.acciones);
    const nivel = x.dec.accion === 'actua' ? x.dec.nivel : null;
    // Escondido: sale y no queda a la vista (lo marca leído, lo archiva, va a la papelera o a spam). A la vista: va a su
    // carpeta sin marcarlo leído, con su contador de sin leer.
    // Con sin_leer en lo_que_te_necesita, la carpeta marca leído aunque la regla no traiga leido (marcaLeido_).
    const escondido = sale && ((x.dec.acciones || []).some(a => ['archivar', 'papelera', 'spam'].indexOf(a) >= 0) || marcaLeido_(st, x.dec.acciones || []));
    const sinLeerHilo = x.ms.some(m => tiene_(m, 'UNREAD'));
    const enBandeja = x.ms.some(m => tiene_(m, 'INBOX')), borrado = !enBandeja && x.ms.some(m => tiene_(m, 'TRASH')), aMano = !enBandeja && !borrado;
    acum.antes++;
    if (aMano) acum.archivados_a_mano = (acum.archivados_a_mano || 0) + 1;
    if (borrado) acum.borrados_a_mano = (acum.borrados_a_mano || 0) + 1;
    if (sale && x.abrio === null && aperturas) acum.abiertos_sin_medida = (acum.abiertos_sin_medida || 0) + 1;
    if (sale) { acum.salen++; if (x.abrio) { acum.abiertos_que_salen++; if (escondido) acum.abiertos_escondidos = (acum.abiertos_escondidos || 0) + 1; else acum.abiertos_a_la_vista = (acum.abiertos_a_la_vista || 0) + 1; } } else acum.despues++;
    if (x.dec.espera) acum.espera_a_opus++;
    if (nivel === 'propone') acum.propone++;
    if (x.dec.sensible) acum.sensibles++;
    if (x.dec.politica && x.dec.accion === 'actua') acum.por_politica[x.dec.politica] = (acum.por_politica[x.dec.politica] || 0) + 1;
    const h0 = cabeceras_(x.ms[0]);
    const decision = x.dec.accion === 'actua' ? textoAcciones_(x.dec.acciones, st) : (x.dec.espera ? 'espera el juicio de Opus' : 'queda');
    acum.por_decision[decision] = (acum.por_decision[decision] || 0) + 1;
    if (sinLeerHilo && !borrado) { acum.sin_leer = (acum.sin_leer || 0) + 1; acum.sin_leer_por_decision = acum.sin_leer_por_decision || {}; acum.sin_leer_por_decision[decision] = (acum.sin_leer_por_decision[decision] || 0) + 1; }
    let propuesta;
    if (ctx.origen && x.dec.politica) {
      const f = x.dec.hechos || {};
      const valor = { remitente: f.de, dominio: f.dominio, lista: f.lista, categoria_gmail: f.categoria }[x.dec.campo];
      propuesta = grupoDe_(ctx.grupos, f) || ctx.origen[x.dec.politica + '|' + x.dec.campo + '|' + String(valor || '').toLowerCase()] ||
        (x.dec.campo === 'dominio' && f.dominio ? Object.keys(ctx.origen).filter(k => k.indexOf(x.dec.politica + '|dominio|') === 0 && f.dominio.slice(-(k.split('|')[2].length)) === k.split('|')[2]).map(k => ctx.origen[k])[0] : undefined) ||
        ctx.origen[x.dec.politica];
    }
    decisiones.push({ id_hilo: id, remitente: x.m ? x.m.h['From'] || '' : '(la persona)', asunto: entidades_(h0.subject || '(sin asunto)').slice(0, 90),
      decision: decision, sale: sale, motivo: x.dec.motivo, politica: x.dec.politica || null, propuesta: propuesta,
      nivel: nivel || undefined, tema_sensible: x.dec.sensible || undefined, tema_sensible_por: x.dec.sensible_por || undefined, conflicto: x.dec.conflicto || undefined, abrio: x.abrio, sin_leer: sinLeerHilo || undefined, escondido: escondido || undefined, archivado_a_mano: aMano || undefined, borrado_a_mano: borrado || undefined });
  });
  acum.paginas++;
  const faltan = Object.keys(acum.faltan).length;
  const otraVez = Object.keys(acum.faltan).some(id => acum.faltan[id] < INTENTOS_LECTURA);
  const siguiente = lista.siguiente ? simId + '|' + lista.siguiente : otraVez ? simId + '|-' : null;
  if (siguiente) { try { cache.put(EVALUACION.CACHE_SIM + simId, JSON.stringify(acum), 21600); } catch (e) {} }
  else { try { cache.remove(EVALUACION.CACHE_SIM + simId); } catch (e) {} }
  const pol = ctx.politicas.map(p => ({ id: p.id, nombre: p.nombre, nivel: p.nivel, estado: p.estado }));
  const completo = !siguiente && !faltan;
  // El plan también ofrece Bandeja limpia para lo que ya está en Recibidos: su cuenta va en la primera página.
  let inicial;
  if (op.lote === 'instalacion' && !op.pagina) { try { inicial = cuentaBandejaInicial_(st); } catch (e) { inicial = { error: 'No pude contar la bandeja ahora: ' + String(e && e.message || e).slice(0, 120) }; } }
  return {
    modo: 'simulacro', dias: dias, pagina: op.pagina || null, siguiente: siguiente,
    politicas: pol, lote: ctx.lote || undefined, bandeja_limpia_inicial: inicial,
    resumen: { antes: acum.antes, archivados_a_mano: acum.archivados_a_mano || 0, borrados_a_mano: acum.borrados_a_mano || 0, despues: acum.despues, salen: acum.salen, abiertos_que_salen: acum.abiertos_que_salen,
      abiertos_a_la_vista: acum.abiertos_a_la_vista || 0, abiertos_escondidos: acum.abiertos_escondidos || 0,
      abrio_medido_por: acum.abrio_por || 'hilo', abiertos_sin_medida: acum.abiertos_sin_medida || undefined,
      sin_leer: acum.sin_leer || 0, sin_leer_por_decision: Object.keys(acum.sin_leer_por_decision || {}).map(k => ({ decision: k, correos: acum.sin_leer_por_decision[k] })).sort((a, b) => b.correos - a.correos),
      espera_a_opus: acum.espera_a_opus,
      se_proponen: acum.propone, con_tema_sensible: acum.sensibles, por_politica: acum.por_politica,
      por_decision: Object.keys(acum.por_decision).map(k => ({ decision: k, correos: acum.por_decision[k] })).sort((a, b) => b.correos - a.correos), paginas: acum.paginas, completo: completo, faltan: faltan },
    revisar: decisiones.filter(d => d.sale && d.abrio).sort((a, b) => (b.escondido ? 1 : 0) - (a.escondido ? 1 : 0)).map(d => ({ id_hilo: d.id_hilo, remitente: d.remitente, asunto: d.asunto, decision: d.decision, motivo: d.motivo, politica: d.politica, propuesta: d.propuesta, escondido: d.escondido || false })),
    hecho: (completo ? 'De tu bandeja de los últimos ' + dias + ' días saldrían ' + acum.salen + ' hilos.' : 'Por ahora saldrían ' + acum.salen + ' hilos de la bandeja.') +
      (!faltan ? '' : siguiente ? ' Faltan ' + faltan + ' que Gmail no dejó leer; los leo otra vez en la página siguiente.' :
        ' ' + faltan + (faltan === 1 ? ' hilo no se pudo leer' : ' hilos no se pudieron leer') + ' después de ' + INTENTOS_LECTURA + ' intentos: el total no está completo. Simula otra vez en unos minutos.') +
      (acum.abiertos_que_salen ? ' De lo que sale, abriste ' + acum.abiertos_que_salen + ': ' + (acum.abiertos_escondidos || 0) + ' quedarían escondidos (leídos, archivados, en la papelera o en spam) y ' + (acum.abiertos_a_la_vista || 0) + ' siguen a la vista en su carpeta sin leer. Revisa los escondidos.' : '') + ' No toqué nada.' + (siguiente ? ' Hay más: llama otra vez con pagina=siguiente.' : ''),
    decisiones: decisiones, no_leidos_por_cuota: sinLeer || undefined, segundos: +((Date.now() - t0) / 1000).toFixed(1),
    como_leer: 'decision: lo que haría el motor (a <carpeta>, leído, papelera, spam, importante), queda o espera el juicio de Opus (remitente nuevo sin juicio). sale: deja la bandeja. nivel: propone si pediría el sí (tema sensible o política en Te propongo). abrio: la persona lo abrió; null si es de antes del marcado masivo. escondido: sale y no queda a la vista (leído, archivado, papelera o spam); a su carpeta sin leer sigue a la vista. abiertos_escondidos es la cifra que se revisa; abiertos_a_la_vista no es pérdida. sin_leer_por_decision: a dónde va lo que hoy está sin leer. antes cuenta lo que llegó en el periodo: lo que sigue en Recibidos, lo que la persona archivó a mano (archivados_a_mano; en cada hilo, archivado_a_mano) y lo que mandó a la papelera (borrados_a_mano; en cada hilo, borrado_a_mano). Con dias 30 es la misma cifra que bandeja_hoy.llegaron_a_tu_bandeja_30d de analizar_bandeja: di esa en los dos lados. abrio_medido_por: hilo, o remitente si casi nada en Recibidos está sin leer (menos de 2%); entonces abrio dice si la persona abre la mitad o más de lo de ese remitente en el periodo confiable, y abiertos_sin_medida cuenta lo que sale de un remitente sin esa medida. El resumen suma todas las páginas pedidas con este simulacro. completo: leí todos los hilos; faltan: los que Gmail no dejó leer, que se leen otra vez en la página siguiente. Mientras falte uno, las cifras no son el total.'
  };
}

// ---------- aplicar(politicas o lote, dias, pagina) ----------
// Solo mueven las políticas activas. En Me propone, si lo pide Opus, deja una propuesta en lugar de mover;
// si lo pide la persona desde la web app, mueve. Un tema sensible siempre se propone.
// Los hilos de una corrida de aplicar se listan una sola vez, en la primera página y antes de mover nada; cada página
// sigue en la posición donde quedó la anterior. Volver a leer la lista desde el principio en cada página se atoraba
// cuando más de 5,000 hilos revisados se quedaban en la bandeja: las páginas salían vacías sin terminar.
const APLICAR = { LLAVE_HILOS: 'aplicar_hilos', MAX_VUELTAS: 200 };

function aplicarPorPagina_(st, op) {
  frenoPausa_(st);
  const tInicio = Date.now();
  let t0 = tInicio;
  const dias = op.dias;
  let ids = op.politicas && op.politicas.length ? op.politicas : null;
  let deLote = null;
  if (!ids && op.lote) {
    deLote = listaPropuestas_(st).filter(p => p.lote === op.lote && (p.estado === 'aceptada' || p.estado === 'corregida'));
    ids = [];
    deLote.forEach(p => (p.politicas_tocadas || []).concat(p.objeto && listaPoliticas_(st).some(x => x.id === p.objeto) ? [p.objeto] : []).forEach(x => { if (ids.indexOf(x) < 0) ids.push(x); }));
    if (!ids.length) throw new Error('El lote ' + op.lote + ' no tiene propuestas aceptadas que activen políticas. Primero la persona contesta sus instrucciones (la propuesta de instalación) con responder.');
  }
  if (!ids) throw new Error('Di qué aplicar: politicas (ids) o lote.');
  const pols = ids.map(id => politica_(st, id));
  const inactivas = pols.filter(p => !politicaViva_(p));
  if (inactivas.length === pols.length) throw new Error('Ninguna de esas políticas está activa con condiciones: ' + inactivas.map(p => p.id + ' (' + p.estado + ', ' + p.nivel + ')').join(', ') + '. Ningún correo se mueve sin una política activa.');
  const vivas = pols.filter(politicaViva_).map(p => p.id);
  const q = 'in:inbox newer_than:' + dias + 'd';
  const llave = 'aplicar|' + (op.lote || vivas.join(',')) + '|' + dias;
  let corrida = st.get('aplicar_en_curso', null);
  // pagina es "<id de la corrida>|<número>": cada página es una llamada distinta (con el mismo texto, la tercera repetiría
  // la respuesta guardada de la segunda). Una corrida guardada sin posición es de antes de la lista única y no se sigue.
  if (op.pagina && (!corrida || corrida.id !== String(op.pagina).split('|')[0] || corrida.pos === undefined)) throw new Error('La página ' + op.pagina + ' ya no vale: esa corrida de aplicar terminó o empezó otra. Llama otra vez sin pagina.');
  let hilos;
  if (!op.pagina) {
    corrida = { id: Utilities.getUuid().slice(0, 8), llave: llave, ids: [], pos: 0, total: 0, faltan: {}, movidos: 0, revisados: 0, propuestos: 0, paginas: 0, t: Date.now() };
    hilos = [];
    const ya = {};
    let token = null, vueltas = 0;
    do {
      const l = listaHilosPagina_(q, token, 500, false);
      l.ids.forEach(h => { if (!ya[h]) { ya[h] = 1; hilos.push(h); } });
      token = l.siguiente;
      vueltas++;
    } while (token && vueltas < APLICAR.MAX_VUELTAS);
    corrida.total = hilos.length;
    if (token) corrida.sin_listar = true;
    const filas = [];
    guardarIdsInicial_(filas, hilos);
    st.set(APLICAR.LLAVE_HILOS, filas);
    // El presupuesto de lectura de la página empieza después de listar.
    t0 = Date.now();
  } else hilos = [].concat.apply([], st.get(APLICAR.LLAVE_HILOS, []).map(f => f.ids || []));
  if (hilos.length !== corrida.total) throw new Error('La lista de hilos de esta corrida de aplicar no está completa en la hoja. Llama otra vez sin pagina.');
  corrida.faltan = corrida.faltan || {};
  // Primero los hilos que Gmail no dejó leer en una página anterior: no se saltan en silencio.
  const nuevos = Object.keys(corrida.faltan).filter(h => corrida.faltan[h] < INTENTOS_LECTURA).slice(0, op.maximo);
  const tomar = Math.max(0, op.maximo - nuevos.length);
  hilos.slice(corrida.pos, corrida.pos + tomar).forEach(h => { if (!corrida.faltan[h]) nuevos.push(h); });
  corrida.pos = Math.min(hilos.length, corrida.pos + tomar);
  const lista = { ids: nuevos, siguiente: corrida.pos < hilos.length ? corrida.id : null };
  const ctx = contextoEvaluacion_(st, {}, t0);
  ctx.politicas = ctx.politicas.filter(p => vivas.indexOf(p.id) >= 0);
  const datos = leerPaginaHilos_(lista.ids, q, 'in:sent newer_than:' + (dias + 1) + 'd', false, t0);
  const idsMsg = [];
  datos.forEach(t => { if (t) sinBorradores_(t.messages).forEach(m => idsMsg.push(m.id)); });
  consultasPara_(ctx, idsMsg, dias + 1);
  const grupos = {};
  const cuenta = { revisados: 0, quedan: 0, esperan_a_opus: 0 };
  let sinLeer = 0;
  lista.ids.forEach((id, k) => {
    const t = datos[k];
    if (!t) { sinLeer++; corrida.faltan[id] = (corrida.faltan[id] || 0) + 1; return; }
    delete corrida.faltan[id];
    const x = decisionHilo_(t, ctx);
    if (!x.m) return;
    cuenta.revisados++;
    if (x.dec.espera) cuenta.esperan_a_opus++;
    const acc = (x.dec.acciones || []).filter(a => a !== 'desuscribir');
    if (x.dec.accion !== 'actua' || !acc.length) { cuenta.quedan++; return; }
    // Todos los mensajes del hilo en la bandeja se mueven juntos.
    const items = sinBorradores_(t.messages).filter(m => tiene_(m, 'INBOX') && !tiene_(m, 'SENT')).map(m => itemDe_(metadatoDe_(m)));
    if (x.dec.sensible) items.forEach(i => { i.sens = x.dec.sensible; });
    const propone = x.dec.sensible || (x.dec.nivel === 'propone' && VIA !== 'webapp' && !deLote);
    const llave = x.dec.politica + '|' + (propone ? 'p' : 'a') + '|' + acc.join(',');
    const g = grupos[llave] = grupos[llave] || { politica: x.dec.politica, propone: propone, acciones: acc, items: [] };
    items.forEach(i => g.items.push(i));
  });
  const aplicado = {}, propuesto = {}, ids_accion = [], propuestas = [];
  let movidos = 0;
  Object.keys(grupos).forEach(k => {
    const g = grupos[k];
    if (g.propone) {
      const p = proponerLote_(st, g.politica, g.items);
      propuesto[g.politica] = (propuesto[g.politica] || 0) + g.items.length;
      if (propuestas.indexOf(p.id) < 0) propuestas.push(p.id);
      return;
    }
    const r = aplicarItems_(st, g.acciones, g.items, g.politica, actor_(), {});
    aplicado[g.politica] = (aplicado[g.politica] || 0) + r.n;
    movidos += r.n;
    if (r.id_accion) ids_accion.push(r.id_accion);
  });
  // Lo que falta leer pide otra página; tras INTENTOS_LECTURA se da por no leído y la corrida termina incompleta.
  const faltan = Object.keys(corrida.faltan).length;
  lista.siguiente = lista.siguiente || Object.keys(corrida.faltan).some(h => corrida.faltan[h] < INTENTOS_LECTURA) ? corrida.id : null;
  const completo = !lista.siguiente && !faltan && !corrida.sin_listar;
  // Con el plan aplicado completo, sus respuestas ya no se cambian con responder: lo que siga se cambia en Políticas.
  if (deLote && completo) { deLote.forEach(p => { if (!p.aplicada) p.aplicada = Date.now(); }); st.set('propuestas', listaPropuestas_(st)); }
  // Todo lo que se aplica en las páginas de una misma corrida de aplicar se deshace con un solo id al final.
  corrida.ids = corrida.ids.concat(ids_accion);
  corrida.movidos += movidos;
  corrida.revisados += cuenta.revisados;
  corrida.propuestos += Object.keys(propuesto).reduce((a, x) => a + propuesto[x], 0);
  corrida.paginas++;
  if (lista.siguiente) lista.siguiente = corrida.id + '|' + corrida.paginas;
  let idTotal = null;
  if (!lista.siguiente) {
    if (corrida.ids.length > 1) {
      const e = anotar_(st, { texto: 'Apliqué ' + (op.lote ? 'tus instrucciones' : vivas.join(', ')) + ': ' + corrida.movidos + ' correos en ' + corrida.paginas + ' página' + (corrida.paginas === 1 ? '' : 's') + '.',
        politica: vivas.length === 1 ? vivas[0] : undefined, actor: actor_(), d: { tipo: 'grupo', ids: corrida.ids } });
      idTotal = e.id;
    } else idTotal = corrida.ids[0] || null;
    st.set('aplicar_en_curso', null);
    st.set(APLICAR.LLAVE_HILOS, []);
  } else st.set('aplicar_en_curso', corrida);
  // Las bajas aprobadas en el plan se dan al aplicar su primera página.
  let bajas;
  if (deLote && !op.pagina && op.con_bajas !== false) {
    const aprobadas = st.get('bajas_aprobadas', {});
    const hechas = st.get('bajas', {});
    const delLote = {};
    deLote.forEach(p => { delLote[p.id] = 1; });
    bajas = Object.keys(aprobadas).filter(r => delLote[aprobadas[r].propuesta] && !(hechas[r] && hechas[r].ok)).slice(0, 30).map(r => {
      try { const x = desuscribir_(st, r); return { remitente: r, hecho: x.hecho }; } catch (e) { return { remitente: r, error: String(e && e.message || e).slice(0, 200) }; }
    });
  }
  let enBandeja;
  if (!lista.siguiente) { try { enBandeja = listaHilosPagina_(q, null, 1, false).estimado; } catch (e) {} }
  return {
    modo: 'aplicar', estado: lista.siguiente ? 'en_proceso' : completo ? 'listo' : 'incompleto', completo: completo, faltan: faltan, no_leidos_por_cuota: sinLeer || undefined, dias: dias, pagina: op.pagina || null, siguiente: lista.siguiente, pagina_siguiente: lista.siguiente,
    movidos: corrida.movidos, total: corrida.revisados, en_bandeja: enBandeja, id_accion: lista.siguiente ? undefined : idTotal,
    politicas: vivas, politicas_inactivas: inactivas.length ? inactivas.map(p => p.id) : undefined,
    hilos_revisados: cuenta.revisados, mensajes_movidos: movidos, aplicado: aplicado, propuesto: propuesto, quedan: cuenta.quedan, esperan_a_opus: cuenta.esperan_a_opus,
    bajas: bajas, ids_accion: ids_accion, propuestas: propuestas.length ? propuestas : undefined,
    hecho: 'Apliqué ' + vivas.length + ' regla' + (vivas.length === 1 ? '' : 's') + ' a lo de los últimos ' + dias + ' días: ' + movidos + ' mensajes con su acción' +
      (Object.keys(propuesto).length ? ', ' + Object.keys(propuesto).reduce((a, x) => a + propuesto[x], 0) + ' esperan su sí' : '') + '. Los movimientos tienen Deshacer en Actividad por ' + COS.DIAS_DESHACER + ' días' +
      (bajas && bajas.length ? '; las bajas no tienen Deshacer: se revierten en el sitio del remitente.' : '.') +
      (!faltan ? '' : lista.siguiente ? ' Faltan ' + faltan + ' hilos que Gmail no dejó leer; los leo otra vez en la página siguiente.' :
        ' ' + faltan + (faltan === 1 ? ' hilo no se pudo leer' : ' hilos no se pudieron leer') + ' después de ' + INTENTOS_LECTURA + ' intentos: tus instrucciones no se aplicaron completas. Aplica otra vez en unos minutos; lo ya movido no se toca.') +
      (lista.siguiente ? ' Hay más: llama otra vez con pagina=siguiente.' : ''),
    hilos_en_la_lista: corrida.total, hilos_sin_listar: corrida.sin_listar || undefined,
    segundos: +((Date.now() - tInicio) / 1000).toFixed(1)
  };
}

// ---------- exportar_evaluacion: hechos por hilo para la evaluación al instalar (solo lectura) ----------
function iso_(ms) { return ms ? Utilities.formatDate(new Date(Number(ms)), tz_(), "yyyy-MM-dd'T'HH:mm:ssXXX") : null; }

// Lo que el sistema hizo con cada mensaje, según Actividad (lo no deshecho del motor y de Opus; lo de la persona no es
// decisión del sistema). Lo más reciente manda. Actividad guarda todo lo de los últimos COS.DIAS_DESHACER días.
function decisionesDelSistema_(st, nombres) {
  const idx = {};
  const movido = { carpeta: 1, papelera: 1, spam: 1, baja: 1 };
  st.get('actividad', []).slice().reverse().forEach(e => {
    if (!e.d || e.u || e.actor === 'persona') return;
    (e.d.tipo === 'varios' ? e.d.partes : [e.d]).forEach(d => {
      if (!d || !d.ms) return;
      let destino = null, carpeta = null;
      if (d.tipo === 'papelera') destino = e.politica === 'bajas' ? 'baja' : 'papelera';
      else if (d.tipo === 'spam') destino = 'spam';
      else if (d.tipo === 'etiquetar' && d.l === 'IMPORTANT') destino = 'importante';
      else if (d.tipo === 'etiquetar' && d.l && d.qi) { destino = 'carpeta'; const n = nombres[d.l] || ''; carpeta = esEtiquetaCos_(n) ? relativaCos_(n) : n; }
      d.ms.forEach(x => {
        const prev = idx[x[0]] || {};
        const queda = destino === 'importante' && movido[prev.destino];
        idx[x[0]] = { destino: queda ? prev.destino : (destino || prev.destino || 'bandeja'), carpeta: queda || !destino ? (prev.carpeta || null) : carpeta,
          leido: !!(d.tipo === 'etiquetar' && d.qu) || !!prev.leido, politica: e.politica || prev.politica || null, version: e.v || prev.version || null, actor: e.actor, t: e.t };
      });
    });
  });
  return idx;
}

// La señal con su detalle en la forma de PROTOCOLO_pilotos.md.
function detalleSenal_(x) {
  if (x.dx) return x.dx;
  if (x.tipo === 'rescate') {
    const ep = x.etiqueta_previa || '';
    const d = { Papelera: 'papelera', Spam: 'spam', Recibidos: 'bandeja' }[ep];
    return d ? { destino_previo: d } : { destino_previo: 'carpeta', carpeta: ep || null };
  }
  return x.detalle ? { texto: x.detalle } : null;
}

function exportarEvaluacion_(st, desde, hasta, pagina, maximo) {
  const t0 = Date.now();
  const d0 = fechaRelativa_(desde, 'desde');
  const d1 = hasta === undefined || hasta === null || hasta === '' ? Date.now() : fechaRelativa_(hasta, 'hasta');
  if (d1 <= d0) throw new Error('hasta debe ser después de desde.');
  const q = 'after:' + Math.floor(d0 / 1000) + ' before:' + Math.floor(d1 / 1000) + ' -in:sent -in:chats -in:drafts';
  const lista = listaHilosPagina_(q, pagina, maximo, true);
  const ctx = contextoEvaluacion_(st, {}, t0);
  const datos = leerPaginaHilos_(lista.ids, q, 'in:sent after:' + Math.floor(d0 / 1000), true, t0);
  const idsMsg = [];
  datos.forEach(t => { if (t) sinBorradores_(t.messages).forEach(m => idsMsg.push(m.id)); });
  consultasPara_(ctx, idsMsg, Math.ceil((Date.now() - d0) / 86400000) + 1);
  const rescatados = {};
  st.get('senales', []).forEach(x => { if (x.tipo === 'rescate' && x.id_hilo) rescatados[x.id_hilo] = 1; });
  const corr = corresponsalesCache_(st, yo_(), t0, false).mapa || {};
  const sistema = decisionesDelSistema_(st, ctx.nombres);
  const hilos = [];
  let sinLeer = 0;
  lista.ids.forEach((id, k) => {
    const t = datos[k];
    if (!t) { sinLeer++; return; }
    const x = decisionHilo_(t, ctx);
    if (!x.m) return;
    const m = x.m;
    const recibidos = x.ms.filter(y => !tiene_(y, 'SENT'));
    const primero = recibidos.filter(y => Number(y.internalDate) >= d0 && Number(y.internalDate) < d1)[0] || recibidos[0] || m;
    const recibido = Number(m.internalDate);
    const respuesta = x.ms.filter(y => tiene_(y, 'SENT') && Number(y.internalDate) > recibido)[0] ||
      x.ms.filter(y => tiene_(y, 'SENT') && Number(y.internalDate) > Number(x.ms[0].internalDate))[0];
    const todas = {};
    x.ms.forEach(y => (y.labelIds || []).forEach(e => { todas[e] = 1; }));
    const cat = Object.keys(todas).filter(e => CAT_LETRA[e])[0];
    const de = correo_(m.h['From']);
    const f = fichaDe_(ctx.fichas, de);
    const fi = f.persona || f.organizacion;
    const j = ctx.juicios[id];
    const dec = recibidos.map(y => sistema[y.id]).filter(Boolean).sort((a, b) => b.t - a.t)[0];
    hilos.push({
      id_hilo: id, llegada: iso_(primero.internalDate), remitente: de, nombre_mostrado: nombreDe_(m.h['From']), dominio: dominio_(de),
      asunto: entidades_(cabeceras_(x.ms[0]).subject || '(sin asunto)').slice(0, 120), extracto: entidades_(m.snippet || '').slice(0, 600),
      lista: !!listId_(m), list_id: listId_(m) || null, baja: tipoBaja_(m.h), categoria_gmail: cat ? CAT_LETRA[cat] : null, plataforma: plataforma_(m.h),
      le_escribio_90d: !!corr[de], ficha: fi ? fi.id : null, ficha_tipo: fi ? fi.tipo : null, organizacion: f.organizacion ? f.organizacion.id : null,
      decision: dec ? { destino: dec.destino, carpeta: dec.carpeta, leido: dec.leido, politica: dec.politica, version: dec.version, actor: dec.actor, hora: iso_(dec.t) }
        : { destino: 'bandeja', carpeta: null, leido: false, politica: null, version: null, actor: null, hora: null },
      juicio: j ? { prioridad: j.prioridad, confianza: j.confianza === undefined ? null : j.confianza, sensible: !!j.sensible, tema: j.sensible || undefined, por: j.por, hora: iso_(j.t), vigente: !j.vencido,
        resumen: j.resumen || undefined, resumen_completo: j.resumen_completo || undefined, opcional: j.opcional || undefined, conservar: j.conservar || undefined,
        caducado: j.caducado ? { fecha: iso_(j.caducado) } : undefined, proxima_revision: j.revision ? iso_(j.revision) : undefined } : null,
      decision_hoy: x.dec.accion === 'actua' ? textoAcciones_(x.dec.acciones, st) : (x.dec.espera ? 'espera el juicio de Opus' : 'queda'), motivo_hoy: x.dec.motivo,
      etiquetas: Object.keys(todas).filter(e => /^Label_/.test(e)).map(e => ctx.nombres[e]).filter(Boolean),
      sin_leer: x.ms.some(y => !tiene_(y, 'SENT') && tiene_(y, 'UNREAD')), en_bandeja: !!todas.INBOX, estrella: !!todas.STARRED,
      en_papelera: x.ms.every(y => tiene_(y, 'TRASH')), en_spam: x.ms.some(y => tiene_(y, 'SPAM')) || undefined,
      contesto: !!respuesta, contesto_horas: respuesta ? +((Number(respuesta.internalDate) - Number(x.ms[0].internalDate)) / 3600000).toFixed(1) : null,
      contesto_hora: respuesta ? iso_(respuesta.internalDate) : null, rescatado: !!rescatados[id], de_la_persona_antes: x.ms[0] && tiene_(x.ms[0], 'SENT') || undefined
    });
  });
  const an = analisisGuardado_(st);
  const salida = {
    instalacion_cerrada: iso_(instalacionCerrada_(st)), desde: iso_(d0), hasta: iso_(d1), temas_sensibles: sensiblesDe_(st).map(x => x.tema),
    bandeja_al_cierre: st.get('bandeja_dias', []).filter(x => x.fecha >= dia_(d0) && x.fecha <= dia_(d1)).map(x => ({ fecha: x.fecha, hilos: x.hilos, sin_leer: x.sin_leer })).reverse(),
    carpeta_leer_despues: COS.LEER_DESPUES, pagina: pagina || null, siguiente: lista.siguiente, hilos_en_pagina: hilos.length, no_leidos_por_cuota: sinLeer || undefined,
    fecha_marcado_masivo: an && an.mm ? an.mm : null, hilos: hilos
  };
  // Señales y actividad de la ventana van completas en la primera página.
  if (!pagina) {
    const fichas = ctx.fichas;
    salida.senales = st.get('senales', []).filter(x => x.t >= d0 && x.t <= d1).map(x => {
      const f = x.ficha ? null : (x.remitente ? fichaDe_(fichas, x.remitente) : null);
      const fi = x.ficha || (f && (f.persona || f.organizacion) ? (f.persona || f.organizacion).id : null);
      return { fecha: iso_(x.t), tipo: x.tipo, canal: x.canal, id_hilo: x.id_hilo || null, remitente: x.remitente || null, dominio: x.dominio || (x.remitente ? dominio_(x.remitente) : null),
        ficha: fi, politica: x.politica || null, detalle: detalleSenal_(x) };
    });
    salida.seguimientos = st.get('seguimientos', []).filter(x => (x.creado || x.desde || 0) <= d1 && (x.estado === 'abierto' || (x.cerrado || x.vence || 0) >= d0)).slice(0, 300).map(x => ({
      id: x.id, id_hilo: x.hilo || undefined, chat: x.chat || undefined, canal: x.canal, direccion: x.direccion, que: x.que, vence: x.vence ? iso_(x.vence) : null,
      proxima_revision: x.revision ? iso_(x.revision) : undefined, persistente: x.persistente || undefined, estado: x.estado, motivo_cierre: x.motivo_cierre || undefined, creado: iso_(x.creado || x.desde) }));
    salida.actividad = [];
    // Actividad guarda 30 días: la primera página lleva lo más reciente del rango hasta COS.MAX_ACTIVIDAD, como antes.
    st.get('actividad', []).filter(e => e.t >= d0 && e.t <= d1).slice(0, COS.MAX_ACTIVIDAD).reverse().forEach(e => {
      const objetos = e.objeto ? String(e.objeto).split(',') : [null];
      objetos.forEach(o => salida.actividad.push({ id: e.id, hora: iso_(e.t), actor: e.actor, politica: e.politica || null,
        objeto: o && o.indexOf(':') < 0 ? 'hilo:' + o : o, texto: e.texto, deshecho: e.u ? iso_(e.u) : undefined }));
    });
  }
  salida.segundos = +((Date.now() - t0) / 1000).toFixed(1);
  salida.como_leer = 'Un renglón por hilo con correo recibido en el rango (incluye papelera y spam). decision: lo que hizo el sistema (motor u Opus) y no se deshizo; sin acción, destino bandeja. decision_hoy: lo que harían hoy las políticas activas. juicio: el de Opus o la corrección de la persona. senales y actividad de la ventana van en la primera página. Antes de fecha_marcado_masivo, sin_leer=false no prueba que lo abrió.';
  return salida;
}
