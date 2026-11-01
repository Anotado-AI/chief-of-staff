// --- Hechos: lo que pasó ---
// Actividad con deshacer, señales, juicios, seguimientos, corridas y conflictos. Los escribe el motor.

// Quién llama en esta ejecución: mcp (Claude y las rutinas de Opus), webapp (la persona) o motor (activador).
let VIA = 'motor';
function actor_() { return VIA === 'webapp' ? 'persona' : VIA === 'mcp' ? 'opus' : 'motor'; }
function canal_() { return VIA === 'webapp' ? 'webapp' : VIA === 'mcp' ? 'claude' : 'gmail'; }

const HECHOS = {
  TIPOS: ['senales', 'juicios', 'seguimientos', 'actividad', 'corridas', 'conflictos', 'bandeja'],
  SENALES: ['abrio', 'respondio', 'estrella', 'rescate', 'borro_sin_abrir', 'archivo_sin_leer', 'marcado_masivo', 'edito_borrador', 'envio_borrador',
    'descarto_borrador', 'corrigio_juicio', 'corrigio_ficha', 'respondio_propuesta', 'deshizo', 'leido_por_resumen', 'conservo',
    'archivo_en_etiqueta', 'marco_spam', 'marco_importante', 'marco_no_leido', 'archivo_leido', 'leido_por_politica'],
  // Lo opcional sale de Hoy cuando Opus decide; respaldo de 72 horas.
  HORAS_CADUCA: 72,
  MAX_SENALES: 1500,
  DIAS_SENALES: 60,
  DIAS_ABRIO: 14,
  DIAS_JUICIO: 14,
  OPCIONES_JUICIO: ['borrador', 'mover', 'papelera', 'spam', 'leido', 'importante', 'seguimiento', 'nada'],
  // Tope de seguridad de Actividad en caracteres de JSON: debajo de lo que cabe en el caché del almacén (40 trozos de 90,000).
  ACTIVIDAD_CARACTERES: 3000000
};

// ---------- Actividad ----------
// Se poda por edad, no por número: lo de los últimos COS.DIAS_DESHACER días se queda completo, porque su Deshacer y la
// vista acumulada desde la última visita lo necesitan. Lo más viejo queda como historia mientras la lista no pase de
// COS.MAX_ACTIVIDAD renglones. Si pasa de HECHOS.ACTIVIDAD_CARACTERES, sale primero lo que ya no tiene Deshacer y después lo
// más viejo. Lo que sale y contaba para la vista acumulada pasa a un contador por política (contarPodadas_).
const TAM_ACTIVIDAD_ = new WeakMap();
function anotar_(st, e) {
  const a = st.get('actividad', []);
  const entrada = { id: nuevoId_(st, 'a'), t: Date.now(), texto: String(e.texto || ''), politica: e.politica || undefined, actor: e.actor || actor_(), d: e.d || null, aviso: e.aviso || undefined,
    objeto: e.objeto || undefined, v: e.v || undefined, rut: typeof LLAMADA_CORRIDA_ !== 'undefined' && LLAMADA_CORRIDA_ ? 1 : undefined };
  a.unshift(entrada);
  if (ANOTADAS_) ANOTADAS_.push(entrada);
  // El tamaño se mide completo una vez por ejecución y luego se lleva a mano.
  let tam = TAM_ACTIVIDAD_.has(a) ? TAM_ACTIVIDAD_.get(a) + JSON.stringify(entrada).length + 1 : JSON.stringify(a).length;
  const quitadas = [];
  const quitar = i => { const x = a.splice(i, 1)[0]; tam -= JSON.stringify(x).length + 1; quitadas.push(x); };
  const lim = Date.now() - COS.DIAS_DESHACER * 86400000;
  while (a.length > COS.MAX_ACTIVIDAD && a[a.length - 1].t < lim) quitar(a.length - 1);
  for (let i = a.length - 1; i > 0 && tam > HECHOS.ACTIVIDAD_CARACTERES; i--) if (!a[i].d || a[i].u) quitar(i);
  while (a.length > 30 && tam > HECHOS.ACTIVIDAD_CARACTERES) quitar(a.length - 1);
  TAM_ACTIVIDAD_.set(a, tam);
  if (quitadas.length) contarPodadas_(st, quitadas);
  st.set('actividad', a);
  return entrada;
}

// Lo que sale de Actividad sigue en la cuenta de la vista acumulada: suma a un contador por política para cada corte
// vigente (la última visita y la anterior; sin visita, desde el principio): [correos, correos sin Bien]. Las mismas reglas
// que desdeTuVisita_; [Bien] de la línea (bienLinea_) pone en cero los sin Bien.
function contarPodadas_(st, quitadas) {
  const vis = st.get('visita', null);
  const cortes = (vis ? [vis.t, vis.anterior !== undefined ? vis.anterior : vis.t] : [0]).filter((c, i, l) => l.indexOf(c) === i);
  const antes = st.get('actividad_podada', {}) || {};
  const p = {};
  cortes.forEach(c => { p[c] = antes[c] || {}; });
  let cambio = false;
  quitadas.forEach(e => {
    if (!e.politica || !e.d || e.u || e.actor === 'persona') return;
    const n = cifraDeAccion_(st, e.d);
    if (n) cortes.forEach(c => { if (e.t > c) { const x = p[c][e.politica] = p[c][e.politica] || [0, 0]; x[0] += n; if (!e.bien) x[1] += n; cambio = true; } });
  });
  if (cambio) st.set('actividad_podada', p);
}

// ---------- Señales ----------
function anotarSenal_(st, x) {
  const l = st.get('senales', []);
  const s = { t: x.t || Date.now(), tipo: x.tipo, canal: x.canal || canal_(), id_mensaje: x.id_mensaje || undefined, id_hilo: x.id_hilo || undefined,
    remitente: x.remitente || undefined, dominio: x.remitente ? dominio_(x.remitente) || undefined : undefined, asunto: x.asunto ? corto_(x.asunto, 100) : undefined,
    etiqueta_previa: x.etiqueta_previa || undefined, etiqueta: x.etiqueta ? corto_(x.etiqueta, 60) : undefined, politica: x.politica || undefined, detalle: x.detalle ? corto_(x.detalle, 200) : undefined,
    horas: x.horas === undefined ? undefined : x.horas, protegido: x.protegido || undefined, ficha: x.ficha || undefined, dx: x.dx || undefined };
  l.push(s);
  st.set('senales', l);
  return s;
}

function podarSenales_(st) {
  const ahora = Date.now();
  let s = st.get('senales', []).filter(x => ahora - x.t < (x.tipo === 'abrio' ? HECHOS.DIAS_ABRIO : HECHOS.DIAS_SENALES) * 86400000);
  if (s.length > HECHOS.MAX_SENALES) {
    let sobran = s.length - HECHOS.MAX_SENALES;
    s = s.filter(x => { if (sobran > 0 && x.tipo === 'abrio') { sobran--; return false; } return true; });
    if (s.length > HECHOS.MAX_SENALES) s = s.slice(s.length - HECHOS.MAX_SENALES);
  }
  st.set('senales', s);
}

// ---------- Corridas del motor y de las rutinas de Opus ----------
function marcarRutina_(st, tipo) {
  const r = st.get('rutinas', {});
  const ahora = Date.now();
  const previa = r[tipo] || 0;
  r[tipo] = ahora;
  st.set('rutinas', r);
  if (tipo !== 'llamada' && ahora - previa > 30 * 60000 && !rutinaAbierta_()) {
    const c = st.get('corridas', []);
    c.unshift({ t: ahora, quien: 'opus:' + tipo, resultado: { juicio: 'juzgó correo nuevo', repaso: 'dejó el repaso semanal', cuaderno: 'anotó en el cuaderno' }[tipo] || tipo });
    st.set('corridas', c.slice(0, COS.MAX_CORRIDAS));
  }
}

// Cada corrida de una rutina de Opus manda corrida: {tipo, id} en todas sus llamadas. La primera con un id nuevo la abre;
// solo las llamadas con ese id cuentan en ella, y las que llegan sin él mientras tanto cuentan como plática. Apps Script no
// ve la sesión MCP: el id es lo único que separa la rutina de una plática que coincide con ella. La forma vieja,
// ver_memoria('cuaderno', {corrida: 'juicio' | 'diaria' | 'semanal'}) sin id, abre una corrida que cuenta todo lo que llega
// hasta que pasan 20 minutos sin llamadas o empieza otra.
const RUTINA = { LLAVE: 'cos3.rutina', PRIMERA: 'cos3.primera_rutina', TIPOS: ['juicio', 'diaria', 'semanal'], INACTIVA_MIN: 20, TOLERANCIA_MIN: 45, FINDE_REFERENCIA: ['10:07', '14:07', '19:07'],
  TIPO_ID: { cada_hora: 'juicio', juicio: 'juicio', diaria: 'diaria', semanal: 'semanal' } };
// {tipo, id} de una llamada de rutina, o null.
function corridaDeLlamada_(a) {
  let c = a && a.corrida;
  if (typeof c === 'string') { try { c = JSON.parse(c); } catch (e) { c = null; } }
  if (!c || typeof c !== 'object') return null;
  const tipo = RUTINA.TIPO_ID[String(c.tipo || '').toLowerCase()], id = String(c.id || '').trim();
  return tipo && id.length >= 4 && id.length <= 40 ? { tipo: tipo, id: id } : null;
}

function rutinaAbierta_() {
  try { const r = JSON.parse(PropertiesService.getScriptProperties().getProperty(RUTINA.LLAVE) || 'null'); return r && Date.now() - r.u < RUTINA.INACTIVA_MIN * 60000 ? r : null; } catch (e) { return null; }
}

// Llamada del conector: abre una corrida si es la primera de una rutina, suma a la abierta o cierra la que ya se apagó.
function contarLlamada_(n, a, escribe) {
  const props = PropertiesService.getScriptProperties();
  const empiezaRutina = n === 'ver_memoria' && String(a.parte || '') === 'cuaderno';
  const cid = corridaDeLlamada_(a);
  if (!empiezaRutina && !cid && !props.getProperty(RUTINA.LLAVE)) return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1500)) return;
  try {
    let r = null;
    try { r = JSON.parse(props.getProperty(RUTINA.LLAVE) || 'null'); } catch (e) {}
    const ahora = Date.now();
    const filtro = a && a.filtro && typeof a.filtro === 'object' ? a.filtro : (() => { try { return JSON.parse(a.filtro || 'null'); } catch (e) { return null; } })();
    const viejo = !cid && n === 'ver_memoria' && String(a.parte || '') === 'cuaderno' && filtro && RUTINA.TIPOS.indexOf(String(filtro.corrida || '')) >= 0;
    const nueva = !!cid && !(r && r.con_id && r.cid === cid.id);
    const empieza = viejo || nueva;
    if (r && (empieza || ahora - r.u >= RUTINA.INACTIVA_MIN * 60000)) { cerrarRutina_(r); r = null; }
    if (empieza) r = cid ? { id: Utilities.getUuid().slice(0, 8), cid: cid.id, con_id: true, tipo: cid.tipo, i: ahora, u: ahora, n: 0, e: 0, h: {}, pl: 0 } : { id: Utilities.getUuid().slice(0, 8), tipo: String(filtro.corrida), i: ahora, u: ahora, n: 0, e: 0, h: {} };
    if (empieza && !props.getProperty(RUTINA.PRIMERA)) props.setProperty(RUTINA.PRIMERA, String(ahora));
    if (!r) return;
    // Con id, lo que llega sin él durante la corrida es plática: se cuenta aparte y no alarga la corrida.
    if (r.con_id && !cid) { r.pl = (r.pl || 0) + 1; props.setProperty(RUTINA.LLAVE, JSON.stringify(r)); return; }
    r.u = ahora; r.n++; if (escribe) r.e++;
    r.h[n] = (r.h[n] || 0) + 1;
    props.setProperty(RUTINA.LLAVE, JSON.stringify(r));
  } finally { lock.releaseLock(); }
}

// La anota en corridas con inicio, fin, llamadas y resultado. La corrida del motor también llama aquí cada 10 minutos.
function cerrarRutina_(r, st) {
  if (!r) return;
  const propio = !st;
  st = st || almacen_();
  const c = st.get('corridas', []);
  // Dos rutinas intercaladas (A, B, A) se agrupan por su id: el tramo que vuelve a un id ya anotado se suma a ese registro.
  const previo = r.cid ? c.filter(x => x.corrida_id === r.cid && x.quien === 'opus:' + r.tipo && r.i - (x.fin || x.t) < 3 * 3600000)[0] : null;
  if (previo && !c.some(x => x.rutina === r.id)) {
    previo.fin = Math.max(previo.fin || previo.t, r.u); previo.s = Math.round((previo.fin - previo.t) / 1000);
    previo.llamadas = (previo.llamadas || 0) + r.n; previo.escrituras = (previo.escrituras || 0) + r.e;
    const hs = previo.herramientas = Object.assign({}, previo.herramientas || {}); Object.keys(r.h).forEach(k => { hs[k] = (hs[k] || 0) + r.h[k]; });
    if (r.con_id) previo.platica_aparte = (previo.platica_aparte || 0) + (r.pl || 0);
    previo.tramos = (previo.tramos || [previo.rutina]).concat([r.id]);
    const hechos = Object.keys(hs).filter(k => ESCRITURAS.indexOf(k) >= 0).sort((a, b) => hs[b] - hs[a]).map(k => k + ' ' + hs[k]);
    previo.resultado = previo.llamadas + ' llamadas' + (hechos.length ? '; ' + hechos.join(', ') : '; solo lecturas') + (previo.platica_aparte ? '; ' + previo.platica_aparte + ' de plática aparte' : '');
    st.set('corridas', c);
    if (propio) st.guardar();
  } else if (!c.some(x => x.rutina === r.id || (x.tramos || []).indexOf(r.id) >= 0)) {
    const hechos = Object.keys(r.h).filter(k => ESCRITURAS.indexOf(k) >= 0).sort((a, b) => r.h[b] - r.h[a]).map(k => k + ' ' + r.h[k]);
    c.unshift({ t: r.i, fin: r.u, quien: 'opus:' + r.tipo, rutina: r.id, corrida_id: r.cid || undefined, s: Math.round((r.u - r.i) / 1000), llamadas: r.n, escrituras: r.e, herramientas: r.h,
      platica_aparte: r.con_id ? r.pl || 0 : undefined,
      resultado: r.n + ' llamadas' + (hechos.length ? '; ' + hechos.join(', ') : '; solo lecturas') + (r.con_id && r.pl ? '; ' + r.pl + ' de plática aparte' : '') });
    st.set('corridas', c.slice(0, COS.MAX_CORRIDAS));
    const ru = st.get('rutinas', {});
    ru['corrida_' + r.tipo] = r.i;
    st.set('rutinas', ru);
    if (propio) st.guardar();
  }
  PropertiesService.getScriptProperties().deleteProperty(RUTINA.LLAVE);
}

function cerrarRutinaVencida_(st) {
  let r = null;
  try { r = JSON.parse(PropertiesService.getScriptProperties().getProperty(RUTINA.LLAVE) || 'null'); } catch (e) {}
  if (r && Date.now() - r.u >= RUTINA.INACTIVA_MIN * 60000) cerrarRutina_(r, st);
}

// Las horas de juicio de hoy (experiencia.horarios_juicio) que pasaron sin una corrida de juicio: el plan topó o la rutina falló.
// Las horas de juicio de ese día. Fin de semana: su lista; si falta, la de entre semana dentro del tope del perfil
// (completo: las 3 más cercanas a 10:07, 14:07 y 19:07; sin horas, esas tres).
function horasDelDia_(st, x, dia) {
  const hj = horariosJuicio_(x);
  const sem = new Date(Date.UTC(Number(dia.slice(0, 4)), Number(dia.slice(5, 7)) - 1, Number(dia.slice(8, 10)))).getUTCDay();
  if (sem !== 0 && sem !== 6) return hj.entre_semana;
  if (hj.fin_de_semana) return hj.fin_de_semana;
  if (perfilRutinas_(st) !== 'completo') return hj.entre_semana;
  if (!hj.entre_semana.length) return RUTINA.FINDE_REFERENCIA.slice();
  const min = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return RUTINA.FINDE_REFERENCIA.map(r => hj.entre_semana.reduce((a, b) => (Math.abs(min(b) - min(r)) < Math.abs(min(a) - min(r)) ? b : a)))
    .filter((h, i, l) => l.indexOf(h) === i).sort((a, b) => min(a) - min(b));
}

// La primera corrida registrada (del motor o de Opus). La lista de corridas guarda solo las últimas 60; la primera queda
// aparte desde la corrida del motor.
function primeraCorrida_(st) {
  const p = st.get('primera_corrida', null);
  if (p) return p;
  const t = st.get('corridas', []).map(c => c.t).filter(isFinite);
  return t.length ? Math.min.apply(null, t) : null;
}

// Un horario anterior al cierre de la instalación o a la primera corrida no faltó: todavía no había rutina que esperar.
function rutinasQueFaltaron_(st) {
  const x = experiencia_(st);
  const hoy = dia_(Date.now()), z = Utilities.formatDate(new Date(Date.now()), tz_(), 'XXX');
  const horas = horasDelDia_(st, x, hoy);
  const cerrada = instalacionCerrada_(st), primera = primeraCorrida_(st);
  if (!horas.length || !cerrada || !primera) return [];
  const piso = Math.max(cerrada, primera);
  const abierta = rutinaAbierta_();
  const juicios = st.get('corridas', []).filter(c => c.quien === 'opus:juicio').map(c => c.t).concat(abierta && abierta.tipo === 'juicio' ? [abierta.i] : []);
  return horas.filter(h => {
    const t = Date.parse(hoy + 'T' + h + ':00' + z);
    if (!isFinite(t) || t < piso || Date.now() < t + RUTINA.TOLERANCIA_MIN * 60000) return false;
    return !juicios.some(i => i >= t - 15 * 60000 && i <= t + RUTINA.TOLERANCIA_MIN * 60000);
  });
}

// La señal de reconectar: las rutinas de Opus dejaron de llamar. Cuenta las horas de
// juicio de los últimos 3 días que pasaron, con su tolerancia, después de la última llamada de Claude por el conector.
// Con 2 o más, la web app ofrece Reconectar; una sola puede ser el tope del plan de Claude (rutinas_que_faltaron_hoy).
const CONEXION = { DIAS: 3, FALTAN: 2 };
function conexionClaude_(st) {
  const cerrada = instalacionCerrada_(st), primera = primeraCorrida_(st);
  const r = st.get('rutinas', {}), abierta = rutinaAbierta_();
  const ultima = Math.max.apply(null, [0, abierta ? abierta.u : 0].concat(Object.keys(r).map(k => Number(r[k]) || 0)));
  if (!cerrada || !primera || !ultima) return null;
  const x = experiencia_(st), z = Utilities.formatDate(new Date(Date.now()), tz_(), 'XXX');
  const piso = Math.max(cerrada, primera, ultima);
  let faltaron = 0;
  for (let i = CONEXION.DIAS - 1; i >= 0; i--) {
    const dia = dia_(Date.now() - i * 86400000);
    horasDelDia_(st, x, dia).forEach(h => { const t = Date.parse(dia + 'T' + h + ':00' + z); if (isFinite(t) && t > piso && Date.now() >= t + RUTINA.TOLERANCIA_MIN * 60000) faltaron++; });
  }
  const reconectar = faltaron >= CONEXION.FALTAN;
  return { estado: reconectar ? 'sin_llamadas' : 'al_dia', ultima_llamada: fecha_(ultima), revisiones_sin_llamar: faltaron, reconectar: reconectar || undefined,
    texto: reconectar ? 'Claude no ha revisado tu correo desde ' + fecha_(ultima) + ': faltaron ' + faltaron + ' revisiones. Vuelve a conectarlo en Claude para que siga.' : undefined };
}

// Si el Chief of Staff ya trabaja solo: la web app dice «ya trabaja para ti» solo con el
// activador de la corrida puesto y una rutina de Claude que ya llamó. Antes lo decía con solo haber llamado aplicar.
function estadoInstalacion_(st) {
  let nombres = [];
  try { nombres = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction()); } catch (e) { nombres = null; }
  let primera = Number(PropertiesService.getScriptProperties().getProperty(RUTINA.PRIMERA)) || 0;
  if (!primera) { const t = st.get('corridas', []).filter(c => /^opus:/.test(String(c.quien || '')) && c.rutina).map(c => c.t).filter(isFinite); if (t.length) primera = Math.min.apply(null, t); }
  const corrida = nombres ? nombres.indexOf('corrida') >= 0 : null, cerrada = instalacionCerrada_(st);
  // La próxima revisión de Claude: el siguiente horario de juicio de hoy o de los próximos 7 días (experiencia.horarios_juicio).
  let proxima = null;
  try {
    const x = experiencia_(st), z = Utilities.formatDate(new Date(Date.now()), tz_(), 'XXX');
    for (let i = 0; i < 8 && !proxima; i++) {
      const dia = dia_(Date.now() + i * 86400000);
      const ts = horasDelDia_(st, x, dia).map(h => Date.parse(dia + 'T' + h + ':00' + z)).filter(t => isFinite(t) && t > Date.now()).sort((a, b) => a - b);
      if (ts.length) proxima = ts[0];
    }
  } catch (e) {}
  return { plan_aceptado: cerrada ? fecha_(cerrada) : null, activadores: nombres, corrida_puesta: corrida, primera_rutina: primera ? fecha_(primera) : null,
    proxima_revision: proxima ? fecha_(proxima) : null,
    trabaja: !!(corrida && primera),
    falta: !cerrada ? 'plan' : corrida === false ? 'activadores' : !primera ? 'rutinas' : undefined };
}

function juicioDetenido_(st) {
  const r = st.get('rutinas', {});
  const ult = r.juicio || 0;
  if (!st.get('instalado_desde', null)) return null;
  if (Date.now() - ult < COS.HORAS_JUICIO_DETENIDO * 3600000) return null;
  return { desde: ult ? fecha_(ult) : null, horas: ult ? Math.round((Date.now() - ult) / 3600000) : null,
    texto: ult ? 'Opus no ha juzgado correo desde ' + fecha_(ult) + '. Mientras, propongo solo con tres señales iguales.' : 'Opus todavía no ha juzgado correo.' };
}

// ---------- Juicios ----------
function guardarJuicio_(st, hilo, prioridad, recomendacion, motivo, confianza, opciones, politica) {
  hilo = argTexto_(hilo, 'id_hilo');
  prioridad = String(prioridad || '').trim().toLowerCase();
  if (prioridad === 'urgente') prioridad = 'alta';
  if (COS.PRIORIDADES.indexOf(prioridad) < 0) throw new Error('prioridad vale ' + COS.PRIORIDADES.join(', ') + '.');
  // politica: el id o el nombre de una política que exista (no retirada). Antes se guardaba cualquier texto sin aviso.
  if (politica !== undefined && politica !== null && String(politica).trim() !== '') {
    const v = String(politica).trim();
    const pols = listaPoliticas_(st).filter(p => p.estado !== 'retirada');
    const pol = pols.filter(p => p.id === v)[0] || pols.filter(p => String(p.nombre || '').toLowerCase() === v.toLowerCase())[0];
    if (!pol) throw new Error('No hay una política «' + v + '». Usa el id o el nombre de una de estas: ' + pols.map(p => p.id + ' (' + p.nombre + ')').join(', ') + '. Si ninguna aplica, guarda el juicio sin politica.');
    politica = pol.id;
  } else politica = undefined;
  // Si Gmail no responde (por ejemplo, por el tope diario), el juicio se guarda igual, sin el asunto ni el último mensaje.
  let t = null, sinCompletar;
  try { t = conReintento_(() => Gmail.Users.Threads.get('me', hilo, { format: 'metadata', metadataHeaders: ['Subject', 'From'] })); }
  catch (e) { if (/not found|Invalid id value|No se encontr/i.test(String(e && e.message || e))) throw e; sinCompletar = 'No pude leer el hilo en Gmail ahora: guardé el juicio sin el asunto, el remitente ni el último mensaje (' + String(e && e.message || e).slice(0, 120) + '). Hoy los completa en cuanto Gmail deje leer el hilo.'; }
  const ms = t ? sinBorradores_(t.messages) : [];
  const ult = ms[ms.length - 1] || { id: undefined, snippet: '' };
  if (VIA === 'mcp') marcarRutina_(st, 'juicio');
  const j = st.get('juicios', {});
  const previo = j[hilo];
  // La corrección de la persona manda mientras no llegue un mensaje nuevo al hilo.
  if (previo && previo.por === 'persona' && !previo.vencido && VIA !== 'webapp') {
    return { hecho: 'La persona corrigió este hilo a ' + previo.prioridad + ' el ' + fecha_(previo.t) + ': conservo su juicio.', id_hilo: hilo, prioridad: previo.prioridad, respetado: true };
  }
  let ops;
  if (opciones !== undefined && opciones !== null) {
    if (!Array.isArray(opciones)) throw new Error('opciones es una lista de {etiqueta, accion, texto o carpeta}.');
    ops = opciones.slice(0, 4).map(o => {
      const accion = String(o.accion || '').toLowerCase();
      if (HECHOS.OPCIONES_JUICIO.indexOf(accion) < 0) throw new Error('accion de cada opción vale ' + HECHOS.OPCIONES_JUICIO.join(', ') + '.');
      return { etiqueta: argTexto_(o.etiqueta, 'etiqueta').slice(0, 40), accion: accion, texto: o.texto ? String(o.texto).slice(0, 4000) : undefined, carpeta: o.carpeta ? normalizarCarpeta_(o.carpeta) : undefined,
        recomendada: o.recomendada === true || undefined };
    });
  }
  const asunto = ms.length ? cabeceras_(ms[0]).subject || '' : '';
  // dh: los datos del correo al juzgar (remitente, asunto, fecha del último). Hoy los usa si Gmail no deja leer el hilo.
  const recibidos = ms.filter(m => !tiene_(m, 'SENT'));
  const dh = ms.length ? { de: cabeceras_(recibidos.length ? recibidos[recibidos.length - 1] : ult).from || '', as: asunto, t: Number(ult.internalDate) || undefined } : previo && previo.dh;
  j[hilo] = { prioridad: prioridad, recomendacion: String(recomendacion || '').slice(0, 500), motivo: String(motivo || '').slice(0, 300) || undefined,
    confianza: confianza === undefined || confianza === null ? undefined : Math.max(0, Math.min(1, Number(confianza) || 0)), opciones: ops, politica: politica || undefined,
    ultimo: ult.id, dh: dh || undefined, t: Date.now(), por: VIA === 'webapp' ? 'persona' : 'opus' };
  const sd = sensibleDetalle_(asunto + ' ' + (ult.snippet || ''), st, asunto, masivo_(recibidos.length ? recibidos[recibidos.length - 1] : ult, st));
  if (sd) { j[hilo].sensible = sd.tema; j[hilo].sensible_por = sd; }
  const lim = Date.now() - HECHOS.DIAS_JUICIO * 86400000;
  const nuevo = {};
  Object.keys(j).filter(k => j[k].t >= lim).sort((a, b) => j[b].t - j[a].t).slice(0, COS.MAX_JUICIOS).forEach(k => { nuevo[k] = j[k]; });
  st.set('juicios', nuevo);
  // Un remitente juzgado deja de ser nuevo: sus correos ya pueden seguir las políticas.
  const de = ms.length ? correo_(cabeceras_(ult).from || '') : '';
  // Para sacar de spam no basta: conocido ahí es que ella le escribió, que tiene ficha o que tuvo historia en Recibidos.
  if (de) { const c = st.get('conocidos', {}); if (!c[de]) { c[de] = Date.now(); st.set('conocidos', c);
    const pj = st.get('conocidos_por_juicio', {}); pj[de] = Date.now(); const kj = Object.keys(pj); if (kj.length > 3000) kj.sort((a, b) => pj[a] - pj[b]).slice(0, kj.length - 3000).forEach(k => { delete pj[k]; }); st.set('conocidos_por_juicio', pj); } }
  // Para sacar de spam, un remitente juzgado ruido, riesgo o fraude no cuenta como conocido.
  const jn = nuevo[hilo] || {};
  if (de && (jn.prioridad === 'ruido' || jn.prioridad === 'riesgo' || (jn.opciones || []).some(o => o && o.recomendada && String(o.accion || '').toLowerCase() === 'spam'))) {
    const m = st.get('remitentes_dudosos', {}); m[de] = Date.now();
    const ks = Object.keys(m); if (ks.length > 3000) ks.sort((x, y) => m[x] - m[y]).slice(0, ks.length - 3000).forEach(k => { delete m[k]; });
    st.set('remitentes_dudosos', m);
  }
  return { hecho: 'Guardé el juicio del hilo: prioridad ' + prioridad + '.', id_hilo: hilo, prioridad: prioridad, recomendacion: nuevo[hilo].recomendacion, tema_sensible: nuevo[hilo].sensible, tema_sensible_por: nuevo[hilo].sensible_por, correo: de || undefined,
    politica: politica, sin_completar: sinCompletar };
}

// Completa en lote los datos del correo (dh) y el último mensaje juzgado de los juicios que se guardaron sin leer el hilo.
// Los trae ver_hoy, que lee esos hilos de todos modos; no toca un juicio que cambió mientras tanto.
function completarJuicios_(st, c) {
  const j = st.get('juicios', {});
  let n = 0;
  Object.keys(c || {}).forEach(h => {
    const x = j[h], y = c[h];
    if (!x || x.t !== y.t) return;
    if (!x.dh && y.dh) { x.dh = y.dh; n++; }
    if (!x.ultimo && y.ultimo) { x.ultimo = y.ultimo; n++; }
  });
  if (n) st.set('juicios', j);
  return n;
}

function corregirJuicio_(st, hilo, prioridad, motivo) {
  hilo = argTexto_(hilo, 'id_hilo');
  prioridad = String(prioridad || '').trim().toLowerCase();
  if (COS.PRIORIDADES.indexOf(prioridad) < 0) throw new Error('prioridad vale ' + COS.PRIORIDADES.join(', ') + '.');
  const j = st.get('juicios', {});
  const antes = j[hilo] ? JSON.parse(JSON.stringify(j[hilo])) : null;
  const t = conReintento_(() => Gmail.Users.Threads.get('me', hilo, { format: 'metadata', metadataHeaders: ['Subject', 'From'] }));
  const ms = sinBorradores_(t.messages);
  const ult = ms[ms.length - 1];
  j[hilo] = Object.assign({}, antes || {}, { prioridad: prioridad, motivo: String(motivo || '').slice(0, 300) || (antes && antes.motivo), t: Date.now(), por: 'persona', vencido: false, ultimo: ult.id,
    corregido_de: antes ? antes.prioridad : undefined });
  if (!j[hilo].recomendacion) j[hilo].recomendacion = '';
  st.set('juicios', j);
  anotarSenal_(st, { tipo: 'corrigio_juicio', id_hilo: hilo, remitente: correo_(cabeceras_(ult).from || ''), asunto: cabeceras_(ms[0]).subject || '',
    detalle: (antes ? 'de ' + antes.prioridad + ' ' : '') + 'a ' + prioridad + (motivo ? ': ' + motivo : ''), dx: { prioridad_antes: antes ? antes.prioridad : null, prioridad_nueva: prioridad } });
  const e = anotar_(st, { texto: 'Cambiaste la prioridad de «' + corto_(cabeceras_(ms[0]).subject || '(sin asunto)', 70) + '»' + (antes ? ' de ' + antes.prioridad : '') + ' a ' + prioridad + '.', actor: 'persona', objeto: hilo,
    d: { tipo: 'juicio', hilo: hilo, antes: antes } });
  return { hecho: e.texto, id_accion: e.id, id_hilo: hilo, prioridad: prioridad, antes: antes ? antes.prioridad : null };
}

// Un juicio vence si llega un mensaje nuevo al hilo.
function vencerJuicios_(st, hilosConNuevos) {
  const j = st.get('juicios', {});
  let n = 0;
  Object.keys(hilosConNuevos || {}).forEach(h => { if (j[h] && !j[h].vencido) { j[h].vencido = true; j[h].vencio = Date.now(); n++; } });
  if (n) st.set('juicios', j);
  return n;
}

// ---------- Seguimientos ----------
// datos: {accion: abrir|cerrar|posponer|acuse, id_hilo o chat, direccion (le_deben, debe_la_persona), que, vence o dias, politica, id, motivo, resultado, a_pedido}
// proxima_revision: "AAAA-MM-DD" (a las 8:00), "AAAA-MM-DD HH:mm" o fecha ISO. Opus esconde de Hoy hasta esa fecha.
function fechaRevision_(v) {
  const s = String(v).trim();
  const z = Utilities.formatDate(new Date(), tz_(), 'XXX');
  let t = /^\d{4}-\d{2}-\d{2}$/.test(s) ? Date.parse(s + 'T08:00:00' + z) : /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/.test(s) ? Date.parse(s.replace(' ', 'T') + ':00' + z) : Date.parse(s);
  if (!isFinite(t)) throw new Error('proxima_revision es AAAA-MM-DD o AAAA-MM-DD HH:mm (' + s + ' no).');
  if (t > Date.now() + 366 * 86400000) throw new Error('proxima_revision va dentro del próximo año.');
  return t;
}

// «Después» de una tarjeta de Hoy: esta_tarde, manana o lunes; vuelve a Hoy en esa fecha. Esta tarde
// es a las 17:00; desde las 16:00, a las 20:00; desde las 19:00, mañana a las 8:00. Lunes es el siguiente, a las 8:00.
const DESPUES = ['esta_tarde', 'manana', 'lunes'];
function fechaDespues_(clave) {
  const k = String(clave || '').trim().toLowerCase().replace('ñ', 'n').replace(/\s+/g, '_');
  if (DESPUES.indexOf(k) < 0) throw new Error('despues vale ' + DESPUES.join(', ') + '.');
  const ahora = Utilities.formatDate(new Date(Date.now()), tz_(), 'yyyy-MM-dd HH:mm');
  const hoy = ahora.slice(0, 10), h = Number(ahora.slice(11, 13));
  const utc = n => new Date(Date.UTC(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)) - 1, Number(hoy.slice(8, 10)) + n));
  const manana = utc(1).toISOString().slice(0, 10);
  let dia = hoy, hora = '08:00';
  if (k === 'esta_tarde') { if (h < 16) hora = '17:00'; else if (h < 19) hora = '20:00'; else dia = manana; }
  else if (k === 'manana') dia = manana;
  else dia = utc((8 - utc(0).getUTCDay()) % 7 || 7).toISOString().slice(0, 10);
  const a = ' a las ' + hora.replace(/^0/, '');
  return { t: fechaRevision_(dia + ' ' + hora), cuando: (dia === hoy ? (hora === '17:00' ? 'esta tarde' : 'hoy') : dia === manana ? 'mañana' : 'el lunes') + a };
}

// La persona deja para después una tarjeta de Te necesita: el juicio se esconde de Hoy hasta esa hora (escondidos_hasta_su_revision).
// Un mensaje nuevo en el hilo la regresa antes, porque vence el juicio.
// La fecha en palabras: hoy, mañana o «el lunes 2 de noviembre», con su hora.
const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function cuandoHumano_(t) {
  const f = fecha_(t), dia = f.slice(0, 10), hora = ' a las ' + Number(f.slice(11, 13)) + ':' + f.slice(14, 16);
  if (dia === dia_(Date.now())) return 'hoy' + hora;
  if (dia === dia_(Date.now() + 86400000)) return 'mañana' + hora;
  const d = new Date(Date.UTC(Number(dia.slice(0, 4)), Number(dia.slice(5, 7)) - 1, Number(dia.slice(8, 10))));
  return 'el ' + DIAS_SEMANA[d.getUTCDay()] + ' ' + d.getUTCDate() + ' de ' + MESES[d.getUTCMonth()] + hora;
}

// clave: esta_tarde, manana o lunes. Sin clave, revision es la fecha que pone la web app (AAAA-MM-DD HH:mm).
function despuesJuicio_(st, hilo, clave, revision) {
  hilo = argTexto_(hilo, 'id_hilo');
  const conClave = clave !== undefined && clave !== null && clave !== '';
  const f = conClave ? fechaDespues_(clave) : (() => {
    const t = fechaRevision_(revision);
    if (t <= Date.now()) throw new Error('proxima_revision ya pasó (' + fecha_(t) + '): usa una fecha futura.');
    return { t: t, cuando: cuandoHumano_(t) };
  })();
  const j = st.get('juicios', {});
  if (!j[hilo]) throw new Error('No hay juicio de ' + hilo + ': Después es para lo que está en Hoy.');
  const antes = JSON.parse(JSON.stringify(j[hilo]));
  j[hilo].revision = f.t;
  j[hilo].despues = { t: Date.now(), clave: conClave ? String(clave) : undefined };
  st.set('juicios', j);
  const e = anotar_(st, { texto: 'Lo dejaste para ' + f.cuando + ': «' + corto_((antes.dh && antes.dh.as) || '(sin asunto)', 70) + '».', actor: 'persona', objeto: hilo,
    d: { tipo: 'juicio', hilo: hilo, antes: antes } });
  return { hecho: e.texto, id_accion: e.id, id_hilo: hilo, vuelve: fecha_(f.t), proxima_revision: fecha_(f.t), cuando: f.cuando };
}

// vence: "AAAA-MM-DD" (al final de ese día), "AAAA-MM-DD HH:mm" (a esa hora) o fecha ISO, dentro del próximo año.
// dias: de 1 a 60 desde ahora. Si vienen los dos, manda vence.
function venceSeguimiento_(d) {
  const hay = v => v !== undefined && v !== null && String(v).trim() !== '';
  if (!hay(d.vence) && !hay(d.dias)) throw new Error('Falta vence (AAAA-MM-DD o AAAA-MM-DD HH:mm) o dias (1 a 60).');
  if (hay(d.vence)) {
    const s = String(d.vence).trim();
    const z = Utilities.formatDate(new Date(), tz_(), 'XXX');
    const t = /^\d{4}-\d{2}-\d{2}$/.test(s) ? Date.parse(s + 'T23:59:00' + z) : /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/.test(s) ? Date.parse(s.replace(' ', 'T') + ':00' + z) : Date.parse(s);
    if (!isFinite(t)) throw new Error('vence es AAAA-MM-DD o AAAA-MM-DD HH:mm (' + s + ' no).');
    if (t <= Date.now()) throw new Error('vence ya pasó (' + fecha_(t) + '): usa una fecha futura.');
    if (t > Date.now() + 366 * 86400000) throw new Error('vence va dentro del próximo año.');
    return t;
  }
  const dias = Number(d.dias);
  if (!(dias >= 1 && dias <= 60)) throw new Error('dias va de 1 a 60.');
  return Date.now() + dias * 86400000;
}

const SEGUIMIENTO = { MAX_QUE: 120, RX_ROBOT: /^(no-?reply|noreply|do-?not-?reply|donotreply|notifications?|notificaciones|mailer-daemon|executiveassistant|[a-z0-9._-]*notes|[a-z0-9._-]*notas|recaps?|resumen(es)?|summar(y|ies)|[a-z0-9._-]*assistant|asistente|meetings?|reuniones|([a-z0-9]*[._-])?bot|notetaker|minutes|minutas|transcripts?)$/i,
  RX_NOTAS: /(^|\.)(zoom\.us|read\.ai|fireflies\.ai|otter\.ai|fathom\.video|tldv\.io|plaud\.ai|meetgeek\.ai|sembly\.ai|tactiq\.io|notta\.ai|grain\.com|avoma\.com|granola\.so|circleback\.ai|krisp\.ai|jamie\.ai|supernormal\.com)$/i };
// Un remitente automático de notas o avisos sin ficha de persona: los asistentes de notas conocidos (Read.ai, Krisp) y, como
// regla general, un remitente automático (noreply, notes, recap, assistant, meetings) o un correo con List-Unsubscribe.
function robotDeNotas_(correo, fichas, automatico) {
  const c = String(correo || '').toLowerCase(), local = c.split('@')[0];
  // La parte local cuenta también con su sufijo, en cualquier dominio: notes+equipo, recap.ventas, assistant-47. «bot» va al
  // inicio de la parte local o después de un separador (ventas.bot, bot+47): marie.talbot es una persona.
  const robot = SEGUIMIENTO.RX_ROBOT.test(local) || local.split(/(?=[+.-])/).some((x, i, l) => i > 0 && SEGUIMIENTO.RX_ROBOT.test(l.slice(0, i).join('')));
  if (!automatico && !robot && !/no-?reply/.test(local) && !SEGUIMIENTO.RX_NOTAS.test(c.split('@')[1] || '')) return false;
  return !fichaDe_(fichas || [], c).persona;
}
// Una huella corta y estable de un texto (FNV-1a de 32 bits), para llaves que no deben cortarse.
function huella_(t) { let h = 0x811c9dc5; const s = String(t || ''); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return ('0000000' + h.toString(16)).slice(-8); }
// El texto de un seguimiento sin acentos, mayúsculas ni signos: la llave de «el mismo compromiso».
function normalizarQue_(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
// Corta en el último espacio antes del tope: nunca parte una palabra, un enlace ni un nombre de archivo. Si la primera
// palabra no cabe, va entera, sin quitarle nada. Al cortar en un espacio solo se quita lo que queda colgando (una coma, un
// guion suelto, un paréntesis abierto); la última palabra no pierde ningún carácter.
function cortarEnPalabra_(t, max) {
  if (t.length <= max) return t;
  const k = t.slice(0, max + 1).lastIndexOf(' ');
  if (k <= 0) return t.split(/\s/)[0];
  return t.slice(0, k).replace(/(\s+[\-\u2013(<\[«"]+)+$/, '').replace(/[\s,;:(<\[«"]+$/, '');
}

// El vencimiento en palabras: hoy, mañana, «el viernes 6» en la semana que viene o «el lunes 16 de noviembre», con su hora
// salvo al final del día.
function cuandoVence_(t) {
  const f = fecha_(t), dia = f.slice(0, 10), hora = /23:59$/.test(f) ? '' : ' a las ' + Number(f.slice(11, 13)) + ':' + f.slice(14, 16);
  if (dia === dia_(Date.now())) return 'hoy' + hora;
  if (dia === dia_(Date.now() + 86400000)) return 'mañana' + hora;
  const d = new Date(Date.UTC(Number(dia.slice(0, 4)), Number(dia.slice(5, 7)) - 1, Number(dia.slice(8, 10)))), cerca = t > Date.now() && t - Date.now() < 7 * 86400000;
  const anio = dia.slice(0, 4) !== dia_(Date.now()).slice(0, 4) ? ' de ' + dia.slice(0, 4) : '';
  return 'el ' + DIAS_SEMANA[d.getUTCDay()] + ' ' + d.getUTCDate() + (cerca ? '' : ' de ' + MESES[d.getUTCMonth()] + anio) + hora;
}

function seguimiento_(st, d) {
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
  if (!d || typeof d !== 'object') throw new Error('datos es {accion: "abrir", id_hilo o chat, direccion, que, vence o dias}, {accion: "cerrar", id, resultado, motivo}, {accion: "posponer", id, vence o dias, motivo} o {accion: "acuse", id, motivo}.');
  const accion = String(d.accion || (d.id ? 'cerrar' : 'abrir')).toLowerCase();
  if (accion === 'cerrar') return cerrarSeguimiento_(st, argTexto_(d.id || d.id_hilo || d.chat, 'id (o id_hilo o chat)'), d.motivo || d.motivo_cierre, d.resultado);
  if (accion === 'posponer' || accion === 'acuse') return respuestaSeguimiento_(st, accion, argTexto_(d.id || d.id_hilo || d.chat, 'id (o id_hilo o chat)'), d);
  if (accion !== 'abrir') throw new Error('accion vale abrir, cerrar, posponer o acuse.');
  const vence = venceSeguimiento_(d);
  const direccion = String(d.direccion || 'le_deben').toLowerCase();
  if (['le_deben', 'debe_la_persona'].indexOf(direccion) < 0) throw new Error('direccion vale le_deben (espera respuesta de otros) o debe_la_persona (la persona prometió algo).');
  // Lo que le deben según unas notas de junta o un chat (canal correo o whatsapp) es un compromiso de otro: con
  // Compromisos activa va ahí aunque Seguimiento esté apagada.
  const pols = listaPoliticas_(st), activa = id => pols.some(p => p.id === id && p.estado === 'activa' && p.nivel !== 'apagado');
  const canalCompromiso = ['correo', 'whatsapp'].indexOf(String(d.canal || '').toLowerCase()) >= 0;
  const politica = d.politica || (direccion === 'debe_la_persona' || (canalCompromiso && activa('compromisos')) ? 'compromisos' : 'seguimiento');
  const pol = pols.filter(p => p.id === politica)[0];
  // En la instalación todas las reglas están apagadas: los seguimientos que deja la plática de instalación entran igual.
  if (pol && pol.nivel === 'apagado' && !d.a_pedido && VIA !== 'webapp' && d.lote !== 'instalacion' && instalacionCerrada_(st)) throw new Error('La política «' + pol.nombre + '» está apagada: con nivel apagado no abro seguimientos por mi cuenta. Si la persona lo pidió en esta conversación, llama otra vez con a_pedido: true. Si no, deja el pendiente en tu juicio y propón encender «' + pol.nombre + '» en el plan.');
  const chat = d.chat ? String(d.chat).trim().slice(0, 80) : '';
  const hilo = d.id_hilo ? String(d.id_hilo) : '';
  if (!hilo && !chat) throw new Error('Falta id_hilo (correo) o chat (WhatsApp).');
  // El tope de 1000 caracteres no corta la primera palabra: va entera aunque pase el tope.
  const queBruto = String(d.que || '').trim(), queCompleto = queBruto.slice(0, Math.max(1000, ((queBruto.match(/^\S+/) || [''])[0]).length));
  const que = cortarEnPalabra_(queCompleto, SEGUIMIENTO.MAX_QUE);
  // La persona del compromiso que pasa Opus manda sobre el remitente; un robot de notas (Gemini, Zoom) nunca es la contraparte.
  const con = d.con !== undefined && d.con !== null && String(d.con).trim() ? String(d.con).trim().slice(0, 80) : '';
  let para = chat || 'el hilo', asunto = que || '(sin asunto)', sinCompletar;
  if (hilo) {
    // Si Gmail no responde (por ejemplo, por el tope diario), el seguimiento se guarda igual sin el destinatario ni el asunto.
    let t = null;
    try { t = conReintento_(() => Gmail.Users.Threads.get('me', hilo, { format: 'metadata', metadataHeaders: ['From', 'To', 'Subject', 'List-Unsubscribe'] })); }
    catch (e) { if (/not found|Invalid id value|No se encontr/i.test(String(e && e.message || e))) throw e; sinCompletar = 'No pude leer el hilo en Gmail ahora: guardé el seguimiento sin el destinatario ni el asunto del correo (' + String(e && e.message || e).slice(0, 120) + ').'; }
    if (t) {
      const ms = sinBorradores_(t.messages);
      const ult = ms[ms.length - 1];
      const h = cabeceras_(ult), yo = yo_();
      const fichas = st.get('fichas', []);
      const gente = (tiene_(ult, 'SENT') ? correos_(h.to) : [correo_(h.from)]).filter(x => x && x !== yo);
      const personas = gente.filter(x => !robotDeNotas_(x, fichas, !tiene_(ult, 'SENT') && !!h['list-unsubscribe']));
      para = personas.join(', ') || (gente.length ? '' : 'el hilo');
      asunto = cabeceras_(ms[0]).subject || '(sin asunto)';
    }
  }
  if (con) para = con;
  // Uno por compromiso: unas notas de junta traen varios en el mismo hilo. Es el mismo si coincide el hilo (o chat), la
  // dirección, el texto completo normalizado y la contraparte. Sin texto en alguno de los dos, basta el hilo y la dirección,
  // como antes. Una contraparte que no se nombró con con (la que salió del hilo) cede ante la que se nombra después.
  const lista = st.get('seguimientos', []);
  const clave = normalizarQue_(queCompleto);
  const conClave = normalizarQue_(con);
  const mismoQue = s => !clave || !(s.clave || s.que) || (s.clave || normalizarQue_(s.que)) === clave;
  const mismaParte = s => !conClave || !s.con || normalizarQue_(s.con) === conClave;
  // Con su id, abrir corrige ese seguimiento: la contraparte nueva reemplaza a la anterior.
  const idCorrige = d.id || d.id_seguimiento ? String(d.id || d.id_seguimiento) : null;
  const porId = idCorrige ? lista.filter(s => s.id === idCorrige && s.estado === 'abierto')[0] : null;
  if (idCorrige && !porId) throw new Error('No hay un seguimiento abierto ' + idCorrige + '. Usa ver_hechos({tipo: "seguimientos"}).');
  const igual = porId || lista.filter(s => s.estado === 'abierto' && s.direccion === direccion && (hilo ? s.hilo === hilo : s.chat === chat) && mismoQue(s) && mismaParte(s))[0];
  const revision = d.proxima_revision !== undefined && d.proxima_revision !== null ? fechaRevision_(d.proxima_revision) : undefined;
  if (igual) {
    igual.vence = vence; igual.que = que || igual.que; igual.politica = politica;
    if (clave) igual.clave = clave;
    const corrige = !!con && (!igual.con || (porId && normalizarQue_(igual.con) !== conClave));
    if (corrige) { igual.con = con; igual.para = con; }
    if (revision !== undefined) igual.revision = revision;
    if (d.persistente !== undefined) igual.persistente = !!d.persistente || undefined;
    st.set('seguimientos', lista);
    if (porId) return { hecho: 'Corregí el seguimiento ' + igual.id + (corrige ? ': ahora es con ' + con : '') + '; vence ' + cuandoVence_(vence) + '.', id_seguimiento: igual.id, vence: fecha_(vence), corregido: true, sin_completar: sinCompletar };
    return { hecho: 'Ese seguimiento ya estaba abierto (' + igual.id + '); lo moví para ' + cuandoVence_(vence) + '.', id_seguimiento: igual.id, vence: fecha_(vence), repetida: true, sin_completar: sinCompletar };
  }
  // Con la regla en Te propongo, el recordatorio queda como propuesta para su sí y se abre con su sí (efecto seguimiento).
  if (pol && pol.nivel === 'propone' && !d.a_pedido && VIA !== 'webapp' && d.lote !== 'instalacion' && instalacionCerrada_(st)) {
    const tema = cortarEnPalabra_(que || asunto, SEGUIMIENTO.MAX_QUE), quien = para && para !== 'el hilo' ? para : '', cuando = cuandoVence_(vence);
    const pregunta = direccion === 'debe_la_persona' ? '¿te recuerdo «' + tema + '»' + (quien ? ' con ' + quien : '') + ' para ' + cuando + '?'
      : quien ? '¿te aviso si ' + quien + ' no contesta «' + tema + '» para ' + cuando + '?' : '¿te aviso si «' + tema + '» no llega para ' + cuando + '?';
    const datos = { accion: 'abrir', id_hilo: hilo || undefined, chat: chat || undefined, direccion: direccion, que: queCompleto || undefined, vence: fecha_(vence), con: con || undefined,
      canal: d.canal || undefined, politica: politica, proxima_revision: d.proxima_revision || undefined, persistente: d.persistente ? true : undefined };
    const r = proponer_(st, { tipo: 'pregunta', objeto: 'seguimiento:' + (hilo || chat) + ':' + direccion + ':' + huella_(clave + '|' + conClave), id_hilo: hilo || undefined, texto: pol.nombre + ': ' + pregunta,
      opciones: [{ etiqueta: 'Sí', efecto: { seguimiento: datos } }, { etiqueta: 'No', efecto: null }] });
    return { hecho: pol.nombre + ' está en ' + COS.NIVEL_TEXTO.propone + ': no lo abrí; quedó como propuesta para su sí («' + pregunta + '»). Con su sí se abre solo.',
      propuesta: r.id, propuesto: true, repetida: r.repetida || undefined, sin_completar: sinCompletar };
  }
  const s = { id: nuevoId_(st, 's'), hilo: hilo || null, chat: chat || undefined, canal: hilo ? 'correo' : 'whatsapp', direccion: direccion, que: que || undefined, politica: politica,
    desde: Date.now(), vence: vence, para: para, con: con || undefined, clave: clave || undefined, asunto: asunto.slice(0, 100), estado: 'abierto', revision: revision, persistente: d.persistente ? true : undefined };
  lista.push(s);
  while (lista.length > COS.MAX_SEGUIMIENTOS) { const i = lista.findIndex(x => x.estado !== 'abierto'); lista.splice(i < 0 ? 0 : i, 1); }
  st.set('seguimientos', lista);
  const tema = cortarEnPalabra_(s.que || s.asunto, SEGUIMIENTO.MAX_QUE);
  const x = s.direccion === 'debe_la_persona' ? 'Compromiso tuyo: «' + tema + '»' + (s.para ? ' con ' + s.para : '') + ' para ' + cuandoVence_(s.vence) + '; te lo recuerdo en Hoy.'
    : s.para ? 'Seguimiento: si ' + s.para + ' no contesta «' + tema + '» para ' + cuandoVence_(s.vence) + ', te lo pongo en Hoy.'
    : 'Seguimiento: si «' + tema + '» no llega para ' + cuandoVence_(s.vence) + ', te lo pongo en Hoy.';
  const e = anotar_(st, { texto: x, politica: politica, d: { tipo: 'seguimiento', id: s.id } });
  return { hecho: e.texto, id_accion: e.id, id_seguimiento: s.id, vence: fecha_(s.vence), direccion: s.direccion, canal: s.canal, sin_completar: sinCompletar };
}

// Lo que contestó la otra parte (o la persona) sin cumplir: posponer mueve el vencimiento con su fecha y hora; acuse deja
// el seguimiento abierto con su fecha. Los dos quitan el "por confirmar" y quedan en Actividad con Deshacer.
function respuestaSeguimiento_(st, accion, id, d) {
  const lista = st.get('seguimientos', []);
  const s = seguimientoAbierto_(lista, id);
  if (!s) throw new Error('No hay un seguimiento abierto ' + id + '. Usa ver_hechos("seguimientos").');
  const antes = JSON.parse(JSON.stringify(s));
  const motivo = String(d.motivo || '').trim().slice(0, 120);
  let texto;
  if (accion === 'posponer') {
    const nuevo = d.despues !== undefined && d.despues !== null && d.despues !== '' ? fechaDespues_(d.despues).t : venceSeguimiento_(d);
    s.pospuesto = (s.pospuesto || []).concat([{ de: s.vence, a: nuevo, t: Date.now(), motivo: motivo || undefined }]).slice(-5);
    s.vence = nuevo;
    s.respuesta = 'pospone';
    texto = 'Pospuse el seguimiento «' + cortarEnPalabra_(s.que || s.asunto, SEGUIMIENTO.MAX_QUE) + '» para ' + cuandoVence_(nuevo) + (motivo ? ': ' + motivo : '') + '.';
  } else {
    s.respuesta = 'acuse';
    s.acuse = { t: Date.now(), motivo: motivo || undefined };
    texto = 'Anoté el acuse de recibo en «' + cortarEnPalabra_(s.que || s.asunto, SEGUIMIENTO.MAX_QUE) + '»; sigue abierto para ' + cuandoVence_(s.vence) + (motivo ? ': ' + motivo : '') + '.';
  }
  st.set('seguimientos', lista);
  const e = anotar_(st, { texto: texto, politica: s.politica, d: { tipo: 'seguimiento_cerrado', antes: antes } });
  return { hecho: e.texto, id_accion: e.id, id_seguimiento: s.id, estado: s.estado, respuesta: s.respuesta, vence: fecha_(s.vence) };
}

// El seguimiento abierto por su id, o por id_hilo o chat cuando ahí hay uno solo. Con varios (los compromisos de una
// junta), pide el id para no cerrar el que no era.
function seguimientoAbierto_(lista, id) {
  const porId = lista.filter(x => x.id === id && x.estado === 'abierto')[0];
  if (porId) return porId;
  const varios = lista.filter(x => x.estado === 'abierto' && (x.hilo === id || x.chat === id));
  if (varios.length > 1) throw new Error('Hay ' + varios.length + ' seguimientos abiertos en ' + id + ': usa su id (' + varios.map(x => x.id + ' «' + (x.que || x.asunto || '').slice(0, 40) + '»').join(', ') + ').');
  return varios[0] || null;
}

// resultado: cumplido, cancelado o decision_de_la_persona (solo por cumplimiento, cancelación comprobada o
// decisión de la persona).
function cerrarSeguimiento_(st, id, motivo, resultado) {
  const RES = ['cumplido', 'cancelado', 'decision_de_la_persona'];
  resultado = resultado === undefined || resultado === null || resultado === '' ? undefined : String(resultado).trim().toLowerCase().replace(/ /g, '_');
  if (resultado !== undefined && RES.indexOf(resultado) < 0) throw new Error('resultado vale ' + RES.join(', ') + '.');
  const lista = st.get('seguimientos', []);
  const s = seguimientoAbierto_(lista, id);
  if (!s) {
    const cerrado = lista.filter(x => x.id === id || x.hilo === id || x.chat === id)[0];
    if (cerrado) return { hecho: 'Ese seguimiento ya estaba cerrado.', id_seguimiento: cerrado.id, repetida: true };
    throw new Error('No hay un seguimiento abierto ' + id + '. Usa ver_hechos("seguimientos").');
  }
  const antes = JSON.parse(JSON.stringify(s));
  s.estado = 'cerrado';
  s.motivo_cierre = String(motivo || (resultado ? resultado.replace(/_/g, ' ') : 'cerrado a pedido')).slice(0, 120);
  s.resultado = resultado;
  delete s.respuesta;
  s.cerrado = Date.now();
  st.set('seguimientos', lista);
  const e = anotar_(st, { texto: 'Cerré el seguimiento «' + cortarEnPalabra_(s.que || s.asunto, SEGUIMIENTO.MAX_QUE) + '»: ' + s.motivo_cierre + '.', politica: s.politica, d: { tipo: 'seguimiento_cerrado', antes: antes } });
  return { hecho: e.texto, id_accion: e.id, cerrado: s.id };
}

// En la corrida: una respuesta en el hilo (de otros en le_deben, de la persona en debe_la_persona) ya no cierra. Puede ser
// un acuse o una prórroga ("te lo entrego la semana que entra"): el seguimiento queda abierto con respuesta por_confirmar
// y Opus decide en su juicio si cumple (cerrar), pospone (posponer, con vence nuevo) o solo acusa recibo (acuse).
function revisarSeguimientos_(st, hist, res) {
  const lista = st.get('seguimientos', []);
  const abiertos = lista.filter(s => s.estado === 'abierto');
  if (!abiertos.length) return;
  const ahora = Date.now();
  const enviados = {};
  (hist.enviados || []).forEach(e => { enviados[e.hilo] = 1; });
  const conCorreo = abiertos.filter(s => s.hilo && (hist.hilosConNuevos[s.hilo] || enviados[s.hilo]));
  if (conCorreo.length) {
    const datos = gmailFetchAll_(conCorreo.map(s => 'threads/' + s.hilo + '?format=minimal'), 20);
    conCorreo.forEach((s, k) => {
      const t = datos[k];
      if (!t) return;
      const ms = sinBorradores_(t.messages).filter(m => Number(m.internalDate) > Math.max(s.desde, s.respuesta_t || 0));
      const nuevos = ms.filter(m => s.direccion === 'debe_la_persona' ? tiene_(m, 'SENT') : !tiene_(m, 'SENT'));
      if (nuevos.length) { s.respuesta = 'por_confirmar'; s.respuesta_t = Number(nuevos[nuevos.length - 1].internalDate); }
    });
  }
  res.seguimientos_por_confirmar = lista.filter(s => s.estado === 'abierto' && s.respuesta === 'por_confirmar').length || undefined;
  res.seguimientos_vencidos = lista.filter(s => seguimientoVencido_(s, ahora)).length;
  st.set('seguimientos', lista.filter(s => s.estado === 'abierto' || ahora - (s.cerrado || s.vence) < 30 * 86400000));
}

// Vencido es "no contestó a tiempo": con una respuesta por confirmar, la otra parte sí contestó y no se cuenta así.
function porConfirmar_(s) { return s.estado === 'abierto' && s.respuesta === 'por_confirmar'; }
function seguimientoVencido_(s, ahora) { return s.estado === 'abierto' && s.vence < (ahora || Date.now()) && s.respuesta !== 'por_confirmar'; }

function filaSeguimiento_(s) {
  return { id: s.id, id_hilo: s.hilo || undefined, chat: s.chat, canal: s.canal, direccion: s.direccion, que: s.que || s.asunto, para: s.para, con: s.para || s.chat || undefined, politica: s.politica, proxima_revision: s.revision ? fecha_(s.revision) : undefined, persistente: s.persistente || undefined,
    desde: fecha_(s.desde), vence: fecha_(s.vence), vencido: seguimientoVencido_(s), estado: s.estado, motivo_cierre: s.motivo_cierre,
    resultado: s.resultado, respuesta: s.estado === 'abierto' ? s.respuesta : undefined, respuesta_llego: s.estado === 'abierto' && s.respuesta_t ? fecha_(s.respuesta_t) : undefined,
    veces_pospuesto: s.pospuesto && s.pospuesto.length || undefined };
}

// ---------- ver_hechos(tipo, desde, maximo) ----------
function desdeHechos_(desde, defecto) {
  const s = String(desde === undefined || desde === null ? '' : desde).trim();
  if (!s) return Date.now() - defecto;
  if (/^\d+h$/.test(s)) return Date.now() - Number(s.slice(0, -1)) * 3600000;
  if (/^-?\d+d?$/.test(s)) return Date.now() - Math.abs(Number(s.replace('d', ''))) * 86400000;
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(s) ? s + 'T00:00:00' + Utilities.formatDate(new Date(), tz_(), 'XXX') : s.replace(' ', 'T'));
  if (!isFinite(t)) throw new Error('No entiendo desde: ' + desde + '. Usa AAAA-MM-DD, días (7) u horas (6h).');
  return t;
}

function verHechos_(st, tipo, desde, maximo, filtro) {
  tipo = String(tipo || '').trim().toLowerCase();
  if (HECHOS.TIPOS.indexOf(tipo) < 0) throw new Error('tipo vale ' + HECHOS.TIPOS.join(', ') + '.');
  const max = argEntero_(maximo, 50, 1, 300);
  const t0 = desdeHechos_(desde, 7 * 86400000);
  filtro = filtro || {};
  if (tipo === 'bandeja') {
    const l = st.get('bandeja_dias', []).filter(x => x.t >= t0 || Date.parse(x.fecha + 'T23:59:59Z') >= t0).slice(0, max);
    return { tipo: tipo, desde: fecha_(t0), dias: l.map(x => ({ fecha: x.fecha, hilos: x.hilos, sin_leer: x.sin_leer, hora: Utilities.formatDate(new Date(x.t), tz_(), 'HH:mm') })),
      nota: 'La bandeja al cierre de cada día: hilos en Recibidos y sin leer en Recibidos. La meta es cero sin leer. El día de hoy sigue abierto hasta la última corrida.' };
  }
  if (tipo === 'senales') {
    let l = st.get('senales', []).filter(x => x.t >= t0);
    if (filtro.tipo) l = l.filter(x => x.tipo === filtro.tipo);
    if (filtro.politica) l = l.filter(x => x.politica === filtro.politica);
    const resumen = {};
    l.forEach(x => {
      const r = resumen[x.tipo] = resumen[x.tipo] || { total: 0, remitentes: {} };
      r.total++;
      if (x.remitente) r.remitentes[x.remitente] = (r.remitentes[x.remitente] || 0) + 1;
    });
    Object.keys(resumen).forEach(k => { const r = resumen[k].remitentes; resumen[k].remitentes = Object.keys(r).sort((a, b) => r[b] - r[a]).slice(0, 8).map(x => ({ remitente: x, veces: r[x] })); });
    return { tipo: tipo, desde: fecha_(t0), total: l.length, resumen: resumen, marcados_masivos: st.get('marcados_masivos', []).map(x => ({ fecha: fecha_(x.t), lecturas: x.n })),
      senales: l.slice(-max).reverse().map(x => Object.assign({}, x, { t: undefined, fecha: fecha_(x.t) })),
      nota: 'Hechos, no conclusiones. Con tres señales iguales de un remitente propón con proponer. Un marcado masivo como leído no cuenta como abrió.' };
  }
  if (tipo === 'juicios') {
    const j = st.get('juicios', {});
    const ks = Object.keys(j).filter(k => j[k].t >= t0 && (!filtro.prioridad || j[k].prioridad === filtro.prioridad)).sort((a, b) => j[b].t - j[a].t);
    return { tipo: tipo, desde: fecha_(t0), total: ks.length, juicios: ks.slice(0, max).map(k => Object.assign({ id_hilo: k }, j[k], { t: undefined, fecha: fecha_(j[k].t), vigente: !j[k].vencido })) };
  }
  if (tipo === 'seguimientos') {
    let l = st.get('seguimientos', []);
    if (filtro.estado) l = l.filter(s => s.estado === filtro.estado);
    return { tipo: tipo, total: l.length, seguimientos: l.slice(-max).reverse().map(filaSeguimiento_) };
  }
  if (tipo === 'actividad') {
    const l = st.get('actividad', []).filter(e => e.t >= t0);
    return { tipo: tipo, desde: fecha_(t0), total: l.length, actividad: l.slice(0, max).map(e => ({ id: e.id, hora: fecha_(e.t), actor: e.actor, texto: e.texto, politica: e.politica,
      puede_deshacer: !!e.d && !e.u, deshecho: e.u ? fecha_(e.u) : undefined })) };
  }
  if (tipo === 'corridas') {
    const l = st.get('corridas', []).filter(c => c.t >= t0);
    const r = st.get('rutinas', {});
    const abierta = rutinaAbierta_();
    return { tipo: tipo, desde: fecha_(t0), corridas: l.slice(0, max).map(c => Object.assign({}, c, { t: undefined, fin: undefined, rutina: undefined, hora: fecha_(c.t), inicio: fecha_(c.t), fin_hora: c.fin ? fecha_(c.fin) : undefined })),
      en_curso: abierta ? { tipo: abierta.tipo, inicio: fecha_(abierta.i), llamadas: abierta.n, escrituras: abierta.e, corrida_id: abierta.cid || undefined, platica_aparte: abierta.con_id ? abierta.pl || 0 : undefined } : undefined,
      rutinas_de_opus: Object.keys(r).reduce((o, k) => { o[k] = fecha_(r[k]); return o; }, {}), faltaron_hoy: rutinasQueFaltaron_(st), juicio_detenido: juicioDetenido_(st),
      nota: 'Cada corrida de rutina manda corrida: {tipo: "cada_hora" | "diaria" | "semanal", id} en todas sus llamadas: solo esas cuentan en ella y lo que llega sin el campo es plática (platica_aparte). Sin el campo, la forma vieja empieza con ver_memoria("cuaderno", {corrida: "juicio" | "diaria" | "semanal"}) y cuenta todo hasta 20 minutos sin llamadas.' };
  }
  const l = st.get('conflictos', []).filter(c => c.t >= t0);
  return { tipo: tipo, desde: fecha_(t0), total: l.length, conflictos: l.slice(0, max).map(c => ({ fecha: fecha_(c.t), id_hilo: c.hilo, remitente: c.remitente, politicas: c.politicas, gano: c.gano })) };
}
