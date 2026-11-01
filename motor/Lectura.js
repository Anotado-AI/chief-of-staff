// --- Lecturas: Hoy, novedades, hilos, búsqueda, agenda y WhatsApp ---
// Todo es de solo lectura. Si una lectura opcional falla, la respuesta lo dice con su motivo.

const LECTURA = {
  MAX_JUICIOS_HOY: 30,
  MAX_CHATS: 60,
  ESTADOS_WHATSAPP: ['ok', 'sin_chrome', 'sin_sesion', 'error'],
  DIAS_AGENDA: 14,
  ORDEN: { riesgo: 0, alta: 1, media: 2, baja: 3, ruido: 4 },
  MAX_DINERO: 25,
  IDS_LINEA_MCP: 50,
  // ver_novedades sin desde: desde que la bandeja quedó al corriente (novedades_piso), con una hora de margen y a lo más
  // 14 días atrás; sin piso, los 14 días. Recorre hasta 10 páginas de 100 hilos para que sin_juicio sea el total y no solo
  // la primera página. Hoy cuenta lo sin juicio con la misma ventana.
  // LECTURAS_MAX: hilos que se leen por llamada para juntar POR_LLAMADA que se juzgan (las notas propias se saltan).
  NOVEDADES: { MARGEN_MS: 3600000, DIAS_MAX: 14, PAGINAS: 10, POR_LLAMADA: 25, LECTURAS_MAX: 100 },
  PALABRAS_COBRO: 'factura recibo comprobante cargo cobro pago "estado de cuenta" cfdi invoice receipt payment bill'
};

// ---------- Ventana de novedades ----------
// El piso es {t, v: 2}. El de la versión anterior (un número) se fijaba al inicio de una ventana de un día y dejaba fuera
// lo anterior a la instalación: se descarta.
function pisoNovedades_(st) {
  const p = st.get('novedades_piso', null);
  return p && typeof p === 'object' && p.v === 2 && p.t > 0 ? p.t : null;
}
function ventanaNovedades_(st, t0) {
  const N = LECTURA.NOVEDADES, piso = pisoNovedades_(st), tope = t0 - N.DIAS_MAX * 86400000;
  return { d: piso ? Math.max(piso - N.MARGEN_MS, tope) : tope, piso: piso };
}
// Los hilos de la bandeja desde d que no tienen juicio vigente. Si la lista falla, lanza: nadie cuenta "sin pendientes".
// Lista con el servicio de Gmail de Apps Script, que no pasa por el tope diario de llamadas externas: Hoy cuenta aun con él.
// esperas: Hoy pasa una sola espera corta para no detener la pantalla; ver_novedades usa las de siempre.
function pendientesNovedades_(d, juicios, esperas) {
  const N = LECTURA.NOVEDADES, q = 'in:inbox after:' + Math.floor(d / 1000);
  const pagina = token => {
    const o = { q: q, maxResults: 100 };
    if (token) o.pageToken = token;
    const r = conReintento_(() => Gmail.Users.Threads.list('me', o), esperas);
    return { ids: (r.threads || []).map(t => t.id), siguiente: r.nextPageToken || null };
  };
  let lista = pagina(null), todos = lista.ids.slice(), paginas = 1;
  while (lista.siguiente && paginas < N.PAGINAS) { lista = pagina(lista.siguiente); todos = todos.concat(lista.ids); paginas++; }
  return { todos: todos, truncada: !!lista.siguiente, pendientes: todos.filter((id, k) => (!juicios[id] || juicios[id].vencido) && todos.indexOf(id) === k) };
}

// ---------- Hilos ----------
// Hilos de una búsqueda y si Gmail tiene más resultados que los pedidos.
function listaHilos_(q, max) {
  const r = conReintento_(() => Gmail.Users.Threads.list('me', { q: q, maxResults: max }));
  const ids = (r.threads || []).map(t => t.id).slice(0, max);
  return { filas: filasHilos_(ids), hay_mas: !!r.nextPageToken };
}

function filasHilos_(ids, crudos) {
  const datos = gmailFetchAll_(ids.map(id => 'threads/' + id + '?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=To&fields=messages(id,labelIds,snippet,internalDate,payload/headers)'), 25);
  const nombres = nombresEtiquetas_();
  if (crudos) ids.forEach((id, k) => { crudos[id] = datos[k]; });
  return ids.map((id, k) => filaHilo_(id, datos[k], nombres)).filter(Boolean);
}

// Juicios que ver_hoy encontró sin sus datos del correo: el conector los guarda después, con el candado.
let COMPLETAR_JUICIOS_ = null;

// La cifra principal de Hoy: hilos y sin leer en Recibidos ahora, lo que necesita a la persona y el cierre de ayer.
function bandejaDeHoy_(st, juicios) {
  const ayer = st.get('bandeja_dias', []).filter(x => x.fecha < dia_(Date.now()))[0];
  const te = juicios.filter(x => !x.error && ['riesgo', 'alta', 'media'].indexOf(x.prioridad) >= 0).length;
  try {
    const x = conReintento_(() => Gmail.Users.Labels.get('me', 'INBOX'));
    return { hilos: x.threadsTotal || 0, sin_leer: x.threadsUnread || 0, te_necesitan: te, al_cierre_de_ayer: ayer ? { fecha: ayer.fecha, hilos: ayer.hilos, sin_leer: ayer.sin_leer, te_necesitan: ayer.te_necesitan } : undefined };
  } catch (e) { return { te_necesitan: te, error: 'No pude contar la bandeja ahora.' }; }
}

// Dónde está un hilo, con la forma de documentos_de_dinero: bandeja, carpeta <nombre>, papelera, spam o archivado.
function dondeEsta_(et, nombres) {
  if (et.TRASH) return 'papelera';
  if (et.SPAM) return 'spam';
  if (et.INBOX) return 'bandeja';
  const n = Object.keys(et).filter(l => /^Label_/.test(l)).map(l => nombres[l]).filter(Boolean);
  const c = n.filter(esEtiquetaCos_)[0] || n[0];
  return c ? 'carpeta ' + (esEtiquetaCos_(c) ? relativaCos_(c) : c) : 'archivado';
}

function filaHilo_(id, t, nombres) {
  if (!t) return { id_hilo: id, error: 'No se pudo leer este hilo ahora: Gmail tardó o limitó la lectura. Se puede reintentar en un minuto (leer_hilo o la misma búsqueda).', reintentar: true };
  const ms = sinBorradores_(t.messages);
  if (!ms.length) return null;
  const ult = ms[ms.length - 1];
  const recibidos = ms.filter(m => !tiene_(m, 'SENT'));
  const h0 = cabeceras_(ms[0]), hr = cabeceras_(recibidos.length ? recibidos[recibidos.length - 1] : ult);
  const et = {};
  ms.forEach(m => (m.labelIds || []).forEach(l => { et[l] = 1; }));
  const etiquetas = Object.keys(et).map(l => l === 'IMPORTANT' ? 'Importante' : l === 'STARRED' ? 'Destacado' : /^Label_/.test(l) ? nombres[l] : null).filter(Boolean);
  const tms = Number(ult.internalDate);
  // para: a quién escribió la persona por última vez en el hilo; si ella no escribió, los otros destinatarios del último.
  // Si se escribió a sí misma, va su dirección; sin Para (solo Cco), va vacío.
  const suyos = ms.filter(m => tiene_(m, 'SENT'));
  const yo = yo_();
  const hpara = cabeceras_(suyos.length ? suyos[suyos.length - 1] : ult).to;
  const dest = correos_(hpara), otros = dest.filter(x => x !== yo), cuales = otros.length ? otros : dest;
  // para_nombre: el nombre de la cabecera Para; si no trae, el nombre con que esa dirección firma en el hilo y, en
  // conJuicio_, el de su ficha. Sin ninguno, la dirección. El de los contactos de Google pediría otro permiso.
  const nomPara = nombresPorCorreo_(hpara), firmas = {};
  ms.forEach(m => { const de = cabeceras_(m).from || '', c = correo_(de), n = nombreDe_(de); if (c && n && n.toLowerCase() !== c && !firmas[c]) firmas[c] = n; });
  const pn = cuales.map(c => [c, nomPara[c] !== c && nomPara[c] ? nomPara[c] : firmas[c] || null]);
  const para = cuales.join(', ').slice(0, 200);
  return Object.defineProperty({
    id_hilo: id, remitente: hr.from || '', correo: correo_(hr.from || ''), nombre: nombreDe_(hr.from || ''), para: para, para_nombre: para ? pn.map(x => x[1] || x[0]).join(', ').slice(0, 200) : '',
    asunto: entidades_(h0.subject || hr.subject || '(sin asunto)'), extracto: entidades_(ult.snippet || '').slice(0, 200),
    fecha: fecha_(tms), antiguedad: antiguedad_(tms), sin_leer: ms.some(m => tiene_(m, 'UNREAD')), ultimo_es_suyo: tiene_(ult, 'SENT'),
    en_bandeja: ms.some(m => tiene_(m, 'INBOX')), etiquetas: etiquetas, mensajes: ms.length, donde: dondeEsta_(et, nombres)
  }, '_pn', { value: pn, enumerable: false });
}

function fichaCorta_(fichas, correo) {
  const x = fichaDe_(fichas, correo);
  const f = x.persona || x.organizacion;
  if (!f) return null;
  return { id: f.id, tipo: f.tipo, nombre: f.nombre, importancia: f.importancia || 'normal', rol: f.rol || undefined, relacion: f.relacion || undefined,
    organizacion: x.organizacion && x.persona ? { id: x.organizacion.id, nombre: x.organizacion.nombre, dominios: x.organizacion.dominios || [] } : undefined };
}
function organizacionDe_(fichas, correo) {
  const o = fichaDe_(fichas, correo).organizacion;
  return o ? { id: o.id, nombre: o.nombre, dominios: o.dominios || [] } : null;
}

function conJuicio_(st, filas) {
  const j = st.get('juicios', {});
  const fichas = st.get('fichas', []);
  filas.forEach(f => {
    if (f.correo) f.ficha = fichaCorta_(fichas, f.correo);
    if (f._pn && f._pn.some(x => !x[1])) f.para_nombre = f._pn.map(x => { const p = x[1] ? null : fichaDe_(fichas, x[0]).persona; return x[1] || (p && p.nombre) || x[0]; }).join(', ').slice(0, 200);
    const x = j[f.id_hilo];
    if (!x || x.vencido) return;
    f.juicio = { prioridad: x.prioridad, recomendacion: x.recomendacion, motivo: x.motivo, confianza: x.confianza, por: x.por, tema_sensible: x.sensible };
  });
  return filas;
}

// ---------- Lo que hice desde tu última visita ----------
// Una sola vista acumulada por política, nunca por día: si la persona falta tres días ve una vista,
// no tres. ver_hoy({visita: true}) la muestra desde la visita anterior y guarda esta; sin visita (las rutinas, o Hoy al
// refrescar) se ve la misma ventana que mostró la última visita. Cuenta lo que hicieron las políticas y Opus con una
// política; lo que hizo la persona y lo deshecho no cuentan.
// Correos que movió una acción. Lo que no mueve correo (políticas, fichas, memoria, seguimientos, borradores) no suma; un
// grupo de aplicar tampoco, porque cada acción que junta ya está en Actividad.
function cifraDeAccion_(st, d) {
  if (!d) return 0;
  if (d.tipo === 'varios') return d.partes.reduce((n, x) => n + cifraDeAccion_(st, x), 0);
  if (d.tipo === 'bandeja_inicial') { const j = st.get(INICIAL.LLAVE, null) || {}; return (j.archivados || 0) + (j.marcados || 0); }
  if (d.tipo === 'caducidad') return (d.caducidad || []).length;
  return ['etiquetar', 'papelera', 'spam'].indexOf(d.tipo) >= 0 && d.ms ? d.ms.length : 0;
}
// Una acción corta por línea, sin el nombre de la política adelante: «Aparté 214 de publicidad.», «Archivé 38 leídos.»,
// «Mandé 3 fraudes a spam.». La web app y Opus las juntan en una frase.
function textoDeVisita_(p, l) {
  const inicial = 'limpié lo anterior a la fecha que elegiste, como lo pediste.';
  if (l.inicial && !l.cifra) return inicial.charAt(0).toUpperCase() + inicial.slice(1);
  if (l.inicial) return textoDeVisita_(p, Object.assign({}, l, { inicial: false })).replace(/\.$/, '') + '; también ' + inicial;
  const n = l.cifra.toLocaleString('es-MX'), uno = l.cifra === 1;
  const acc = p ? accionesMotor_(p) : [];
  const de = (l.nombre || '').toLowerCase();
  if (p && p.id === 'proteccion') return 'Mandé ' + n + (uno ? ' fraude' : ' fraudes') + ' a spam.';
  if (acc.indexOf('spam') >= 0) return 'Mandé ' + n + ' de ' + de + ' a spam.';
  if (acc.indexOf('papelera') >= 0 || acc.indexOf('desuscribir') >= 0) return 'Mandé ' + n + ' de ' + de + ' a la papelera.';
  if (acc.some(a => /^carpeta:/.test(a))) return 'Aparté ' + n + ' de ' + de + '.';
  if (acc.indexOf('archivar') >= 0) return 'Archivé ' + n + (uno ? ' leído.' : ' leídos.');
  if (acc.indexOf('leido') >= 0) return 'Marqué ' + (uno ? 'leído ' : 'leídos ') + n + ' de ' + de + '.';
  return 'Moví ' + n + ' de ' + de + '.';
}
// Recargar Hoy o abrirlo otra vez enseguida no es volver a entrar: una visita a menos de VISITA.SESION_MIN de la última,
// el mismo día, sigue la misma visita y muestra la misma ventana. Si no, la vista acumulada se perdía al recargar.
const VISITA = { SESION_MIN: 30 };
function visitaSigue_(vis, ahora) { return !!vis && vis.t > 0 && ahora - (vis.ultima || vis.t) < VISITA.SESION_MIN * 60000 && dia_(ahora) === dia_(vis.t); }
function inicioVisita_(st, visita) {
  const vis = st.get('visita', null);
  const sigue = !!visita && visitaSigue_(vis, Date.now());
  return { sigue: sigue, t0: !vis ? 0 : visita && !sigue ? vis.t : (vis.anterior !== undefined ? vis.anterior : vis.t) };
}
function desdeTuVisita_(st, visita) {
  const iv = inicioVisita_(st, visita), sigue = iv.sigue, t0 = iv.t0;
  const pols = {};
  listaPoliticas_(st).forEach(p => { pols[p.id] = p; });
  const lineas = {};
  const linea = pid => lineas[pid] = lineas[pid] || { id: 'aviso|' + pid + '|v' + t0, politica: pid, nombre: (pols[pid] || {}).nombre || pid, nivel: (pols[pid] || {}).nivel, cifra: 0, ids_accion: [], bien: true };
  st.get('actividad', []).filter(e => e.t > t0 && e.politica && e.d && !e.u && e.actor !== 'persona').forEach(e => {
    const l = linea(e.politica);
    // Lo anterior a una fecha no dice cuántos archivó ni marcó: la línea solo lo nombra.
    if (e.d.tipo === 'bandeja_inicial' || (e.d.tipo === 'varios' && e.d.partes.some(x => x && x.tipo === 'bandeja_inicial'))) l.inicial = true;
    else l.cifra += cifraDeAccion_(st, e.d);
    l.ids_accion.push(e.id);
    if (!e.bien) l.bien = false;
  });
  // Lo que ya salió de Actividad (más de 30 días o el tope de tamaño) sigue sumando a su política, sin Deshacer.
  const podadas = (st.get('actividad_podada', {}) || {})[t0] || {};
  Object.keys(podadas).forEach(pid => { const l = linea(pid); l.cifra += podadas[pid][0]; if (podadas[pid][1]) l.bien = false; });
  const ls = Object.keys(lineas).map(k => lineas[k]).filter(l => l.cifra > 0 || l.inicial).sort((a, b) => b.cifra - a.cifra).map(l => {
    // En la plática van los primeros 50 ids y el total: Deshacer de la línea es deshacer(id de la línea), en una llamada.
    if (VIA === 'mcp' && l.ids_accion.length > LECTURA.IDS_LINEA_MCP) { l.acciones = l.ids_accion.length; l.ids_accion = l.ids_accion.slice(0, LECTURA.IDS_LINEA_MCP); }
    return Object.assign(l, { texto: textoDeVisita_(pols[l.politica], l), con_bien: l.nivel === 'avisa' || undefined, bien: l.nivel === 'avisa' ? l.bien : undefined });
  });
  const out = { desde: t0 ? fecha_(t0) : null, dias: t0 ? Math.max(1, Math.ceil((Date.now() - t0) / 86400000)) : null, total: ls.reduce((n, l) => n + l.cifra, 0), lineas: ls };
  // misma_visita: es una recarga de la visita en curso; la web app no repite el aviso que se desvanece.
  if (sigue) out.misma_visita = true;
  return out;
}

// Resumen de lo apartado: lo que tus reglas movieron a carpetas desde tu visita anterior (o en las
// últimas 24 horas), una línea por carpeta, hasta 5, primero las que tienen más sin leer. Cada línea nombra a quién mandó
// lo más reciente. La papelera y el spam no van aquí: ya están en desde_tu_ultima_visita.
function resumenApartado_(st, visita) {
  const desde = inicioVisita_(st, visita).t0 || Date.now() - 86400000;
  const por = {};
  st.get('actividad', []).filter(e => e.t > desde && e.politica && e.d && !e.u && e.actor !== 'persona').forEach(e => {
    (function hojas(d) { return d && d.tipo === 'varios' ? [].concat.apply([], (d.partes || []).map(hojas)) : [d]; })(e.d).filter(p => p && p.tipo === 'etiquetar' && p.qi && p.c && p.ms).forEach(p => {
      const x = por[p.c] = por[p.c] || { carpeta: p.c, correos: 0, sin_leer: 0, ejemplos: [] };
      x.correos += p.ms.length;
      x.sin_leer += p.ms.filter(m => m[2]).length;
      (p.ej || []).forEach(j => { if (x.ejemplos.length < 3 && !x.ejemplos.some(y => y.remitente === j[0])) x.ejemplos.push({ remitente: j[0], asunto: j[1], id_hilo: j[2] }); });
    });
  });
  const ls = Object.keys(por).map(k => por[k]).sort((a, b) => b.sin_leer - a.sin_leer || b.correos - a.correos).slice(0, 5);
  if (!ls.length) return null;
  const nombres = l => { const n = l.ejemplos.map(y => y.remitente).filter(Boolean); return n.length > 1 ? n.slice(0, -1).join(', ') + ' y ' + n[n.length - 1] : n[0] || ''; };
  ls.forEach(l => {
    const c = l.correos.toLocaleString('es-MX') + (l.correos === 1 ? ' correo' : ' correos');
    l.texto = l.carpeta.replace(/^\//, '') + ': ' + c + (l.sin_leer ? ' (' + (l.sin_leer === l.correos ? 'sin leer' : l.sin_leer + ' sin leer') + ')' : '') + (nombres(l) ? ', de ' + nombres(l) + (l.correos > l.ejemplos.length ? ' y otros' : '') : '') + '.';
  });
  return { desde: fecha_(desde), lineas: ls };
}

// ---------- ver_hoy ----------
function verHoy_(st, maximo, visita) {
  const ahora = Date.now();
  const hoy = dia_(ahora);
  const j = st.get('juicios', {});
  const fichas = st.get('fichas', []);
  // Juicios vivos, unidos a su hilo: remitente, nombre, asunto y ficha.
  // Lo que caducó sale de Hoy; lo que tiene próxima revisión se esconde hasta esa fecha.
  // El riesgo nunca se esconde; el riesgo y lo sensible tampoco se quedan fuera por el largo de Hoy.
  const esconde = h => j[h].revision > ahora && j[h].prioridad !== 'riesgo';
  const modoCaduca = decision_(st, 'caducidad');
  const escondidos = Object.keys(j).filter(h => !j[h].vencido && !j[h].caducado && esconde(h)).length;
  const ordenados = Object.keys(j).filter(h => !j[h].vencido && !j[h].caducado && !esconde(h)).sort((a, b) => (LECTURA.ORDEN[j[a].prioridad] - LECTURA.ORDEN[j[b].prioridad]) || j[b].t - j[a].t);
  const vivos = ordenados.filter((h, k) => k < LECTURA.MAX_JUICIOS_HOY || j[h].prioridad === 'riesgo' || j[h].sensible);
  // Con el tope diario de Google, Hoy sale con lo guardado: cada juicio sin los datos del correo y el aviso arriba.
  let filas;
  const crudos = {};
  try { filas = filasHilos_(vivos, crudos); }
  catch (err) { if (!esLimiteDiario_(err)) throw err; filas = vivos.map(h => ({ id_hilo: h, error: 'Google limitó por hoy las lecturas: sin los datos del correo.' })); }
  const movidoPorMotor = {};
  st.get('dinero', []).concat(st.get('por_juzgar', [])).forEach(x => { movidoPorMotor[x.h] = 1; });
  const porHilo = {};
  filas.forEach(f => { porHilo[f.id_hilo] = f; });
  // Lo que se juzgó sin leer el hilo se completa aquí, con lo que Hoy ya leyó.
  const completar = {};
  vivos.forEach(h => {
    const x = j[h], f = porHilo[h], t = crudos[h];
    if ((x.dh && x.ultimo) || !f || f.error || !t || !t.messages) return;
    const ms = sinBorradores_(t.messages), ult = ms[ms.length - 1];
    if (!ult) return;
    const juzgado = ms.filter(m => Number(m.internalDate) <= x.t).pop();
    completar[h] = { t: x.t, dh: x.dh ? undefined : { de: f.remitente, as: f.asunto, t: Number(ult.internalDate) }, ultimo: x.ultimo || !juzgado ? undefined : juzgado.id };
  });
  COMPLETAR_JUICIOS_ = Object.keys(completar).length ? completar : null;
  const juicios = vivos.map(h => {
    const x = j[h], f = porHilo[h];
    // Sin la lectura de Gmail, el juicio sale con los datos que guardó al juzgar; sin ellos, con sin_datos.
    if (!f || f.error) return f && f.error ? Object.assign({ id_hilo: h, prioridad: x.prioridad, recomendacion: x.recomendacion, motivo: x.motivo, resumen: x.resumen, tema_sensible: x.sensible || undefined,
      tema_sensible_por: x.sensible_por || undefined, error: f.error }, x.dh ? { remitente: x.dh.de, correo: correo_(x.dh.de), nombre: nombreDe_(x.dh.de), asunto: entidades_(x.dh.as || '(sin asunto)'),
      fecha: x.dh.t ? fecha_(x.dh.t) : undefined, datos_guardados: true, ficha: fichaCorta_(fichas, correo_(x.dh.de)) } : { sin_datos: true }) : null;
    // Fuera de la bandeja salen el riesgo y lo de media o más que movió el motor (documento de dinero o política con criterio):
    // ahí caen las cinco excepciones de dinero y lo que pide algo con fecha aunque no corra prisa.
    // Un aviso que Gmail mandó a spam y Opus no juzgó ruido también sale, con donde: 'spam', para que ella lo saque con un toque.
    const enSpam = f.donde === 'spam' && x.prioridad !== 'ruido';
    if (!f.en_bandeja && !enSpam && x.prioridad !== 'riesgo' && !((x.prioridad === 'alta' || x.prioridad === 'media') && movidoPorMotor[h])) return null;
    return { id_hilo: h, prioridad: x.prioridad, recomendacion: x.recomendacion, motivo: x.motivo, confianza: x.confianza, tema_sensible: x.sensible || undefined, tema_sensible_por: x.sensible_por || undefined,
      por: x.por, politica: x.politica || undefined, fecha_juicio: fecha_(x.t),
      remitente: f.remitente, correo: f.correo, nombre: f.nombre, asunto: f.asunto, extracto: f.extracto, fecha: f.fecha, sin_leer: f.sin_leer, en_bandeja: f.en_bandeja,
      ultimo_es_suyo: f.ultimo_es_suyo, donde: f.en_bandeja ? undefined : f.donde, ficha: fichaCorta_(fichas, f.correo), organizacion: organizacionDe_(fichas, f.correo),
      resumen: x.resumen, resumen_completo: x.resumen_completo, opcional: x.opcional, caduca: caducaDe_(x, modoCaduca) ? fecha_(caducaDe_(x, modoCaduca)) : undefined,
      conservar: x.conservar, sacar_de_spam: enSpam || undefined,
      opciones: (x.opciones || []).map((o, i, l) => ({ etiqueta: o.etiqueta, accion: o.accion, texto: o.texto, carpeta: o.carpeta, recomendada: o.recomendada || (i === 0 && !l.some(y => y.recomendada)) })) };
  }).filter(Boolean).filter((x, k) => !(k >= maximo) || x.prioridad === 'riesgo' || x.tema_sensible);
  // Avisos del día: los de aviso_en_hoy y una línea por política en Lo hace y me avisa, con [Bien] y [Deshacer].
  // Actividad trae hasta 30 días: solo lo de las últimas 26 horas pasa por dia_, que llama a Utilities.
  const act = st.get('actividad', []).filter(e => ahora - e.t < 26 * 3600000 && dia_(e.t) === hoy);
  const hhmm = t => Utilities.formatDate(new Date(t), tz_(), 'HH:mm');
  // avisos: lo que hizo una política en Lo hace y me avisa (con deshacer) y los correos que una política pidió avisar.
  const avisos = act.filter(e => e.aviso && e.politica).map(e => ({ id: e.id, texto: e.texto, hora: hhmm(e.t), politica: e.politica, deshacer: e.d && !e.u ? e.id : null, linea: 'aviso|' + e.politica + '|' + hoy }))
    .concat(st.get('avisos', []).filter(a => dia_(a.t) === hoy).slice(0, 40).map(a => ({ id: 'correo:' + a.m, texto: a.de + ': ' + a.as, hora: hhmm(a.t), politica: a.politica, deshacer: null,
      id_hilo: a.h, de: a.de, correo: a.co, asunto: a.as })));
  // Borradores del motor que siguen esperando en Gmail (Listo para enviar).
  const borradores = st.get('borradores_motor', []).filter(b => !b.enviado && !b.descartado && Date.now() - b.t < 3 * 86400000).map(b => {
    const e = st.get('actividad', []).filter(x => x.d && x.d.tipo === 'borrador' && x.d.dr === b.dr)[0];
    return e && e.u ? null : { id_hilo: b.h, id_borrador: b.dr, id_accion: e ? e.id : undefined, para: b.para, asunto: e ? (e.texto.match(/«(.*)»/) || [])[1] : undefined, texto: b.tx || undefined, creado: fecha_(b.t) };
  }).filter(Boolean);
  const pols = {};
  listaPoliticas_(st).forEach(p => { pols[p.id] = p; });
  const lineas = {};
  act.filter(e => e.aviso && e.politica).forEach(e => {
    const l = lineas[e.politica] = lineas[e.politica] || { id: 'aviso|' + e.politica + '|' + hoy, politica: e.politica, nombre: (pols[e.politica] || {}).nombre || e.politica, acciones: [], correos: 0, bien: true };
    l.acciones.push({ id_accion: e.id, texto: e.texto, hora: Utilities.formatDate(new Date(e.t), tz_(), 'HH:mm'), puede_deshacer: !!e.d && !e.u, deshecho: !!e.u || undefined });
    l.correos += (e.d && e.d.ms ? e.d.ms.length : 0);
    if (!e.bien) l.bien = false;
  });
  const seg = st.get('seguimientos', []);
  // La respuesta por confirmar va aparte: la otra parte contestó y Opus decide si cumplió, pospone o solo acusó recibo.
  const vencidos = seg.filter(s => seguimientoVencido_(s));
  const porConfirmar = seg.filter(s => porConfirmar_(s));
  const w = st.get('whatsapp', null);
  const pausa = st.get('pausa', null);
  const corr = st.get('corridas', []);
  const det = juicioDetenido_(st);
  const props = listaPropuestas_(st).filter(p => p.estado === 'abierta');
  const sinJuicio = (() => { try { const r = Gmail.Users.Threads.list('me', { q: 'in:inbox newer_than:2d', maxResults: 100 }); return (r.threads || []).filter(t => !j[t.id] || j[t.id].vencido).length; } catch (e) { return null; } })();
  // Lo sin juicio con la misma ventana y la misma lista que ver_novedades sin desde.
  const vn = ventanaNovedades_(st, ahora);
  const sinJuicioVentana = (() => { try { const p = pendientesNovedades_(vn.d, j, [2000]); return { n: p.pendientes.length, minimo: p.truncada }; } catch (e) { return null; } })();
  const ligas = ligasWebapp_();
  return {
    fecha: hoy,
    pausado: pausa && pausa.activo ? 'En pausa desde ' + fecha_(pausa.desde) + ': no toco tu correo; ni tus reglas ni Claude mueven nada.' : undefined,
    limite_diario: limiteDiarioVigente_(st) || undefined,
    juicio_detenido: det || undefined,
    resumen: juicios.filter(x => x.prioridad === 'riesgo').length + ' riesgo(s), ' + juicios.filter(x => x.prioridad === 'alta').length + ' de prioridad alta, ' +
      vencidos.length + ' seguimientos vencidos, ' + (porConfirmar.length ? porConfirmar.length + ' con respuesta por confirmar, ' : '') + props.length + ' propuestas abiertas (en ver_propuestas)' +
      (sinJuicioVentana && sinJuicioVentana.n ? ', ' + (sinJuicioVentana.minimo ? 'más de ' : '') + sinJuicioVentana.n + ' hilos sin juicio desde ' + fecha_(vn.d) : '') + '.',
    bandeja: bandejaDeHoy_(st, juicios),
    webapp_url: ligas.webapp_url, plan_url: ligas.plan_url,
    enterado: decision_(st, 'enterarse'),
    desde_tu_ultima_visita: desdeTuVisita_(st, visita),
    apartado: resumenApartado_(st, visita) || undefined,
    bandeja_inicial: bandejaInicialHoy_(st),
    instalacion: estadoInstalacion_(st),
    decisiones: { enterarse: decision_(st, 'enterarse'), pendientes: decision_(st, 'pendientes'), caducidad: modoCaduca, sin_leer: decision_(st, 'sin_leer'),
      seguridad: ((experiencia_(st) || {}).decisiones || {}).seguridad || null, carpeta_seguridad: MEMORIA.CARPETA_SEGURIDAD },
    escondidos_hasta_su_revision: escondidos || undefined,
    juicios: juicios,
    avisos: avisos,
    avisos_consentimiento: avisosConsentimiento_(st),
    borradores: borradores,
    temas_sensibles: sensiblesDe_(st).map(s => s.tema),
    opus_ultima_corrida: st.get('rutinas', {}).juicio ? fecha_(st.get('rutinas', {}).juicio) : null,
    // version es la de Instalacion.js que escribió cos desplegar (la que compara cos estado); motor, la del motor.
    ultima_corrida: (m => m ? { hora: fecha_(m.t), version: m.vi || m.v || 'anterior a 3.1.0', motor: m.v || 'anterior a 3.1.0' } : null)(corr.filter(c => c.quien === 'motor')[0]),
    lineas_avisa: Object.keys(lineas).map(k => lineas[k]),
    hecho_hoy: act.filter(e => !e.aviso).slice(0, 20).map(e => ({ id_accion: e.id, hora: Utilities.formatDate(new Date(e.t), tz_(), 'HH:mm'), texto: e.texto, actor: e.actor, politica: e.politica || undefined, puede_deshacer: !!e.d && !e.u })),
    seguimientos_vencidos: vencidos.map(filaSeguimiento_),
    seguimientos_por_confirmar: porConfirmar.length ? porConfirmar.map(filaSeguimiento_) : undefined,
    seguimientos_abiertos: seg.filter(s => s.estado === 'abierto' && !porConfirmar_(s) && s.vence >= Date.now() && !(s.revision > Date.now())).slice(0, 20).map(filaSeguimiento_),
    whatsapp: w && w.t ? { hora_lectura: fecha_(w.t), hace: antiguedad_(w.t), ultimo_intento: intentoWhatsapp_(w) || undefined, necesitan_respuesta: w.chats.filter(x => x.nr).slice(0, 10).map(filaChat_) }
      : { hora_lectura: null, ultimo_intento: intentoWhatsapp_(w) || undefined, nota: 'Todavía no hay lectura de WhatsApp.' },
    propuestas_abiertas: props.length,
    sin_juicio: sinJuicioVentana ? sinJuicioVentana.n : undefined, sin_juicio_desde: fecha_(vn.d), sin_juicio_es_minimo: sinJuicioVentana && sinJuicioVentana.minimo || undefined,
    sin_juicio_2_dias: sinJuicio === null ? undefined : sinJuicio,
    error_sin_juicio: sinJuicio === null || !sinJuicioVentana ? 'No pude contar lo sin juicio ahora.' : undefined,
    corridas: corr.slice(0, 6).map(c => ({ hora: fecha_(c.t), hace: antiguedad_(c.t), quien: c.quien, segundos: c.s, llamadas: c.llamadas, resultado: c.resultado })),
    rutinas_que_faltaron_hoy: (() => { const f = rutinasQueFaltaron_(st); return f.length ? f : undefined; })(),
    conexion: conexionClaude_(st) || undefined,
    cupo_diario: cupoDiario_() || undefined,
    correo_sin_revisar: avisoColaRecortada_(st) || undefined,
    experiencia: filaExperiencia_(experiencia_(st)),
    como_leer: 'desde_tu_ultima_visita: lo que hicieron las políticas desde la visita anterior, una línea por política; empieza la plática con su total en una frase. [Bien] de una línea en avisa es responder(id de la línea, "Bien") y [Deshacer] de la línea es deshacer(id de la línea), que regresa todas sus acciones en una llamada (si trae quedan, se llama otra vez igual). juicios: lo que Opus juzgó, unido al hilo y a la ficha, con opciones para tocar; si Gmail no dejó leer el hilo, trae error y los datos que guardó al juzgar (datos_guardados) o sin_datos: true, y se completa en la siguiente visita. lineas_avisa: una por política en Te aviso; [Bien] es responder(id de la línea, "Bien") y [Deshacer] es deshacer(id_accion). Las propuestas van en ver_propuestas({estado: "abierta"}).'
  };
}

// [Bien] de una línea de aviso: cuenta como aceptadas explícitas las acciones de esa línea.
function bienLinea_(st, id) {
  const x = String(id).split('|');
  const politica = x[1], dia = x[2];
  const act = st.get('actividad', []);
  // "v<ms>": la línea de la vista acumulada desde esa visita.
  const t0 = /^v\d+$/.test(dia || '') ? Number(dia.slice(1)) : null;
  const es = act.filter(e => e.politica === politica && !e.u && (t0 !== null ? e.t > t0 && e.d && e.actor !== 'persona' : e.aviso && dia_(e.t) === dia));
  // Lo que ya salió de Actividad y sigue en la línea: [correos, correos sin Bien] (contarPodadas_).
  const pod = t0 !== null ? ((st.get('actividad_podada', {}) || {})[t0] || {})[politica] : null;
  if (!es.length && !pod) throw new Error('No hay acciones de ' + politica + (t0 !== null ? ' desde esa visita' : ' del ' + dia) + ' en esa línea.');
  const nuevas = es.filter(e => !e.bien);
  if (!nuevas.length && !(pod && pod[1])) return { hecho: 'Esa línea ya estaba marcada como bien.', id: id, repetida: true };
  let n = 0;
  nuevas.forEach(e => { e.bien = 1; e.obs = 1; n += e.d && e.d.ms ? e.d.ms.length : 1; });
  if (pod && pod[1]) { n += pod[1]; pod[1] = 0; st.tocar('actividad_podada'); }
  st.set('actividad', act);
  sumarMetrica_(st, politica, 'a', n);
  anotarSenal_(st, { tipo: 'respondio_propuesta', politica: politica, detalle: id + ': Bien (' + n + ' correos)' });
  return { hecho: 'Anoté que está bien lo que hizo ' + politica + (t0 !== null ? ' desde tu última visita' : ' hoy') + ': ' + n + ' correo' + (n === 1 ? '' : 's') + ' como aceptados.', id: id, aceptadas: n };
}

// ---------- ver_novedades(desde): lo nuevo de la bandeja sin juicio ----------
function verNovedades_(st, desde) {
  const t0 = Date.now();
  const N = LECTURA.NOVEDADES;
  // Sin desde: no se usa la hora del último juicio (un juicio de prueba o una corrida que juzga 24 de 40 dejaba fuera lo
  // pendiente). La ventana arranca en novedades_piso, el momento en que todo lo anterior ya tenía juicio; sin piso, 14 días.
  const vn = ventanaNovedades_(st, t0), dOmision = vn.d;
  let d;
  const s = String(desde === undefined || desde === null ? '' : desde).trim();
  if (!s) d = dOmision;
  else if (/^\d+h$/.test(s)) d = Date.now() - Number(s.slice(0, -1)) * 3600000;
  else {
    const z = Utilities.formatDate(new Date(), tz_(), 'XXX');
    d = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(s) ? s + 'T00:00:00' + z : (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s) ? s.replace(' ', 'T') + ':00' + z : s));
    if (!isFinite(d)) throw new Error('No entiendo desde: ' + desde + '. Usa AAAA-MM-DD HH:mm, AAAA-MM-DD o horas (6h).');
  }
  const juicios = st.get('juicios', {});
  // Todas las páginas de la ventana (hasta N.PAGINAS); antes solo la primera, y con 120 hilos se perdían 20.
  const pn = pendientesNovedades_(d, juicios), todos = pn.todos, truncada = pn.truncada, pendientes = pn.pendientes;
  const ctx = contextoEvaluacion_(st, {}, t0);
  ctx.conocidos = st.get('conocidos', {});
  // Se lee en tandas de 25 hasta juntar N.POR_LLAMADA hilos que se juzgan: una nota de la persona a sí misma no ocupa
  // lugar ni tapa el correo que sigue (antes, 25 notas recientes dejaban fuera todo lo demás).
  const ruta = id => 'threads/' + id + '?format=metadata&' + ENCABEZADOS.map(h => 'metadataHeaders=' + encodeURIComponent(h)).join('&') +
    '&fields=' + encodeURIComponent('id,messages(id,threadId,labelIds,snippet,internalDate,payload/headers)');
  const ids = [], datos = [];
  let leidos = 0, soloPersona = 0;
  while (ids.length < N.POR_LLAMADA && leidos < pendientes.length && leidos < N.LECTURAS_MAX) {
    const tanda = pendientes.slice(leidos, leidos + N.POR_LLAMADA);
    leidos += tanda.length;
    gmailFetchAll_(tanda.map(ruta), 25).forEach((t, k) => {
      if (t && !sinBorradores_(t.messages).some(m => !tiene_(m, 'SENT'))) { soloPersona++; return; }
      if (ids.length < N.POR_LLAMADA) { ids.push(tanda[k]); datos.push(t); }
    });
  }
  // Primera vez en 90 días, por remitente y por dominio, antes del último mensaje de cada hilo.
  const yo = yo_();
  const pv = {}, rutas = [], claves = [];
  datos.forEach(t => {
    if (!t) return;
    const r = sinBorradores_(t.messages).filter(m => !tiene_(m, 'SENT'));
    if (!r.length) return;
    const m = r[r.length - 1], de = correo_(cabeceras_(m).from || ''), d = dominio_(de), antes = Math.floor(Number(m.internalDate) / 1000) - 60;
    if (!de || de === yo || pv['r:' + de] !== undefined) return;
    pv['r:' + de] = null;
    [['r:' + de, 'from:' + de], ['d:' + d, 'from:@' + d]].forEach(x => { if (rutas.length < 50) { claves.push(x[0]); rutas.push('messages?maxResults=1&fields=messages/id&q=' + encodeURIComponent(x[1] + ' before:' + antes + ' after:' + (antes - 90 * 86400))); } });
  });
  gmailFetchAll_(rutas, 25).forEach((r, k) => { pv[claves[k]] = r ? !(r.messages && r.messages.length) : null; });
  const auth = v => { const s = String(v || '').toLowerCase(); const x = n => { const m = s.match(new RegExp('\\b' + n + '=(\\w+)')); return m ? m[1] : null; };
    if (!s) return null; const a = { spf: x('spf'), dkim: x('dkim'), dmarc: x('dmarc') }; return a.spf === 'pass' && a.dkim === 'pass' && a.dmarc === 'pass' ? 'pass' : a; };
  const msgIds = [];
  datos.forEach(t => { if (t) sinBorradores_(t.messages).forEach(m => msgIds.push(m.id)); });
  consultasPara_(ctx, msgIds, 3);
  const corr = corresponsalesCache_(st, yo_(), t0, false).mapa || {};
  const hilos = [];
  ids.forEach((id, k) => {
    const t = datos[k];
    if (!t) { hilos.push({ id_hilo: id, error: 'No se pudo leer ahora.' }); return; }
    const x = decisionHilo_(t, ctx);
    // Solo mensajes de la persona (una nota a sí misma): no hay nada que juzgar y no cuenta como pendiente.
    if (!x.m) { soloPersona++; return; }
    const m = x.m;
    const de = correo_(m.h['From']);
    // Lo que vale false, null o vacío no viene (corresponsal, conocido, ficha, lista, plataforma, etiquetas, politica):
    // cada hilo pesaba 20% más por campos vacíos.
    const etq = (m.labelIds || []).filter(e => /^Label_/.test(e)).map(e => ctx.nombres[e]).filter(Boolean);
    const pv1 = pv['r:' + de], pv2 = pv['d:' + dominio_(de)];
    hilos.push({ id_hilo: id, remitente: m.h['From'] || '', correo: de, asunto: entidades_(cabeceras_(x.ms[0]).subject || '(sin asunto)').slice(0, 120), fecha: fecha_(m.internalDate),
      extracto: entidades_(m.snippet || '').slice(0, 300), corresponsal: !!corr[de] || undefined, conocido: conocidoPorElla_(st, de) || undefined, ficha: fichaCorta_(ctx.fichas, de) || undefined,
      categoria_gmail: categoriaGmail_(m.labelIds), lista: listId_(m) || undefined, baja: tipoBaja_(m.h), plataforma: plataforma_(m.h) || undefined,
      etiquetas: etq.length ? etq : undefined,
      decision_motor: x.dec.accion === 'actua' ? textoAcciones_(x.dec.acciones, st) : (x.dec.espera ? 'espera tu juicio' : 'queda'), politica: x.dec.politica || undefined, motivo: x.dec.motivo,
      tema_sensible: x.dec.hechos && x.dec.hechos.sensible || undefined, tema_sensible_por: x.dec.hechos && x.dec.hechos.sensible_por || undefined, sin_leer: tiene_(m, 'UNREAD'), mensajes: x.ms.length, la_persona_escribio: x.ms.some(y => tiene_(y, 'SENT')) || undefined,
      autenticacion: auth(m.h['Authentication-Results']), responder_a: m.h['Reply-To'] && correo_(m.h['Reply-To']) !== de ? m.h['Reply-To'] : undefined,
      // Solo cuando el remitente o su dominio escriben por primera vez; null si no se pudo saber.
      primera_vez_en_90_dias: pv1 === undefined ? undefined : pv1 === null ? null : pv1 || pv2 ? { remitente: pv1, dominio: pv2 } : undefined });
  });
  const segs = st.get('seguimientos', []);
  const hoy = dia_(Date.now());
  // Un seguimiento con respuesta por confirmar no cuenta como vencido: la otra parte sí contestó.
  const vencidos = segs.filter(x => seguimientoVencido_(x));
  // Seguimientos con una respuesta que el motor no puede calificar: Opus decide si cumple, pospone o solo acusa recibo.
  const porConfirmar = segs.filter(x => porConfirmar_(x));
  const dinero = documentosDinero_(st, juicios, ctx.nombres, t0);
  const conCriterio = movidosConCriterio_(st, juicios, ctx.nombres, dinero);
  const sinJuicio = pendientes.length - soloPersona;
  // El piso avanza solo cuando la ventana completa quedó sin pendientes, cubría el piso anterior y ninguna lectura falló.
  // Sin piso, la ventana es de 14 días hasta que todo tenga juicio. ver_novedades es lectura y su almacén no se guarda:
  // el piso se escribe aparte con el candado.
  const fallas = hilos.filter(h => h.error).length;
  if (!truncada && d <= dOmision && sinJuicio === 0 && fallas === 0) { try { conCandado_(s2 => s2.set('novedades_piso', { t: t0, v: 2 }), 5000); } catch (e) {} }
  return { desde: fecha_(d),
    conteos: { sin_juicio: sinJuicio, seguimientos_vencen_hoy: segs.filter(x => x.estado === 'abierto' && !porConfirmar_(x) && dia_(x.vence) === hoy).length, seguimientos_vencidos: vencidos.length,
      seguimientos_por_confirmar: porConfirmar.length,
      politicas_en_borrador: listaPoliticas_(st).filter(p => p.estado === 'borrador').length, propuestas_abiertas: listaPropuestas_(st).filter(p => p.estado === 'abierta').length,
      documentos_de_dinero: dinero.length, movidos_con_criterio: conCriterio.length },
    hilos: hilos, sin_juicio_en_total: sinJuicio, quedan_por_leer: Math.max(0, pendientes.length - soloPersona - ids.length) || undefined,
    sin_juicio_es_minimo: truncada ? 'Revisé ' + todos.length + ' hilos de la ventana y hay más: el total es mayor. Juzga estos y vuelve a llamar.' : undefined,
    solo_mensajes_de_la_persona: soloPersona || undefined,
    esperan_tu_juicio: Object.keys(st.get('en_espera', {})).length || undefined,
    documentos_de_dinero: dinero.length ? dinero : undefined,
    movidos_con_criterio: conCriterio.length ? conCriterio : undefined,
    seguimientos_vencidos: vencidos.length ? vencidos.map(filaSeguimiento_) : undefined,
    seguimientos_por_confirmar: porConfirmar.length ? porConfirmar.map(filaSeguimiento_) : undefined };
}

// Lo que movió una política con criterio y Opus no ha juzgado, con dónde quedó y el criterio que le toca aplicar.
function movidosConCriterio_(st, juicios, nombres, yaListados) {
  const fuera = {};
  (yaListados || []).forEach(x => { fuera[x.id_hilo] = 1; });
  const vistos = {};
  const pend = st.get('por_juzgar', []).filter(x => !fuera[x.h] && (!juicios[x.h] || juicios[x.h].vencido || juicios[x.h].t < x.mv))
    .filter(x => { if (vistos[x.h]) return false; vistos[x.h] = 1; return true; }).slice(0, LECTURA.MAX_DINERO);
  if (!pend.length) return [];
  const pols = {};
  listaPoliticas_(st).forEach(p => { pols[p.id] = p; });
  const hilos = gmailFetchAll_(pend.map(x => 'threads/' + x.h + '?format=minimal&fields=' + encodeURIComponent('messages(id,labelIds)')), 25);
  return pend.map((x, k) => {
    const t = hilos[k];
    const labels = t && t.messages ? t.messages.reduce((a, m) => a.concat(m.labelIds || []), []) : [];
    const carpeta = labels.filter(e => /^Label_/.test(e)).map(e => nombres[e]).filter(Boolean).map(n => esEtiquetaCos_(n) ? relativaCos_(n) : n)[0];
    const donde = !t ? 'no se pudo leer' : labels.indexOf('TRASH') >= 0 ? 'papelera' : labels.indexOf('SPAM') >= 0 ? 'spam' : labels.indexOf('INBOX') >= 0 ? 'bandeja' : carpeta ? 'carpeta ' + carpeta : 'archivado';
    const p = pols[x.pol];
    return { id_hilo: x.h, remitente: x.de ? x.de + ' <' + x.co + '>' : x.co, correo: x.co, asunto: x.as, fecha: fecha_(x.t), movido: fecha_(x.mv), donde: donde,
      politica: x.pol, criterio: p ? corto_(p.criterio, 300) : null };
  });
}

// Documentos de dinero sin juicio, estén donde estén, con los cobros del mismo remitente en 90 días: con eso Opus
// revisa las cinco excepciones (cuenta nueva, monto raro, primer cobro, pago por vencer, cargo que no reconoce).
function documentosDinero_(st, juicios, nombres, t0) {
  const l = st.get('dinero', []).filter(x => !juicios[x.h] || juicios[x.h].vencido || juicios[x.h].t < x.t);
  const vistos = {};
  const pend = l.filter(x => { if (vistos[x.h]) return false; vistos[x.h] = 1; return true; }).slice(0, LECTURA.MAX_DINERO);
  if (!pend.length) return [];
  const hilos = gmailFetchAll_(pend.map(x => 'threads/' + x.h + '?format=minimal&fields=' + encodeURIComponent('messages(id,labelIds)')), 25);
  // Los cobros anteriores a cada documento, en los 90 días previos: sin ninguno, es su primer cobro.
  const q = x => { const antes = Math.floor(x.t / 1000) - 1; return 'threads?maxResults=50&includeSpamTrash=true&fields=' + encodeURIComponent('threads/id,nextPageToken') + '&q=' +
    encodeURIComponent('from:' + x.co + ' after:' + (antes - 90 * 86400) + ' before:' + antes + ' {' + LECTURA.PALABRAS_COBRO + '}'); };
  const cobros = {};
  gmailFetchAll_(pend.map(q), 25).forEach((r, k) => { cobros[pend[k].h] = r ? { ids: (r.threads || []).map(t => t.id), mas: !!r.nextPageToken } : null; });
  return pend.map((x, k) => {
    const t = hilos[k];
    const labels = t && t.messages ? t.messages.reduce((a, m) => a.concat(m.labelIds || []), []) : [];
    const carpeta = labels.filter(e => /^Label_/.test(e)).map(e => nombres[e]).filter(n => n && esEtiquetaCos_(n)).map(relativaCos_)[0];
    const donde = !t ? 'no se pudo leer' : labels.indexOf('TRASH') >= 0 ? 'papelera' : labels.indexOf('SPAM') >= 0 ? 'spam' : labels.indexOf('INBOX') >= 0 ? 'bandeja' : carpeta ? 'carpeta ' + carpeta : 'archivado';
    const c = cobros[x.h];
    const otros = c ? c.ids.filter(id => id !== x.h) : null;
    return { id_hilo: x.h, remitente: x.de ? x.de + ' <' + x.co + '>' : x.co, correo: x.co, asunto: x.as, fecha: fecha_(x.t), donde: donde,
      cobros_90d: otros ? { cuantos: otros.length, hay_mas: c.mas || undefined, ultimos: otros.slice(0, 3), primer_cobro: !otros.length } : { error: 'No se pudo buscar ahora.' } };
  });
}

// ---------- leer_hilo(id_hilo) ----------
// Un mensaje largo conserva el principio y el final, porque en unas notas de junta los próximos pasos vienen al final; lo
// de en medio se pide con id_mensaje y desde, por páginas de LEER.PAGINA caracteres.
const LEER = { MAX: 4000, CABEZA: 3000, COLA: 1000, PAGINA: 8000 };
// Antes de cortar se quitan las ligas de rastreo entre paréntesis «( https://… )» y los caracteres invisibles que meten
// algunos asistentes de notas: en unas notas de Read.ai eran 2,613 de los primeros 4,000 caracteres.
function sinRastreo_(tx) {
  return String(tx || '').replace(/[\u034F\u200B-\u200D\u2060\uFEFF\u00AD]/g, '').replace(/[ \t]*\(\s*https?:\/\/[^\s()]+\s*\)/g, '')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
}
function leerHilo_(st, hilo, idMensaje, desde) {
  const t = gmailFetchAll_(['threads/' + encodeURIComponent(hilo) + '?format=full'], 1)[0];
  // Si Gmail lo limitó, no es que falte el hilo.
  if (!t && LOTE_GMAIL.limitadas) throw new Error(LOTE_GMAIL.minuto ? MINUTO_GMAIL.TEXTO : 'Gmail no respondió a tiempo; vuelve a llamar leer_hilo en un momento.');
  if (!t) throw new Error('No encontré el hilo ' + hilo + '. Usa el id_hilo que dan ver_hoy, ver_novedades o buscar.');
  const ms = sinBorradores_(t.messages);
  const max = 20;
  const asunto = ms.length ? (cabeceras_(ms[0]).subject || '(sin asunto)') : '(sin mensajes)';
  const ultimos = ms.slice(-max);
  // Primera vez: si el remitente o su dominio no escribieron antes de ese mensaje en 90 días.
  const yo = yo_();
  const consultas = [], claves = [];
  ultimos.filter(m => !tiene_(m, 'SENT')).forEach(m => {
    const de = correo_(cabeceras_(m).from), d = dominio_(de), antes = Math.floor(Number(m.internalDate) / 1000) - 60;
    if (!de || de === yo) return;
    [['r:' + de, 'from:' + de], ['d:' + d, 'from:@' + d]].forEach(x => {
      claves.push(x[0] + '|' + m.id);
      consultas.push('messages?maxResults=1&fields=messages/id&q=' + encodeURIComponent(x[1] + ' before:' + antes + ' after:' + (antes - 90 * 86400)));
    });
  });
  const vistas = {};
  let errorPrimera;
  if (consultas.length <= 16) gmailFetchAll_(consultas, 16).forEach((r, k) => { vistas[claves[k]] = r ? !!(r.messages && r.messages.length) : null; });
  else errorPrimera = 'Hay demasiados remitentes en el hilo para medir la primera vez.';
  const auth = v => {
    const s = String(v || '').toLowerCase();
    const de = x => { const m = s.match(new RegExp('\\b' + x + '=(\\w+)')); return m ? m[1] : null; };
    return s ? { spf: de('spf'), dkim: de('dkim'), dmarc: de('dmarc') } : undefined;
  };
  const salida = ultimos.map(m => {
    const h = cabeceras_(m);
    const c = contenido_(m.payload);
    const tx = sinRastreo_(sinCitas_(c.texto));
    const de = correo_(h.from), ajeno = !tiene_(m, 'SENT');
    const pv = k => vistas[k + '|' + m.id];
    return { id_mensaje: m.id, de: h.from || '', de_direccion: de || undefined, nombre_mostrado: ajeno ? nombreDe_(h.from) : undefined,
      responder_a: h['reply-to'] && correo_(h['reply-to']) !== de ? h['reply-to'] : undefined,
      autenticacion: ajeno ? auth(h['authentication-results']) : undefined,
      primera_vez_en_90_dias: ajeno && de !== yo && pv('r:' + de) !== undefined && pv('r:' + de) !== null ? { remitente: pv('r:' + de) === false, dominio: pv('d:' + dominio_(de)) === false } : undefined,
      para: h.to || '', cc: h.cc || undefined, fecha: fecha_(m.internalDate),
      es_suyo: tiene_(m, 'SENT'), sin_leer: tiene_(m, 'UNREAD'), adjuntos: c.adjuntos.length ? c.adjuntos : undefined, ...textoLeido_(tx, idMensaje ? desde : null) };
  });
  const ultRec = ultimos.filter(m => !tiene_(m, 'SENT')).slice(-1)[0];
  const sensD = sensibleDetalle_(asunto + ' ' + salida.map(x => x.texto.slice(0, 600)).join(' '), st, asunto, !!ultRec && masivo_(ultRec, st));
  const sens = sensD ? sensD.tema : null;
  const j = st.get('juicios', {})[hilo];
  const ultAjeno = salida.filter(x => !x.es_suyo).slice(-1)[0];
  return { id_hilo: hilo, asunto: asunto, mensajes_total: ms.length, omitidos_por_antiguedad: Math.max(0, ms.length - max) || undefined,
    tema_sensible: sens ? sens + ': se propone; no actúes solo' : undefined, tema_sensible_por: sensD || undefined,
    juicio: j && !j.vencido ? { prioridad: j.prioridad, recomendacion: j.recomendacion, motivo: j.motivo, por: j.por } : undefined,
    ficha: ultAjeno && ultAjeno.de_direccion ? fichaCorta_(st.get('fichas', []), ultAjeno.de_direccion) : undefined,
    error_primera_vez: errorPrimera, mensajes: idMensaje ? soloMensaje_(salida, idMensaje) : salida };
}

// El texto de un mensaje: completo hasta LEER.MAX; si pasa, principio, aviso de lo omitido y final. Con desde (al pedir un
// mensaje por su id), la página que empieza ahí.
function textoLeido_(tx, desde) {
  if (desde !== null && desde !== undefined) {
    const d = Math.min(Math.max(0, desde), tx.length), fin = d + LEER.PAGINA;
    return { texto: tx.slice(d, fin), desde: d, caracteres: tx.length, siguiente_desde: fin < tx.length ? fin : undefined };
  }
  if (tx.length <= LEER.MAX) return { texto: tx };
  const omitidos = tx.length - LEER.CABEZA - LEER.COLA;
  return { texto: tx.slice(0, LEER.CABEZA) + '\n[… ' + omitidos + ' caracteres sin mostrar: pide leer_hilo con id_mensaje y desde ' + LEER.CABEZA + ' …]\n' + tx.slice(-LEER.COLA),
    recortado: true, caracteres: tx.length, omitido: { desde: LEER.CABEZA, caracteres: omitidos } };
}
function soloMensaje_(salida, id) {
  const l = salida.filter(x => x.id_mensaje === id);
  if (!l.length) throw new Error('El hilo no trae el mensaje ' + id + ' entre sus últimos 20. Usa un id_mensaje de leer_hilo.');
  return l;
}

// ---------- buscar(consulta, maximo) ----------
// Hasta 25 hilos por llamada y sin páginas. Si la petición pide más, la respuesta lo dice con recortado y el máximo que aplicó.
const MAX_BUSCAR = 25;
function buscar_(st, consulta, maximo, pedido) {
  const max = Math.min(Math.max(1, maximo || 10), MAX_BUSCAR);
  const l = listaHilos_(consulta, max);
  const r = { consulta: consulta, hilos: conJuicio_(st, l.filas), hay_mas: l.hay_mas || undefined };
  const fallidos = l.filas.filter(f => f.error).length;
  if (fallidos) r.reintentar = fallidos + ' de ' + l.filas.length + ' hilos no se pudieron leer ahora (Gmail tardó o limitó). Repite la misma búsqueda en un minuto; los demás ya están completos.';
  if (pedido > MAX_BUSCAR) {
    r.recortado = true;
    r.maximo_aplicado = MAX_BUSCAR;
    r.nota = 'Pediste ' + pedido + ' hilos; buscar da hasta ' + MAX_BUSCAR + ' por llamada y no tiene páginas. Para ver más, acota la consulta con fechas (after:AAAA/MM/DD, before:AAAA/MM/DD) y llama otra vez.' +
      ' El total de enviados de 90 días y a quién escribe la persona vienen en analizar_bandeja (enviados_90d).';
  }
  return r;
}

// ---------- ver_agenda(dias): solo con Juntas encendida ----------
// El permiso de calendario se agrega al encender Juntas; sin él, la respuesta lo dice y no falla en silencio.
function verAgenda_(st, dias) {
  const p = listaPoliticas_(st).filter(x => x.id === 'juntas')[0];
  if (!p || p.estado !== 'activa' || p.nivel === 'apagado') return { disponible: false, motivo: 'La función Juntas está apagada. Se enciende con cambiar_politica("juntas") y pide el permiso de calendario.', eventos: [] };
  const ini = new Date(), fin = new Date(Date.now() + dias * 86400000);
  const url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=50&timeMin=' + encodeURIComponent(ini.toISOString()) +
    '&timeMax=' + encodeURIComponent(fin.toISOString()) + '&fields=' + encodeURIComponent('items(id,summary,start,end,location,attendees(email,displayName,responseStatus,self),organizer(email,displayName,self),hangoutLink,status)');
  const r = gmailGet_(url);
  const c = r.getResponseCode();
  if (c === 401 || c === 403) return { disponible: false, motivo: 'Falta el permiso de calendario (calendar.readonly). Se agrega al encender Juntas: pídele a Claude que la encienda; obliga a reautorizar.', codigo: c, eventos: [] };
  if (c !== 200) return { disponible: false, motivo: 'Calendar respondió ' + c + '.', eventos: [] };
  const fichas = st.get('fichas', []);
  const ev = (JSON.parse(r.getContentText()).items || []).filter(e => e.status !== 'cancelled').map(e => ({
    id: e.id, titulo: e.summary || '(sin título)', inicio: e.start && (e.start.dateTime || e.start.date), fin: e.end && (e.end.dateTime || e.end.date), lugar: e.location || undefined,
    todo_el_dia: !!(e.start && e.start.date && !e.start.dateTime), mi_respuesta: ((e.attendees || []).filter(a => a.self)[0] || {}).responseStatus || (e.organizer && e.organizer.self ? 'organizador' : null),
    liga: e.hangoutLink || undefined, organizador: e.organizer ? e.organizer.email : undefined,
    asistentes: (e.attendees || []).filter(a => !a.self).slice(0, 15).map(a => ({ correo: a.email, nombre: a.displayName || undefined, respuesta: a.responseStatus, ficha: fichaCorta_(fichas, a.email) || undefined }))
  }));
  return { disponible: true, dias: dias, eventos: ev };
}

// ---------- WhatsApp (sin cambios de fondo desde v2) ----------
function guardarWhatsapp_(st, chats, estado) {
  estado = estado === undefined || estado === null || estado === '' ? 'ok' : String(estado);
  if (LECTURA.ESTADOS_WHATSAPP.indexOf(estado) < 0) throw new Error('estado vale ' + LECTURA.ESTADOS_WHATSAPP.join(', ') + '.');
  const w = st.get('whatsapp', null) || { t: null, chats: [] };
  const ahora = Date.now();
  // Un intento fallido solo anota la hora y el estado; los chats de la última lectura buena se quedan.
  if (estado !== 'ok') {
    w.ui = { t: ahora, e: estado };
    st.set('whatsapp', w);
    return { hecho: 'Anoté el intento de las ' + Utilities.formatDate(new Date(ahora), tz_(), 'HH:mm') + ' (' + estado + '). Conservo la última lectura buena' +
      (w.t ? ', de ' + fecha_(w.t) + ', con ' + w.chats.length + ' chats.' : '; todavía no hay ninguna.'), hora_lectura: w.t ? fecha_(w.t) : null, ultimo_intento: { hora: fecha_(ahora), estado: estado } };
  }
  if (typeof chats === 'string') { try { chats = JSON.parse(chats); } catch (e) { chats = null; } }
  if (!Array.isArray(chats)) throw new Error('Falta chats: una lista de {chat, es_grupo, no_leidos, ultimo_mensaje_fecha, resumen, necesita_respuesta, compromiso}.');
  const t = v => v === undefined || v === null ? undefined : String(v).trim();
  const filas = chats.map(c => {
    const nombre = t(c && c.chat);
    if (!nombre) throw new Error('Cada chat necesita el campo chat (el nombre como sale en WhatsApp).');
    const texto = t(c.ultimo_mensaje_fecha) || '';
    // Una fecha sin hora (AAAA-MM-DD) se guarda y se devuelve igual.
    const soloDia = /^\d{4}-\d{2}-\d{2}$/.test(texto);
    const f = soloDia ? NaN : Date.parse(texto);
    return { c: nombre.slice(0, 80), g: c.es_grupo === true || c.es_grupo === 'true' ? 1 : 0, n: Math.max(0, Math.round(Number(c.no_leidos) || 0)),
      f: isFinite(f) ? f : null, fx: isFinite(f) ? undefined : texto.slice(0, 40) || undefined,
      r: (t(c.resumen) || '').slice(0, 300), nr: c.necesita_respuesta === true || c.necesita_respuesta === 'true' ? 1 : 0, co: (t(c.compromiso) || '').slice(0, 200) || undefined };
  });
  // Si llegan más de 60, se quedan primero los que necesitan respuesta y luego los más recientes.
  const orden = x => x.f || (x.fx && /^\d{4}-\d{2}-\d{2}$/.test(x.fx) ? Date.parse(x.fx + 'T23:59:59Z') : 0);
  filas.sort((a, b) => b.nr - a.nr || orden(b) - orden(a));
  const guardados = filas.slice(0, LECTURA.MAX_CHATS);
  st.set('whatsapp', { t: ahora, chats: guardados, ui: { t: ahora, e: 'ok' } });
  return { hecho: 'Guardé la lectura de WhatsApp: ' + guardados.length + ' chats, ' + guardados.filter(x => x.nr).length + ' necesitan respuesta.', chats: guardados.length,
    omitidos: filas.length - guardados.length || undefined, hora_lectura: fecha_(ahora), ultimo_intento: { hora: fecha_(ahora), estado: 'ok' } };
}

function filaChat_(x) {
  return { chat: x.c, es_grupo: !!x.g, no_leidos: x.n, ultimo_mensaje_fecha: x.f ? fecha_(x.f) : x.fx, resumen: x.r, necesita_respuesta: !!x.nr, compromiso: x.co };
}

function intentoWhatsapp_(w) {
  return w && w.ui ? { hora: fecha_(w.ui.t), estado: w.ui.e } : null;
}

// como_leer {pasos, script}: los pasos y el script de la lectura en vivo de WhatsApp. Llegan en
// Textos.js y ScriptWhatsapp.js, generados desde su fuente; una versión guardada en el almacén (admin como_leer) manda.
function comoLeerWhatsapp_(st) {
  const g = st.get('como_leer_whatsapp', null) || {};
  const pasos = g.pasos || (typeof COMO_LEER_PASOS === 'string' ? COMO_LEER_PASOS : '');
  const script = g.script || (typeof SCRIPT_WHATSAPP === 'string' ? SCRIPT_WHATSAPP : '');
  return { pasos: pasos || null, script: script || null, version: g.t ? fecha_(g.t) : 'la del despliegue',
    error: !pasos || !script ? 'Falta ' + [!pasos ? 'pasos' : '', !script ? 'script' : ''].filter(Boolean).join(' y ') + ' de la lectura en vivo.' : undefined };
}

function verWhatsapp_(st) {
  const w = st.get('whatsapp', null);
  const como = comoLeerWhatsapp_(st);
  if (!w || !w.t) return { hora_lectura: null, chats: [], ultimo_intento: intentoWhatsapp_(w), nota: 'Todavía no hay lectura de WhatsApp.', como_leer: como };
  return { hora_lectura: fecha_(w.t), hace: antiguedad_(w.t), ultimo_intento: intentoWhatsapp_(w), chats: w.chats.map(filaChat_), necesitan_respuesta: w.chats.filter(x => x.nr).length, como_leer: como };
}
